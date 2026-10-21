"""Service d'authentification et de comptes (RESILIENCE-ALPHA).

- inscription / connexion (mots de passe hachés scrypt, jamais en clair)
- jeton JWT HS256 court, vérifié aussi par payment-api (secret partagé JWT_SECRET)
- compte bancaire fictif rattaché à l'utilisateur, avec solde et dépôt fictif
Aucune donnée réelle : tout l'environnement est fictif.
"""
import asyncio
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

import asyncpg
import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

log = logging.getLogger("auth")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

JWT_SECRET = os.environ["JWT_SECRET"]  # obligatoire : le service refuse de démarrer sans
JWT_ALG = "HS256"
JWT_TTL_MIN = int(os.environ.get("JWT_TTL_MIN", "60"))
MAX_DEPOSIT = Decimal(os.environ.get("MAX_DEPOSIT", "10000"))
MAX_BALANCE = Decimal("1000000")
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,40}$")

# anti brute-force : 5 échecs / 5 min par (ip, utilisateur), en mémoire
_FAILS: dict[str, list[float]] = {}
FAIL_LIMIT, FAIL_WINDOW = 5, 300

START = time.time()
pool: Optional[asyncpg.Pool] = None
metrics = {"register": 0, "login_ok": 0, "login_fail": 0, "deposit": 0}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(40) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    role VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    dsn = "postgresql://{u}:{p}@{h}:{port}/{db}".format(
        u=os.environ["POSTGRES_USER"], p=os.environ["POSTGRES_PASSWORD"],
        h=os.environ.get("POSTGRES_HOST", "postgres"),
        port=os.environ.get("POSTGRES_PORT", "5432"), db=os.environ["POSTGRES_DB"],
    )
    # la base peut démarrer un peu après : on réessaie
    for attempt in range(30):
        try:
            pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5, command_timeout=5)
            break
        except Exception as exc:  # noqa: BLE001
            log.warning("PostgreSQL indisponible (%s), nouvel essai", exc)
            await asyncio.sleep(2)
    else:
        raise RuntimeError("PostgreSQL injoignable")
    async with pool.acquire() as c:
        await c.execute(SCHEMA)
    yield
    await pool.close()


app = FastAPI(title="Resilience-Alpha Auth", version="1.0.0", lifespan=lifespan,
              docs_url=None, redoc_url=None, openapi_url=None)


# ---------- utilitaires ----------
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, dk_hex = stored.split("$")
        dk = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:  # noqa: BLE001
        return False


def make_token(user_id: str, username: str, account_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "usr": username, "acct": account_id,
         "iat": now, "exp": now + timedelta(minutes=JWT_TTL_MIN)},
        JWT_SECRET, algorithm=JWT_ALG,
    )


def client_ip(req: Request) -> str:
    return req.headers.get("x-real-ip") or (req.client.host if req.client else "unknown")


def money(v) -> Decimal:
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


async def audit(conn, event: str, severity: str, details: dict):
    await conn.execute(
        "INSERT INTO service_audit_logs (service_name, event_type, severity, details) VALUES ('auth-service', $1, $2, $3::jsonb)",
        event, severity, json.dumps(details),
    )


async def current_user(request: Request) -> dict:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentification requise")
    try:
        return jwt.decode(header[7:], JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton invalide ou expiré")


# ---------- schémas ----------
class Credentials(BaseModel):
    username: str = Field(..., min_length=3, max_length=40)
    password: str = Field(..., min_length=8, max_length=128)


class RegisterRequest(Credentials):
    holder_name: str = Field(..., min_length=2, max_length=120)


class DepositRequest(BaseModel):
    amount: float = Field(..., gt=0)


# ---------- erreurs homogènes ----------
@app.exception_handler(HTTPException)
async def http_exc(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": f"HTTP_{exc.status_code}", "message": exc.detail})


# ---------- supervision ----------
@app.get("/health")
async def health():
    try:
        async with pool.acquire() as c:
            await c.fetchval("SELECT 1")
        return {"status": "UP", "service": "auth", "uptime_seconds": round(time.time() - START, 1)}
    except Exception:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"status": "DOWN", "service": "auth"})


@app.get("/metrics", response_class=PlainTextResponse)
async def prom_metrics():
    lines = [f'auth_events_total{{event="{k}"}} {v}' for k, v in metrics.items()]
    lines.append(f"auth_uptime_seconds {round(time.time() - START, 1)}")
    return "\n".join(lines) + "\n"


# ---------- comptes ----------
def new_account_number() -> str:
    return "FR76" + "".join(secrets.choice("0123456789") for _ in range(23))


@app.post("/register", status_code=201)
async def register(body: RegisterRequest, req: Request):
    if not USERNAME_RE.match(body.username):
        raise HTTPException(422, "Identifiant : 3 à 40 caractères (lettres, chiffres, _ . -)")
    pw_hash = await asyncio.to_thread(hash_password, body.password)
    async with pool.acquire() as c:
        async with c.transaction():
            if await c.fetchval("SELECT 1 FROM users WHERE username = $1", body.username.lower()):
                raise HTTPException(409, "Identifiant déjà utilisé")
            acct = await c.fetchrow(
                "INSERT INTO accounts (account_number, holder_name, balance, currency, status) "
                "VALUES ($1, $2, 0, 'EUR', 'ACTIVE') RETURNING id, account_number",
                new_account_number(), body.holder_name.strip(),
            )
            user = await c.fetchrow(
                "INSERT INTO users (username, password_hash, account_id) VALUES ($1, $2, $3) RETURNING id",
                body.username.lower(), pw_hash, acct["id"],
            )
            await audit(c, "USER_REGISTERED", "INFO", {"username": body.username.lower(), "ip": client_ip(req)})
    metrics["register"] += 1
    token = make_token(str(user["id"]), body.username.lower(), str(acct["id"]))
    return {"token": token, "token_type": "bearer", "expires_in": JWT_TTL_MIN * 60}


@app.post("/login")
async def login(body: Credentials, req: Request):
    username = body.username.lower()
    key = f"{client_ip(req)}|{username}"
    now = time.time()
    recent = [t for t in _FAILS.get(key, []) if now - t < FAIL_WINDOW]
    if len(recent) >= FAIL_LIMIT:
        async with pool.acquire() as c:
            await audit(c, "LOGIN_LOCKED", "WARNING", {"username": username, "ip": client_ip(req)})
        raise HTTPException(429, "Trop de tentatives, réessayez dans quelques minutes")

    async with pool.acquire() as c:
        row = await c.fetchrow("SELECT id, password_hash, account_id FROM users WHERE username = $1", username)
        # on calcule toujours un hash pour ne pas révéler si l'utilisateur existe
        ok = await asyncio.to_thread(verify_password, body.password, row["password_hash"] if row else "scrypt$00$00")
        if not (row and ok):
            _FAILS[key] = recent + [now]
            metrics["login_fail"] += 1
            await audit(c, "LOGIN_FAILED", "WARNING", {"username": username, "ip": client_ip(req)})
            raise HTTPException(401, "Identifiant ou mot de passe incorrect")
    _FAILS.pop(key, None)
    metrics["login_ok"] += 1
    return {"token": make_token(str(row["id"]), username, str(row["account_id"])),
            "token_type": "bearer", "expires_in": JWT_TTL_MIN * 60}


async def load_account(c, claims: dict):
    row = await c.fetchrow(
        "SELECT u.username, a.id, a.account_number, a.holder_name, a.balance, a.currency, a.status "
        "FROM users u JOIN accounts a ON a.id = u.account_id WHERE u.id = $1::uuid",
        claims["sub"],
    )
    if not row:
        raise HTTPException(401, "Utilisateur inconnu")
    return row


def account_json(row) -> dict:
    return {"username": row["username"], "holder_name": row["holder_name"],
            "account_number": row["account_number"], "balance": float(row["balance"]),
            "currency": row["currency"], "status": row["status"]}


@app.get("/me")
async def me(claims: dict = Depends(current_user)):
    async with pool.acquire() as c:
        return account_json(await load_account(c, claims))


@app.post("/deposit")
async def deposit(body: DepositRequest, req: Request, claims: dict = Depends(current_user)):
    amount = money(body.amount)
    if amount <= 0 or amount > MAX_DEPOSIT:
        raise HTTPException(422, f"Montant de dépôt entre 0,01 et {MAX_DEPOSIT} EUR")
    async with pool.acquire() as c:
        async with c.transaction():
            acct = await c.fetchrow(
                "SELECT a.id, a.balance, a.status FROM users u JOIN accounts a ON a.id = u.account_id "
                "WHERE u.id = $1::uuid FOR UPDATE OF a", claims["sub"])
            if not acct:
                raise HTTPException(401, "Utilisateur inconnu")
            if acct["status"] != "ACTIVE":
                raise HTTPException(403, "Compte non actif")
            if acct["balance"] + amount > MAX_BALANCE:
                raise HTTPException(422, "Plafond de solde dépassé")
            await c.execute("UPDATE accounts SET balance = balance + $1 WHERE id = $2", amount, acct["id"])
            await audit(c, "ACCOUNT_DEPOSIT", "INFO",
                        {"username": claims["usr"], "amount": float(amount), "ip": client_ip(req)})
        metrics["deposit"] += 1
        return account_json(await load_account(c, claims))


@app.get("/me/transactions")
async def my_transactions(limit: int = 20, claims: dict = Depends(current_user)):
    limit = max(1, min(limit, 100))
    async with pool.acquire() as c:
        acct = await load_account(c, claims)
        rows = await c.fetch(
            "SELECT id, reference, amount, currency, status, error_code, created_at "
            "FROM transactions WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2", acct["id"], limit)
    return [{"id": str(r["id"]), "reference": r["reference"], "amount": float(r["amount"]),
             "currency": r["currency"], "status": r["status"], "error_code": r["error_code"],
             "created_at": r["created_at"].isoformat()} for r in rows]

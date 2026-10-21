from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    PROJECT_NAME: str = "Resilience-Alpha Payment Gateway"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "production"
    
    # Configuration PostgreSQL (secrets injectés via SOPS / environnement)
    POSTGRES_USER: str = "resilience_user"
    POSTGRES_PASSWORD: str
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "resilience_db"

    @property
    def async_database_url(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Authentification : secret JWT partagé avec le service auth
    JWT_SECRET: Optional[str] = None
    REQUIRE_AUTH: bool = False

    # Dégradation simulée / injection de pannes (pour tests Red Team et chaos engineering)
    CHAOS_MODE_ENABLED: bool = False
    MOCK_LATENCY_MS: int = 25

    # Clé secrète / token de sécurisation des endpoints de remédiation WAF (/waf/block, /waf/unblock)
    REMEDIATION_TOKEN: str

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

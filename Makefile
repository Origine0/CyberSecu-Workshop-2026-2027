# Commandes courantes de la stack (à lancer depuis la racine du dépôt)
COMPOSE := docker compose
# Ansible tourne dans le conteneur remediation (même environnement que le futur moteur) : rien à installer sur la machine
REMED := docker compose exec -T remediation ansible-playbook /ansible/playbooks
WAF_PORT ?= 8082

.PHONY: help env pull up reload ps logs check restart chaos security-check secret-scan block unblock block-test restore down

help: ## affiche cette aide
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-15s %s\n", $$1, $$2}'

env: ## crée le .env à partir de .env.example s'il n'existe pas
	@test -f .env || { cp .env.example .env; echo ".env créé : définir GRAFANA_ADMIN_PASSWORD"; }

pull: ## télécharge toutes les images (à faire tant qu'on a Internet)
	$(COMPOSE) pull --ignore-buildable
	$(COMPOSE) build

up: env ## démarre toute la stack
	$(COMPOSE) up -d

reload: ## après un git pull : recrée les conteneurs (sinon ils gardent les anciens dossiers montés)
	$(COMPOSE) up -d --force-recreate --wait

ps: ## état des services
	$(COMPOSE) ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'

logs: ## logs d'un service : make logs SERVICE=payment-api
	$(COMPOSE) logs -f --tail 50 $(SERVICE)

check: ## vérifie la config, la santé des services et les ports
	@$(COMPOSE) config -q && echo "config compose : OK"
	@n=$$($(COMPOSE) ps --format '{{.Health}}' | grep -vc '^healthy$$'); \
	  if [ "$$n" = 0 ]; then echo "services : tous healthy"; else echo "services : $$n pas healthy"; $(COMPOSE) ps --format '{{.Service}} {{.Health}}' | grep -v ' healthy$$'; exit 1; fi
	@test "$$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$(WAF_PORT)/api/health)" = 200 && echo "API via le waf : OK"
	@test "$$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$(WAF_PORT)/api/docs)" = 403 && echo "/api/docs bloqué : OK"
	@for p in 5432 8000 9090 3100; do ! nc -z -w 2 localhost $$p 2>/dev/null || { echo "port $$p ouvert : ANOMALIE"; exit 1; }; done; echo "ports internes non publiés : OK"
	@for p in restart_service block_source restore_database; do $(REMED)/$$p.yml --syntax-check >/dev/null || exit 1; done; echo "playbooks ansible : syntaxe OK"

restart: ## redémarre un service via Ansible : make restart SERVICE=payment-api
	@test -n "$(SERVICE)" || { echo "préciser SERVICE=..."; exit 1; }
	$(REMED)/restart_service.yml -e service=$(SERVICE)

chaos: ## simule une panne puis la répare : make chaos [SERVICE=payment-api] [PANNE=20]
	@bash scripts/chaos.sh $(or $(SERVICE),payment-api) $(or $(PANNE),20)

security-check: ## vérifie l'exposition, l'isolation et les droits des proxys
	@bash scripts/security-check.sh

secret-scan: ## vérifie qu'aucun secret n'est en clair dans le dépôt (et signale l'historique Git)
	@bash scripts/secret-scan.sh

block: ## bloque une source dans le WAF : make block TYPE=user_agent VALUE=sqlmap (TYPE : ip, user_agent, ratelimit)
	$(REMED)/block_source.yml -e block_type=$(TYPE) -e value=$(VALUE)

unblock: ## retire une règle de blocage : make unblock TYPE=user_agent VALUE=sqlmap
	$(REMED)/block_source.yml -e block_type=$(TYPE) -e value=$(VALUE) -e state=absent

block-test: ## vérifie que le WAF applique la liste de blocage (bloque puis débloque un User-Agent de test)
	@$(REMED)/block_source.yml -e block_type=user_agent -e value=test-blocage; rc=$$?; \
	  $(REMED)/block_source.yml -e block_type=user_agent -e value=test-blocage -e state=absent -e verify_payment=false >/dev/null; \
	  if [ $$rc = 0 ]; then echo "block-test : le WAF applique la liste de blocage"; else echo "block-test : le WAF n'applique pas la liste de blocage"; fi; exit $$rc

restore: ## contrôle d'intégrité de la base, redémarrage de l'API, preuve de reprise
	$(REMED)/restore_database.yml

down: ## arrête la stack (garde les volumes et les données)
	$(COMPOSE) down

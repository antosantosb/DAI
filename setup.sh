#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
#  PGU-TUB — Setup completo (git clone → tudo a funcionar)
#  Uso: chmod +x setup.sh && sudo ./setup.sh
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[PGU]${NC} $*"; }
warn() { echo -e "${YELLOW}[PGU]${NC} $*"; }
err()  { echo -e "${RED}[PGU]${NC} $*" >&2; }

# ─── Must run as root ───
if [ "$EUID" -ne 0 ]; then
    err "Executa com sudo: sudo ./setup.sh"
    exit 1
fi

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
log "Diretório do projeto: $PROJECT_DIR"

# ──────────────────────────────────────────────────────────────────────
# 1. DEPENDÊNCIAS DO SISTEMA
# ──────────────────────────────────────────────────────────────────────
log "A verificar dependências..."

if ! command -v docker &>/dev/null; then
    log "A instalar Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    log "Docker instalado."
else
    log "Docker já instalado."
fi

if ! command -v docker compose &>/dev/null && ! docker compose version &>/dev/null; then
    err "docker compose não disponível. Atualiza o Docker."
    exit 1
fi

if ! command -v certbot &>/dev/null; then
    log "A instalar Certbot..."
    apt-get update -qq && apt-get install -y -qq certbot
    log "Certbot instalado."
else
    log "Certbot já instalado."
fi

# ──────────────────────────────────────────────────────────────────────
# 2. GERAR .env
# ──────────────────────────────────────────────────────────────────────
gen_password() { openssl rand -base64 24 | tr -d '/+='; }
gen_fernet()   { python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || openssl rand -base64 32; }

if [ ! -f .env ]; then
    log "A gerar .env com passwords seguras..."
    cp .env.example .env

    # Substituir todos os CHANGE_ME por passwords geradas
    sed -i "s|DW_PASSWORD=CHANGE_ME|DW_PASSWORD=$(gen_password)|" .env
    sed -i "s|TOOLS_DB_PASSWORD=CHANGE_ME|TOOLS_DB_PASSWORD=$(gen_password)|" .env
    sed -i "s|MONGO_PASSWORD=CHANGE_ME|MONGO_PASSWORD=$(gen_password)|" .env
    sed -i "s|AIRFLOW_FERNET_KEY=CHANGE_ME|AIRFLOW_FERNET_KEY=$(gen_fernet)|" .env
    sed -i "s|AIRFLOW_SECRET_KEY=CHANGE_ME|AIRFLOW_SECRET_KEY=$(gen_password)|" .env
    sed -i "s|AIRFLOW_ADMIN_PASSWORD=CHANGE_ME|AIRFLOW_ADMIN_PASSWORD=$(gen_password)|" .env
    sed -i "s|_AIRFLOW_WWW_USER_PASSWORD=CHANGE_ME|_AIRFLOW_WWW_USER_PASSWORD=$(gen_password)|" .env
    sed -i "s|IAM_ADMIN_PASSWORD=CHANGE_ME|IAM_ADMIN_PASSWORD=$(gen_password)|" .env
    sed -i "s|NIFI_PASSWORD=CHANGE_ME|NIFI_PASSWORD=$(gen_password)Aa1!|" .env  # NiFi requer complexidade
    sed -i "s|PGU_INTERNAL_API_KEY=CHANGE_ME|PGU_INTERNAL_API_KEY=$(gen_password)|" .env

    warn "Ficheiro .env gerado. Verifica DOMAIN e CERTBOT_EMAIL antes de continuar!"
    warn "  nano .env"
    log ""
    log "Passwords geradas automaticamente. Guardadas apenas em .env."
    log ""
else
    log ".env já existe, a manter."
fi

# Ler variáveis
set -a; source .env; set +a

# Validar domínio e email
if [ -z "${DOMAIN:-}" ] || [ "$DOMAIN" = "pgu-tub.switzerlandnorth.cloudapp.azure.com" ]; then
    warn "DOMAIN definido como: ${DOMAIN:-<vazio>}"
fi

if [ -z "${CERTBOT_EMAIL:-}" ] || [ "$CERTBOT_EMAIL" = "admin@example.com" ]; then
    warn "CERTBOT_EMAIL não está configurado no .env — a usar --register-unsafely-without-email"
    CERTBOT_EMAIL=""
fi

# ──────────────────────────────────────────────────────────────────────
# 3. CERTIFICADO SSL (Let's Encrypt)
# ──────────────────────────────────────────────────────────────────────
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

if [ ! -f "$CERT_PATH" ]; then
    log "A obter certificado SSL para $DOMAIN..."

    # Garantir que a porta 80 está livre
    if ss -tlnp | grep -q ':80 '; then
        warn "Porta 80 ocupada. A parar containers..."
        docker compose down 2>/dev/null || true
    fi

    EMAIL_FLAG=""
    if [ -n "$CERTBOT_EMAIL" ]; then
        EMAIL_FLAG="--email $CERTBOT_EMAIL"
    else
        EMAIL_FLAG="--register-unsafely-without-email"
    fi

    certbot certonly --standalone \
        -d "$DOMAIN" \
        $EMAIL_FLAG \
        --agree-tos \
        --non-interactive

    log "Certificado SSL obtido com sucesso!"
else
    log "Certificado SSL já existe."
fi

# ──────────────────────────────────────────────────────────────────────
# 4. RENOVAÇÃO AUTOMÁTICA (cron)
# ──────────────────────────────────────────────────────────────────────
CRON_JOB="0 3 * * * certbot renew --quiet --deploy-hook 'docker restart pgu-web'"
if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
    log "A configurar renovação automática de SSL..."
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    log "Cron configurado: renovação diária às 3h."
else
    log "Cron de renovação já configurado."
fi

# ──────────────────────────────────────────────────────────────────────
# 5. BUILD & START
# ──────────────────────────────────────────────────────────────────────
log "A construir e iniciar todos os serviços..."
docker compose build
docker compose up -d

log ""
log "════════════════════════════════════════════════════════"
log "  PGU-TUB está a correr!"
log "════════════════════════════════════════════════════════"
log ""
log "  Frontend:   https://$DOMAIN"
log "  API:        https://$DOMAIN/api/"
log "  Keycloak:   http://$DOMAIN:8080"
log "  Metabase:   http://$DOMAIN:3000"
log "  NiFi:       https://$DOMAIN:8443"
log "  Airflow:    http://$DOMAIN:8082"
log ""
log "  Credenciais guardadas em: $PROJECT_DIR/.env"
log ""
log "  Ver logs:   docker compose logs -f"
log "  Parar:      docker compose down"
log "════════════════════════════════════════════════════════"

#!/usr/bin/env bash
# ============================================================
# PGU-TUB · init-env-secrets.sh
# ============================================================
# Gera passwords/secrets aleatorios e substitui os "CHANGE_ME"
# no ficheiro .env. Idempotente: so substitui valores com CHANGE_ME,
# preserva os ja' definidos.
#
# Uso (a partir da raiz do projecto):
#   ./scripts/init-env-secrets.sh
#
# Pre-requisitos:
#   - openssl instalado
#   - .env existente (cp .env.example .env primeiro)
# ============================================================
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"

if [ ! -f "$ENV_FILE" ]; then
    echo "ERRO: $ENV_FILE nao existe. Cria-o primeiro com:"
    echo "  cp .env.example .env"
    exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
    echo "ERRO: openssl nao instalado. Instala com:"
    echo "  sudo apt install -y openssl"
    exit 1
fi

# Variaveis que devem receber password aleatoria (chave -> tamanho).
# Tamanho em bytes ANTES do base64 (32 bytes -> ~43 chars base64).
declare -A SECRETS=(
    [DW_PASSWORD]=24
    [TOOLS_DB_PASSWORD]=24
    [MONGO_PASSWORD]=24
    [IAM_ADMIN_PASSWORD]=24
    [NIFI_PASSWORD]=24
    [PGU_INTERNAL_API_KEY]=32
    [MQTT_BACKEND_PASSWORD]=24
    [MQTT_SIMULATOR_PASSWORD]=24
    [MQTT_NIFI_PASSWORD]=24
    [MQTT_BUS_PASSWORD]=24
    [MINIO_ROOT_PASSWORD]=24
    [PGU_TICKET_SALT]=32
)

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
DIM='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}A gerar secrets aleatorios em $ENV_FILE...${NC}"
echo

# Backup do .env actual
cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%s)" 2>/dev/null || true

generated=0
skipped=0
added=0

gen_secret() {
    local bytes="$1"
    # base64, sem chars problematicos para shell/docker-compose ($ / + = \ ")
    openssl rand -base64 "$((bytes * 2))" | tr -d '/+=\\"$\n' | head -c "$((bytes + 8))"
}

for key in "${!SECRETS[@]}"; do
    bytes="${SECRETS[$key]}"
    new_value="$(gen_secret "$bytes")"

    if grep -qE "^${key}=" "$ENV_FILE"; then
        current=$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d'=' -f2-)
        if [ "$current" = "CHANGE_ME" ] || [ -z "$current" ]; then
            # sed in-place — usa | como delimitador para evitar conflito com /
            sed -i "s|^${key}=.*|${key}=${new_value}|" "$ENV_FILE"
            echo -e "  ${GREEN}✔${NC} ${key}"
            generated=$((generated + 1))
        else
            echo -e "  ${DIM}–${NC} ${key} ${DIM}(ja' definido, preservado)${NC}"
            skipped=$((skipped + 1))
        fi
    else
        # Variavel nao existe no .env — adiciona no fim
        echo "${key}=${new_value}" >> "$ENV_FILE"
        echo -e "  ${YELLOW}+${NC} ${key} ${DIM}(adicionado)${NC}"
        added=$((added + 1))
    fi
done

echo
echo -e "${BOLD}Resumo:${NC}"
echo -e "  ${GREEN}${generated}${NC} gerados, ${DIM}${skipped} preservados${NC}, ${YELLOW}${added}${NC} adicionados"
echo
echo -e "${BOLD}Proximos passos:${NC}"
echo "  1. nano $ENV_FILE  # revê DOMAIN, EXTERNAL_PORT, CERTBOT_EMAIL"
echo "  2. sudo ./pgu-setup.sh prod"
echo
echo -e "${DIM}Backup do .env original em: ${ENV_FILE}.bak.*${NC}"

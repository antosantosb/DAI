#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
#  PGU-TUB — Setup Unificado (local + produção)
#
#  Deteta automaticamente o ambiente:
#    LOCAL:  sem DOMAIN no .env → portas expostas, sem SSL, dev values
#    PROD:   DOMAIN no .env    → SSL, nginx proxy, passwords seguras
#
#  Uso:
#    bash pgu-setup.sh              Setup completo (com chatbot IA)
#    bash pgu-setup.sh --no-ai      Setup sem Ollama (poupa ~5GB RAM)
#    bash pgu-setup.sh rebuild      Rebuild sem cache
#    bash pgu-setup.sh restart      Reiniciar containers
#    bash pgu-setup.sh down         Parar tudo
#    bash pgu-setup.sh logs [svc]   Ver logs
#    bash pgu-setup.sh status       Estado dos containers
#    bash pgu-setup.sh nuke         Apagar tudo incluindo volumes
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── Cores e Símbolos ────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

TICK="${GREEN}✔${NC}"
CROSS="${RED}✘${NC}"
WARN="${YELLOW}!${NC}"
ARROW="${CYAN}→${NC}"
DOTS="${DIM}···${NC}"

step_ok()   { echo -e "  ${TICK}  $*"; }
step_fail() { echo -e "  ${CROSS}  $*"; }
step_warn() { echo -e "  ${WARN}  $*"; }
step_info() { echo -e "  ${ARROW}  $*"; }
step_skip() { echo -e "  ${DIM}–  $*${NC}"; }
header()    { echo -e "\n${BOLD}${CYAN}  $*${NC}"; echo -e "  ${DIM}$(printf '%.0s─' $(seq 1 50))${NC}"; }
divider()   { echo -e "  ${DIM}$(printf '%.0s─' $(seq 1 54))${NC}"; }

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
# Aceitar flags como primeiro argumento (ex: `bash pgu-setup.sh --no-ai`)
# sem que sejam interpretadas como sub-comandos desconhecidos.
if [[ "${1:-}" =~ ^-- ]]; then
    CMD="setup"
else
    CMD="${1:-setup}"
fi
SECONDS=0

# Sprint 7 (chatbot IA): activar o profile `ai` por defeito para arrancar
# Ollama (LLM local) + ollama-init (pull do modelo). Para desativar, exportar
# DISABLE_AI=true ou passar `--no-ai`. Sem isto, o chatbot devolve erro
# (`Recurso nao encontrado`) porque o container Ollama nem sequer existe.
ENABLE_AI=true
for arg in "$@"; do
    if [ "$arg" = "--no-ai" ]; then
        ENABLE_AI=false
    fi
done
if [ "${DISABLE_AI:-}" = "true" ]; then
    ENABLE_AI=false
fi
if [ "$ENABLE_AI" = "true" ]; then
    export COMPOSE_PROFILES="${COMPOSE_PROFILES:-ai}"
fi

# ─── Detecção de Ambiente ────────────────────────────────────────────
detect_env() {
    if [ -f .env ]; then
        local domain
        domain=$(grep -E '^DOMAIN=' .env 2>/dev/null | cut -d= -f2 | tr -d ' "'"'" || true)
        if [ -n "$domain" ] && [ "$domain" != "" ]; then
            ENV_MODE="production"
            DOMAIN="$domain"
        else
            ENV_MODE="local"
            DOMAIN=""
        fi
    else
        ENV_MODE="local"
        DOMAIN=""
    fi
}

detect_env

# ─── Compose wrapper ─────────────────────────────────────────────────
compose_cmd() {
    if [ "$ENV_MODE" = "production" ]; then
        docker compose -f docker-compose.yml "$@"
    else
        docker compose "$@"
    fi
}

# ─── Comandos rápidos ─────────────────────────────────────────────────
case "$CMD" in
    down)
        echo ""
        header "A parar todos os servicos"
        compose_cmd down
        step_ok "Todos os servicos parados."
        echo ""
        exit 0
        ;;
    restart)
        echo ""
        header "A reiniciar servicos"
        compose_cmd restart
        step_ok "Servicos reiniciados."
        echo ""
        exit 0
        ;;
    logs)
        compose_cmd logs -f --tail=100 "${2:-}"
        exit 0
        ;;
    status)
        echo ""
        header "Estado dos Containers"
        echo ""
        compose_cmd ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        exit 0
        ;;
    rebuild)
        echo ""
        header "Rebuild completo (${ENV_MODE})"
        compose_cmd down
        step_info "A construir imagens sem cache..."
        compose_cmd build --no-cache
        compose_cmd up -d
        step_ok "Rebuild concluido."
        echo ""
        exit 0
        ;;
    ai-pull)
        # Sprint 7 (chatbot IA): puxar modelo manualmente se o auto-pull
        # do setup falhou (rede, espaco em disco) ou se queres trocar de modelo.
        OLLAMA_MODEL_NAME="${OLLAMA_MODEL:-${2:-gemma2:2b-instruct-q4_K_M}}"
        echo ""
        header "Pull manual do modelo Ollama"
        if ! docker ps --format '{{.Names}}' | grep -q '^ollama$'; then
            step_fail "Container ollama nao esta a correr"
            step_info "Corre primeiro: bash pgu-setup.sh setup"
            exit 1
        fi
        step_info "A puxar ${OLLAMA_MODEL_NAME} (pode demorar uns minutos)..."
        docker exec -it ollama ollama pull "$OLLAMA_MODEL_NAME"
        step_ok "Pull concluido"
        echo ""
        exit 0
        ;;
    nuke)
        echo ""
        echo -e "  ${RED}${BOLD}ATENCAO${NC}  Isto apaga TODOS os volumes (BD, Keycloak, NiFi, etc.)!"
        echo ""
        read -p "  Tens a certeza? (y/N) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            compose_cmd down -v
            step_ok "Volumes apagados. Proximo setup comeca do zero."
        else
            step_skip "Cancelado."
        fi
        echo ""
        exit 0
        ;;
    setup)
        ;;
    *)
        echo -e "\n  ${CROSS} Comando desconhecido: ${BOLD}$CMD${NC}"
        echo ""
        echo "  Uso: bash pgu-setup.sh [comando]"
        echo ""
        echo "  Comandos:"
        echo "    setup     Setup completo (default, com chatbot IA)"
        echo "    --no-ai   Setup sem Ollama (passar como flag ao setup)"
        echo "    rebuild   Rebuild sem cache"
        echo "    restart   Reiniciar containers"
        echo "    down      Parar tudo"
        echo "    logs      Ver logs (ex: logs keycloak)"
        echo "    status    Estado dos containers"
        echo "    ai-pull   Puxar modelo Ollama (ex: ai-pull gemma2:2b)"
        echo "    nuke      Reset total (apaga dados!)"
        echo ""
        exit 1
        ;;
esac

# ══════════════════════════════════════════════════════════════════════
#  SETUP COMPLETO
# ══════════════════════════════════════════════════════════════════════
clear 2>/dev/null || true

if [ "$ENV_MODE" = "local" ]; then
    ENV_LABEL="LOCAL"
    ENV_COLOR="${GREEN}"
else
    ENV_LABEL="PRODUCAO"
    ENV_COLOR="${RED}"
fi

echo ""
echo -e "  ${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "  ${BOLD}║                                                      ║${NC}"
echo -e "  ${BOLD}║   ${CYAN}PGU-TUB${NC}${BOLD}  Plataforma de Gestao Urbana            ║${NC}"
echo -e "  ${BOLD}║   ${DIM}Transportes Urbanos de Braga${NC}${BOLD}                     ║${NC}"
echo -e "  ${BOLD}║                                                      ║${NC}"
echo -e "  ${BOLD}║   Ambiente: ${ENV_COLOR}${ENV_LABEL}${NC}${BOLD}$(printf '%*s' $((37 - ${#ENV_LABEL})) '')║${NC}"
echo -e "  ${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ──────────────────────────────────────────────────────────────────────
# STEP 1 — Prerequisitos
# ──────────────────────────────────────────────────────────────────────
header "1/7  Prerequisitos"

# Docker
if ! command -v docker &>/dev/null; then
    if [ "$ENV_MODE" = "production" ]; then
        step_info "A instalar Docker..."
        curl -fsSL https://get.docker.com | sh
        systemctl enable --now docker
        step_ok "Docker instalado"
    else
        step_fail "Docker nao encontrado"
        echo -e "       Instala o Docker Desktop: ${CYAN}https://docker.com/products/docker-desktop${NC}"
        exit 1
    fi
fi

if ! docker info &>/dev/null; then
    step_fail "Docker nao esta a correr"
    [ "$ENV_MODE" = "local" ] && echo -e "       Inicia o Docker Desktop primeiro."
    exit 1
fi
step_ok "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"

# Node (necessário para parsear JSON do NiFi)
NODE_BIN=""
if command -v node &>/dev/null; then
    NODE_BIN="node"
elif command -v node.exe &>/dev/null; then
    NODE_BIN="node.exe"
elif [ -f "/c/Program Files/nodejs/node.exe" ]; then
    NODE_BIN="/c/Program Files/nodejs/node.exe"
elif [ -f "/mnt/c/Program Files/nodejs/node.exe" ]; then
    NODE_BIN="/mnt/c/Program Files/nodejs/node.exe"
fi

if [ -n "$NODE_BIN" ]; then
    NODE_VERSION=$("$NODE_BIN" -v 2>/dev/null || echo "?")
    step_ok "Node.js $NODE_VERSION"
else
    step_warn "Node.js nao encontrado — configuracao automatica do NiFi pode falhar"
fi

# ──────────────────────────────────────────────────────────────────────
# STEP 2 — Variáveis de ambiente
# ──────────────────────────────────────────────────────────────────────
header "2/7  Variaveis de ambiente"

gen_password() { openssl rand -base64 24 | tr -d '/+='; }
# gen_password_complex: variante para servicos com politica de complexidade
# (ex.: NiFi exige >=12 chars + maiuscula + minuscula + digito + especial).
# Estrategia: base64 (32 chars com mai/min/dig com probabilidade ~100%) +
# sufixo "Aa1!" como cinto e suspensorios (garante presenca dos 4 tipos).
gen_password_complex() { echo "$(gen_password)Aa1!"; }
gen_fernet()   { python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || openssl rand -base64 32; }

if [ ! -f .env ]; then
    if [ "$ENV_MODE" = "production" ]; then
        step_info "A gerar .env de producao com passwords seguras..."
        cp .env.example .env
        sed -i "s|DW_PASSWORD=CHANGE_ME|DW_PASSWORD=$(gen_password)|" .env
        sed -i "s|TOOLS_DB_PASSWORD=CHANGE_ME|TOOLS_DB_PASSWORD=$(gen_password)|" .env
        sed -i "s|MONGO_PASSWORD=CHANGE_ME|MONGO_PASSWORD=$(gen_password)|" .env
        sed -i "s|IAM_ADMIN_PASSWORD=CHANGE_ME|IAM_ADMIN_PASSWORD=$(gen_password)|" .env
        sed -i "s|NIFI_PASSWORD=CHANGE_ME|NIFI_PASSWORD=$(gen_password_complex)|" .env
        sed -i "s|PGU_INTERNAL_API_KEY=CHANGE_ME|PGU_INTERNAL_API_KEY=$(gen_password)|" .env
        # Sprint -1 (SEC-1) — Mosquitto auth por servico
        sed -i "s|MQTT_BACKEND_PASSWORD=CHANGE_ME|MQTT_BACKEND_PASSWORD=$(gen_password)|" .env
        sed -i "s|MQTT_SIMULATOR_PASSWORD=CHANGE_ME|MQTT_SIMULATOR_PASSWORD=$(gen_password)|" .env
        sed -i "s|MQTT_NIFI_PASSWORD=CHANGE_ME|MQTT_NIFI_PASSWORD=$(gen_password)|" .env
        sed -i "s|MQTT_BUS_PASSWORD=CHANGE_ME|MQTT_BUS_PASSWORD=$(gen_password)|" .env
        # Sprint 0 (F0): MinIO root password
        sed -i "s|MINIO_ROOT_PASSWORD=CHANGE_ME|MINIO_ROOT_PASSWORD=$(gen_password)|" .env
        step_ok ".env de producao criado"
        step_warn "Verifica DOMAIN e CERTBOT_EMAIL no .env antes de continuar!"
    else
        step_info "A gerar .env de desenvolvimento com passwords aleatorias..."
        # Sprint -1 (follow-up): passwords dev tambem aleatorias para nao
        # ficar nada hardcoded no repo (eliminar incidentes GitGuardian e
        # qualquer reuso acidental em prod). Geradas localmente; ficam no
        # .env (gitignored) e sao impressas uma vez no fim deste bloco.
        DEV_DW_PASS=$(gen_password)
        DEV_TOOLS_PASS=$(gen_password)
        DEV_MONGO_PASS=$(gen_password)
        DEV_IAM_PASS=$(gen_password)
        DEV_NIFI_PASS=$(gen_password_complex)
        DEV_API_KEY=$(gen_password)
        DEV_MQTT_BACKEND=$(gen_password)
        DEV_MQTT_SIM=$(gen_password)
        DEV_MQTT_NIFI=$(gen_password)
        DEV_MQTT_BUS=$(gen_password)
        DEV_MINIO_PASS=$(gen_password)
        cat > .env << ENVEOF
# PGU-TUB — Desenvolvimento local (gerado por pgu-setup.sh em $(date '+%Y-%m-%d %H:%M'))
# Vazio = ambiente local (sem domínio = sem SSL, sem nginx)
DOMAIN=
DW_USER=pgu_dw
DW_PASSWORD=$DEV_DW_PASS
DW_NAME=pgu_datawarehouse
TOOLS_DB_USER=tools_admin
TOOLS_DB_PASSWORD=$DEV_TOOLS_PASS
MONGO_USER=pgu_mongo
MONGO_PASSWORD=$DEV_MONGO_PASS
KEYCLOAK_DB_NAME=keycloak_db
IAM_ADMIN_USER=admin
IAM_ADMIN_PASSWORD=$DEV_IAM_PASS
METABASE_DB_NAME=metabase_db
NIFI_USERNAME=admin
NIFI_PASSWORD=$DEV_NIFI_PASS
PGU_INTERNAL_API_KEY=$DEV_API_KEY

# Sprint -1 (SEC-1): Mosquitto auth por servico
MQTT_BACKEND_PASSWORD=$DEV_MQTT_BACKEND
MQTT_SIMULATOR_PASSWORD=$DEV_MQTT_SIM
MQTT_NIFI_PASSWORD=$DEV_MQTT_NIFI
MQTT_BUS_PASSWORD=$DEV_MQTT_BUS

PGU_ALERTAS_COOLDOWN=5
PGU_ALERTAS_EMAIL_FROM=sistema@tub.pt

# Sprint 0 (F0): MinIO (S3-compatible storage) e Mailpit (SMTP capture)
MINIO_ROOT_USER=pgu_minio_admin
MINIO_ROOT_PASSWORD=$DEV_MINIO_PASS
MINIO_EXPORTS_BUCKET=exports
MINIO_ATTACHMENTS_BUCKET=attachments

# Sprint 0 (F0): SMTP em dev usa Mailpit (captura local em http://localhost:8025).
# Em producao, trocar para um SMTP real (Gmail App Password, SendGrid, etc.) — ver .env.example.
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_AUTH=false
SMTP_STARTTLS=false
ENVEOF
        step_ok ".env de desenvolvimento criado com passwords aleatorias"
        echo ""
        echo "  Credenciais geradas (ficam tambem no .env, gitignored):"
        echo "    Keycloak server admin:  admin / $DEV_IAM_PASS"
        echo "    NiFi admin:             admin / $DEV_NIFI_PASS"
        echo "    MinIO root:             pgu_minio_admin / $DEV_MINIO_PASS"
        echo "    (restantes credenciais ficam apenas no .env)"
        echo ""
    fi
else
    step_ok ".env ja existe — a reutilizar"
fi

# Carregar variáveis
set -a; source .env; set +a
detect_env

# ──────────────────────────────────────────────────────────────────────
# STEP 3 — SSL (só produção)
# ──────────────────────────────────────────────────────────────────────
header "3/7  Certificado SSL"

if [ "$ENV_MODE" = "production" ]; then
    if ! command -v certbot &>/dev/null; then
        step_info "A instalar certbot..."
        apt-get update -qq && apt-get install -y -qq certbot
    fi

    CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    if [ ! -f "$CERT_PATH" ]; then
        CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
        EMAIL_FLAG=""
        if [ -n "$CERTBOT_EMAIL" ] && [ "$CERTBOT_EMAIL" != "admin@example.com" ]; then
            EMAIL_FLAG="--email $CERTBOT_EMAIL"
        else
            EMAIL_FLAG="--register-unsafely-without-email"
        fi

        if ss -tlnp | grep -q ':80 '; then
            docker compose down 2>/dev/null || true
        fi

        certbot certonly --standalone -d "$DOMAIN" $EMAIL_FLAG --agree-tos --non-interactive
        step_ok "Certificado SSL obtido para $DOMAIN"
    else
        step_ok "Certificado SSL ja existe"
    fi

    CRON_JOB="0 3 * * * certbot renew --quiet --deploy-hook 'docker restart pgu-web'"
    if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
        (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
        step_ok "Renovacao automatica configurada"
    fi
else
    step_skip "Ignorado (ambiente local nao precisa de SSL)"
fi

# ──────────────────────────────────────────────────────────────────────
# STEP 4 — Build & Start
# ──────────────────────────────────────────────────────────────────────
header "4/7  Build e arranque dos containers"

# Output do build/up vai para ficheiro; em caso de erro mostramos tail.
SETUP_LOG="/tmp/pgu-setup-$$.log"

step_info "A construir imagens Docker..."
if compose_cmd build --quiet > "$SETUP_LOG" 2>&1; then
    step_ok "Imagens construidas"
else
    step_warn "Build com erros — a reconstruir verbose para diagnostico"
    if ! compose_cmd build 2>&1 | tee -a "$SETUP_LOG"; then
        step_fail "Build falhou. Logs em $SETUP_LOG"
        tail -30 "$SETUP_LOG"
        exit 1
    fi
    step_ok "Imagens construidas (rebuild verbose)"
fi

step_info "A iniciar containers..."
if ! compose_cmd up -d > "$SETUP_LOG" 2>&1; then
    step_fail "Falha a iniciar containers. Ultimas linhas do log:"
    tail -25 "$SETUP_LOG"
    exit 1
fi
step_ok "Containers iniciados"

# Garante que o pgu-web (frontend) arranca. Por vezes o "up -d" geral
# silenciosamente ignora um servico se a primeira tentativa falhar (ex:
# OOM transiente durante o build). Forcamos build+up explicito.
step_info "A garantir frontend (pgu-web)..."
if ! compose_cmd build pgu-web > "$SETUP_LOG" 2>&1; then
    step_warn "Build do pgu-web falhou — output:"
    tail -20 "$SETUP_LOG"
fi
if ! compose_cmd up -d pgu-web > "$SETUP_LOG" 2>&1; then
    step_fail "Falha a iniciar pgu-web. Ultimas linhas:"
    tail -20 "$SETUP_LOG"
    exit 1
fi
step_ok "Frontend pronto em http://localhost"

# ──────────────────────────────────────────────────────────────────────
# STEP 5 — Aguardar serviços
# ──────────────────────────────────────────────────────────────────────
header "5/7  A aguardar servicos criticos"

wait_for() {
    local name="$1" url="$2" max_wait="${3:-90}" insecure="${4:-}"
    local elapsed=0
    local curl_flags="-sf"
    [ "$insecure" = "insecure" ] && curl_flags="-sfk"

    printf "  ${DIM}⏳${NC}  %-20s " "$name"
    while ! curl $curl_flags "$url" > /dev/null 2>&1; do
        sleep 3
        elapsed=$((elapsed + 3))
        printf "${DIM}.${NC}"
        if [ $elapsed -ge $max_wait ]; then
            echo ""
            step_warn "$name nao respondeu em ${max_wait}s"
            return 1
        fi
    done
    printf "\r  ${TICK}  %-20s ${DIM}pronto (${elapsed}s)${NC}\n" "$name"
    return 0
}

if [ "$ENV_MODE" = "local" ]; then
    wait_for "Spring Boot"    "http://localhost:8081/v3/api-docs"   240           || true
    wait_for "Keycloak"       "http://localhost:8080/auth/"         120           || true
    wait_for "NiFi"           "https://localhost:8443/nifi/"        120 insecure  || true
    wait_for "Metabase"       "http://localhost:3000/api/health"     90           || true

    NIFI_URL="https://localhost:8443"
else
    wait_for "Spring Boot"    "http://spring-boot-backend:8081/v3/api-docs"  120           || true
    wait_for "Keycloak"       "http://keycloak:8080/auth/"                   120           || true
    wait_for "NiFi"           "https://nifi:8443/nifi/"                      120 insecure  || true

    NIFI_URL="https://nifi:8443"
fi

# Sprint 7 (chatbot IA): aguardar Ollama + verificar que o modelo Gemma esta
# pulled. Sem o modelo, qualquer chamada ao /api/v1/ai/chat falha com timeout
# ou erro generico. Ollama nao expoe porta ao host (seguranca), por isso
# usamos docker exec para detectar prontidao.
if [ "$ENABLE_AI" = "true" ]; then
    OLLAMA_MODEL_DEFAULT="gemma2:2b-instruct-q4_K_M"
    OLLAMA_MODEL_NAME="${OLLAMA_MODEL:-$OLLAMA_MODEL_DEFAULT}"

    printf "  ${DIM}⏳${NC}  %-20s " "Ollama"
    elapsed=0
    max_wait=120
    while ! docker exec ollama ollama list > /dev/null 2>&1; do
        sleep 3
        elapsed=$((elapsed + 3))
        printf "${DIM}.${NC}"
        if [ $elapsed -ge $max_wait ]; then
            echo ""
            step_warn "Ollama nao respondeu em ${max_wait}s — chatbot ficara indisponivel"
            break
        fi
    done
    if [ $elapsed -lt $max_wait ]; then
        printf "\r  ${TICK}  %-20s ${DIM}pronto (${elapsed}s)${NC}\n" "Ollama"

        # Verificar se o modelo ja existe no volume; se nao, fazer pull.
        if docker exec ollama ollama list 2>/dev/null | grep -q "${OLLAMA_MODEL_NAME%%:*}"; then
            step_ok "Ollama: modelo ${OLLAMA_MODEL_NAME} ja presente"
        else
            step_info "Ollama: a fazer pull de ${OLLAMA_MODEL_NAME} (~1.5GB, pode demorar)..."
            if docker exec ollama ollama pull "$OLLAMA_MODEL_NAME" > /dev/null 2>&1; then
                step_ok "Ollama: modelo ${OLLAMA_MODEL_NAME} pulled"
            else
                step_warn "Ollama: falha no pull — corre 'docker exec ollama ollama pull ${OLLAMA_MODEL_NAME}' manualmente"
            fi
        fi
    fi
else
    step_skip "Ollama (chatbot IA) desativado — usa 'bash pgu-setup.sh setup' sem --no-ai para o iniciar"
fi

# ──────────────────────────────────────────────────────────────────────
# STEP 6 — Auto-configuração NiFi
# ──────────────────────────────────────────────────────────────────────
header "6/7  Configuracao automatica"

NIFI_USER="${NIFI_USERNAME:-admin}"
# Sprint -1 (follow-up): sem fallback hardcoded. Se .env nao tiver NIFI_PASSWORD
# o setup do NiFi falha graciosamente abaixo (token vazio -> step_warn).
NIFI_PASS="${NIFI_PASSWORD:-}"

# ─── NiFi ─────────────────────────────────────────────────────────────
nifi_setup() {
    local template_file="$PROJECT_DIR/nifi-templates/pgu_ingestion_telemetry.json"

    if [ ! -f "$template_file" ]; then
        step_warn "NiFi: template nao encontrado em nifi-templates/"
        return 1
    fi

    if [ -z "$NODE_BIN" ]; then
        step_warn "NiFi: node nao disponivel — configura manualmente via UI"
        return 1
    fi

    # Autenticar
    local token
    token=$(curl -sk -X POST "$NIFI_URL/nifi-api/access/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=$NIFI_USER&password=$NIFI_PASS" 2>/dev/null) || {
        step_warn "NiFi: falha na autenticacao"
        return 1
    }

    if [ -z "$token" ] || [[ "$token" == *"error"* ]]; then
        step_warn "NiFi: token invalido"
        return 1
    fi

    # Verificar process groups existentes
    local root_pg
    root_pg=$(curl -sk -H "Authorization: Bearer $token" \
        "$NIFI_URL/nifi-api/flow/process-groups/root" 2>/dev/null)

    local pg_count
    pg_count=$(echo "$root_pg" | "$NODE_BIN" -e "
        const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
        console.log((d.processGroupFlow?.flow?.processGroups||[]).length);
    " 2>/dev/null || echo "0")

    local root_id
    root_id=$(echo "$root_pg" | "$NODE_BIN" -e "
        const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
        console.log(d.processGroupFlow.id);
    " 2>/dev/null)

    if [ "$pg_count" != "0" ]; then
        step_ok "NiFi: $pg_count process group(s) ja existente(s)"
    else
        # Importar template
        local client_id
        client_id=$("$NODE_BIN" -e "console.log(require('crypto').randomUUID())" 2>/dev/null || echo "setup-$(date +%s)")

        if curl -sk -X POST "$NIFI_URL/nifi-api/process-groups/$root_id/process-groups/upload" \
            -H "Authorization: Bearer $token" \
            -F "file=@$template_file" \
            -F "groupName=pgu_ingestion_telemetry" \
            -F "positionX=0" \
            -F "positionY=0" \
            -F "clientId=$client_id" > /dev/null 2>&1; then
            step_ok "NiFi: template importado"
        else
            step_fail "NiFi: falha ao importar template"
            return 1
        fi
    fi

    # Sprint 0 (F4 follow-up): configurar credenciais dos processors antes do Start.
    # Sem isto, o ConsumeMQTT fica em warning ("Username and Password is invalid")
    # e nada flui. Iterar todos os PGs (e sub-PGs) e patch das propriedades.
    sleep 2  # dar tempo ao NiFi para registar processors do template

    local updated_pg
    updated_pg=$(curl -sk -H "Authorization: Bearer $token" \
        "$NIFI_URL/nifi-api/flow/process-groups/root" 2>/dev/null)

    local child_ids
    child_ids=$(echo "$updated_pg" | "$NODE_BIN" -e "
        const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
        (d.processGroupFlow?.flow?.processGroups||[]).forEach(p=>console.log(p.id));
    " 2>/dev/null || true)

    local configured=0
    for pgid in $child_ids; do
        configured=$((configured + $(nifi_configure_processors "$token" "$pgid")))
    done

    if [ $configured -gt 0 ]; then
        step_ok "NiFi: $configured processor(s) com credenciais aplicadas"
    fi

    # Iniciar todos os process groups
    local started=0
    for pgid in $child_ids; do
        curl -sk -X PUT "$NIFI_URL/nifi-api/flow/process-groups/$pgid" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "{\"id\":\"$pgid\",\"state\":\"RUNNING\"}" > /dev/null 2>&1
        started=$((started + 1))
    done

    if [ $started -gt 0 ]; then
        step_ok "NiFi: $started process group(s) a correr"
    fi
}

# Sprint 0 (F4 follow-up): configurar properties de ConsumeMQTT e InvokeHTTP
# dentro de um Process Group. Lê env vars MQTT_NIFI_PASSWORD e PGU_INTERNAL_API_KEY.
# Imprime numero de processors configurados (para somar no contador).
nifi_configure_processors() {
    local token="$1"
    local pg_id="$2"
    local count=0

    local pg_flow
    pg_flow=$(curl -sk -H "Authorization: Bearer $token" \
        "$NIFI_URL/nifi-api/flow/process-groups/$pg_id" 2>/dev/null)

    # IDs dos processors por tipo (string match em component.type)
    local mqtt_ids http_ids
    mqtt_ids=$(echo "$pg_flow" | "$NODE_BIN" -e "
        const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
        (d.processGroupFlow?.flow?.processors||[])
          .filter(p => (p.component.type||'').endsWith('ConsumeMQTT'))
          .forEach(p => console.log(p.id));
    " 2>/dev/null || true)
    http_ids=$(echo "$pg_flow" | "$NODE_BIN" -e "
        const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
        (d.processGroupFlow?.flow?.processors||[])
          .filter(p => (p.component.type||'').endsWith('InvokeHTTP'))
          .forEach(p => console.log(p.id));
    " 2>/dev/null || true)

    for pid in $mqtt_ids; do
        nifi_patch_processor "$token" "$pid" \
            "\"Broker URI\":\"tcp://mosquitto:1883\",\"Username\":\"nifi\",\"Password\":\"${MQTT_NIFI_PASSWORD}\",\"Topic Filter\":\"tub/telemetry\"" \
            && count=$((count + 1))
    done

    for pid in $http_ids; do
        nifi_patch_processor "$token" "$pid" \
            "\"HTTP URL\":\"http://spring-boot-backend:8081/api/v1/telemetry/ingest\",\"HTTP Method\":\"POST\",\"X-Internal-API-Key\":\"${PGU_INTERNAL_API_KEY}\"" \
            && count=$((count + 1))
    done

    echo "$count"
}

# Helper: PUT a um processor com properties novas, lidando com optimistic locking.
nifi_patch_processor() {
    local token="$1"
    local proc_id="$2"
    local props_inner="$3"

    local proc_json version
    proc_json=$(curl -sk -H "Authorization: Bearer $token" \
        "$NIFI_URL/nifi-api/processors/$proc_id" 2>/dev/null)
    version=$(echo "$proc_json" | "$NODE_BIN" -e "
        const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
        console.log(d.revision?.version ?? 0);
    " 2>/dev/null) || return 1

    curl -sk -o /dev/null -X PUT "$NIFI_URL/nifi-api/processors/$proc_id" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "{\"revision\":{\"version\":$version},\"component\":{\"id\":\"$proc_id\",\"config\":{\"properties\":{$props_inner}}}}"
}

nifi_setup || true

# ──────────────────────────────────────────────────────────────────────
# STEP 7 — Resumo
# ──────────────────────────────────────────────────────────────────────
elapsed_total=$SECONDS
mins=$((elapsed_total / 60))
secs=$((elapsed_total % 60))

echo ""
echo ""

if [ "$ENV_MODE" = "local" ]; then
    echo -e "  ${BOLD}${GREEN}Setup concluido com sucesso${NC} ${DIM}(${mins}m ${secs}s)${NC}"
    echo ""
    divider
    echo -e "  ${BOLD}Servicos${NC}"
    divider
    echo -e "  ${CYAN}Frontend (Vite)${NC}    http://localhost:5173"
    echo -e "  ${CYAN}API (Spring Boot)${NC}  http://localhost:8081/api/v1/"
    echo -e "  ${CYAN}Keycloak${NC}           http://localhost:8080/auth/"
    echo -e "  ${CYAN}NiFi${NC}               https://localhost:8443/nifi/"
    echo -e "  ${CYAN}Metabase${NC}           http://localhost:3000"
    if [ "$ENABLE_AI" = "true" ]; then
        echo -e "  ${CYAN}Chatbot (IA)${NC}       http://localhost:5173/chatbot ${DIM}(Ollama interno)${NC}"
    else
        echo -e "  ${DIM}Chatbot (IA)${NC}       ${DIM}desativado (--no-ai)${NC}"
    fi
    echo ""
    divider
    echo -e "  ${BOLD}Credenciais — Backoffice (realm pgu-realm)${NC}"
    divider
    echo -e "  Admin              ${BOLD}admin${NC} / admin123    ${DIM}(temporary — muda no 1o login)${NC}"
    echo -e "  ${DIM}Operadores e motoristas: criados pelo admin no backoffice${NC}"
    echo -e "  ${DIM}  /backoffice/users      → operadores${NC}"
    echo -e "  ${DIM}  /backoffice/drivers    → motoristas${NC}"
    echo ""
    divider
    echo -e "  ${BOLD}Credenciais — Servicos (geradas em .env, ja gitignored)${NC}"
    divider
    echo -e "  Keycloak console   ${BOLD}admin${NC} / ${IAM_ADMIN_PASSWORD:-<ver .env: IAM_ADMIN_PASSWORD>}"
    echo -e "  NiFi               ${BOLD}admin${NC} / ${NIFI_PASSWORD:-<ver .env: NIFI_PASSWORD>}"
    echo -e "  MinIO console      ${BOLD}${MINIO_ROOT_USER:-pgu_minio_admin}${NC} / ${MINIO_ROOT_PASSWORD:-<ver .env: MINIO_ROOT_PASSWORD>}"
    echo -e "  Mailpit web UI     ${CYAN}http://localhost:8025${NC} ${DIM}(emails capturados localmente)${NC}"
    echo ""
    divider
    echo -e "  ${BOLD}Proximo passo${NC}"
    divider
    echo -e "  ${YELLOW}cd pgu-web && npm install && npm run dev${NC}"
    echo ""
else
    echo -e "  ${BOLD}${GREEN}Deploy concluido com sucesso${NC} ${DIM}(${mins}m ${secs}s)${NC}"
    echo ""
    divider
    echo -e "  ${BOLD}Servicos${NC}"
    divider
    echo -e "  ${CYAN}Frontend${NC}     https://$DOMAIN"
    echo -e "  ${CYAN}API${NC}          https://$DOMAIN/api/"
    echo -e "  ${CYAN}Keycloak${NC}     https://$DOMAIN/auth/"
    echo -e "  ${CYAN}Metabase${NC}     https://$DOMAIN/metabase/"
    echo -e "  ${CYAN}NiFi${NC}         https://$DOMAIN/nifi/"
    echo ""
    divider
    echo -e "  ${BOLD}Credenciais${NC}"
    divider
    echo -e "  Ficheiro .env:  ${DIM}$PROJECT_DIR/.env${NC}"
    echo ""
fi

divider
echo -e "  ${BOLD}Comandos disponiveis${NC}"
divider
echo -e "  ${DIM}bash pgu-setup.sh${NC} ${BOLD}status${NC}     Estado dos containers"
echo -e "  ${DIM}bash pgu-setup.sh${NC} ${BOLD}logs${NC}       Ver logs (ex: logs keycloak)"
echo -e "  ${DIM}bash pgu-setup.sh${NC} ${BOLD}restart${NC}    Reiniciar tudo"
echo -e "  ${DIM}bash pgu-setup.sh${NC} ${BOLD}rebuild${NC}    Rebuild completo"
echo -e "  ${DIM}bash pgu-setup.sh${NC} ${BOLD}down${NC}       Parar tudo"
echo -e "  ${DIM}bash pgu-setup.sh${NC} ${BOLD}nuke${NC}       ${RED}Reset total (apaga dados!)${NC}"
echo ""

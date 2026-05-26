#!/bin/sh
# Sprint -1 (SEC-7) — substitui placeholders ${PGU_*_PASSWORD} no realm JSON
# antes do Keycloak importar.
#
# Sem isto, passwords ficavam hardcoded no repositorio (admin123 etc).
# A imagem oficial Keycloak nao tem envsubst (gettext), entao usamos sed.
# Whitelist explicita de variaveis — protege contra interferencia com outros
# ${...} no realm (URLs de redirect, etc).

set -eu

TEMPLATE=/opt/keycloak/data/import-template/pgu-realm-realm.json
TARGET=/opt/keycloak/data/import/pgu-realm-realm.json

mkdir -p /opt/keycloak/data/import

: "${PGU_ADMIN_PASSWORD:?PGU_ADMIN_PASSWORD obrigatoria}"
: "${PGU_OPERADOR_PASSWORD:?PGU_OPERADOR_PASSWORD obrigatoria}"
: "${PGU_MOTORISTA_PASSWORD:?PGU_MOTORISTA_PASSWORD obrigatoria}"

sed \
    -e "s|\${PGU_ADMIN_PASSWORD}|${PGU_ADMIN_PASSWORD}|g" \
    -e "s|\${PGU_OPERADOR_PASSWORD}|${PGU_OPERADOR_PASSWORD}|g" \
    -e "s|\${PGU_MOTORISTA_PASSWORD}|${PGU_MOTORISTA_PASSWORD}|g" \
    "$TEMPLATE" > "$TARGET"

echo "[entrypoint] Realm JSON pronto em $TARGET com passwords das env vars."

# Executar comando default do Keycloak (passado pelo docker-compose)
exec /opt/keycloak/bin/kc.sh "$@"

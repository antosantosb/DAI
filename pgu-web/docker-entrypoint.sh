#!/bin/sh
set -e

# EXTERNAL_PORT: a porta visivel ao browser (5443 em dev, 443 em prod).
# Usada em X-Forwarded-Port para o Keycloak gerar redirects com a porta
# correcta. Default 443 (assumindo prod com HTTPS standard).
: "${EXTERNAL_PORT:=443}"
export EXTERNAL_PORT DOMAIN

# Substitute DOMAIN e EXTERNAL_PORT into nginx config
envsubst '${DOMAIN} ${EXTERNAL_PORT}' < /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf

# Create certbot webroot directory
mkdir -p /var/www/certbot

# If no SSL cert yet, generate a self-signed one so nginx can start
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    echo "==> SSL certificate not found. Generating temporary self-signed cert..."
    mkdir -p "/etc/letsencrypt/live/${DOMAIN}"
    openssl req -x509 -nodes -days 1 \
        -newkey rsa:2048 \
        -keyout "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" \
        -out "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" \
        -subj "/CN=${DOMAIN}" 2>/dev/null
    echo "==> Temporary cert created. Run setup.sh to get a real Let's Encrypt cert."
fi

exec nginx -g 'daemon off;'

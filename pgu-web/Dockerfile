# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine
RUN apk add --no-cache openssl dos2unix
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
# Normalizar line-endings CRLF -> LF e marcar executavel. Sem dos2unix,
# se o ficheiro foi guardado em Windows o shell Alpine devolve
# "exec /docker-entrypoint.sh: no such file or directory".
RUN dos2unix /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh
# Remove default config
RUN rm -f /etc/nginx/conf.d/default.conf
EXPOSE 80 443
ENTRYPOINT ["/docker-entrypoint.sh"]

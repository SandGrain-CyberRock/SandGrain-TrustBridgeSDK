# =============================================================================
# TrustBridge-Be — NestJS API
# =============================================================================
FROM node:20-alpine

WORKDIR /app

# netcat — used by entrypoint to wait for MySQL
RUN apk add --no-cache netcat-openbsd

# Install deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build (TypeScript → dist/)
RUN npm run build

# Entrypoint: wait for DB, run seed once, start API
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

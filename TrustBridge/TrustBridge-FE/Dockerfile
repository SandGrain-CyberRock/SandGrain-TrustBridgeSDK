ARG NODE_VERSION=20.18.1-alpine3.20

# stage 1: deps
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci

# stage 2: runtime (dev server)
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

RUN addgroup -g 1001 -S nodejs \
  && adduser -S -u 1001 -G nodejs vite

COPY --from=deps --chown=vite:nodejs /app/node_modules ./node_modules
COPY --chown=vite:nodejs . .

USER vite
EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5173', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
# =============================================================================
# TrustBridge-FE — Vite dev server (port 5173)
# =============================================================================
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host 0.0.0.0 so the container is reachable from the host
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

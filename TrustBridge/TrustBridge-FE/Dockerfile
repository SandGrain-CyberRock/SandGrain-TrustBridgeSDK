# =============================================================================
# TrustBridge-FE — Vite dev server (port 5173)
# =============================================================================
FROM node:20-alpine

WORKDIR /app

# Lockfiles are gitignored in this repo (.gitignore: package-lock.json, yarn.lock),
# so a fresh clone has none. Copy package.json plus an optional lockfile (the glob
# matches zero files without error) and use `npm install` — `npm ci` would require
# a committed lockfile that doesn't exist here.
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 5173

# --host 0.0.0.0 so the container is reachable from the host
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

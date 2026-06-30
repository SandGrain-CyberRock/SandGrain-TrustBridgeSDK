#!/bin/sh
set -e

# Wait for MySQL to be reachable
echo "[entrypoint] Waiting for MySQL at ${DB_HOST}:${DB_PORT}..."
until nc -z "${DB_HOST}" "${DB_PORT}" 2>/dev/null; do
    sleep 1
done
echo "[entrypoint] MySQL is up."

# Run seed once — marker file lives in a writable location.
# Mount a volume at /app/.seed-state to persist the marker across restarts.
SEED_MARKER="/app/.seed-state/seeded"
mkdir -p "$(dirname "$SEED_MARKER")"

if [ ! -f "$SEED_MARKER" ]; then
    echo "[entrypoint] First boot — running database seed..."
    npm run seed && touch "$SEED_MARKER"
    echo "[entrypoint] Seed complete."
else
    echo "[entrypoint] Seed already applied — skipping."
fi

echo "[entrypoint] Starting API on port ${PORT:-3000}..."
exec node dist/main

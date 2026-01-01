#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3100}"

echo "Building app..."
npm run build

echo "Starting app on port ${PORT}..."
PORT="${PORT}" next start --hostname 127.0.0.1 --port "${PORT}" &
SERVER_PID=$!

cleanup() {
  if kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Waiting for healthcheck..."
for i in {1..30}; do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
    echo "Healthcheck OK"
    exit 0
  fi
  sleep 1
done

echo "Healthcheck failed"
exit 1

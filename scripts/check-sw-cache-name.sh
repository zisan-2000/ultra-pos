#!/usr/bin/env bash
set -euo pipefail

# Ensures the service worker CACHE_NAME matches the value supplied by the release pipeline.
# Set RELEASE_CACHE_NAME (e.g., pos-cache-v5) for each production release.

EXPECTED="${RELEASE_CACHE_NAME:-}"

if [[ -z "${EXPECTED}" ]]; then
  echo "RELEASE_CACHE_NAME not set; cannot verify service worker cache version."
  exit 1
fi

SW_FILE="app/service-worker.js"
if [[ ! -f "${SW_FILE}" ]]; then
  echo "Service worker file not found: ${SW_FILE}"
  exit 1
fi

ACTUAL=$(grep -Eo 'CACHE_NAME\\s*=\\s*`?\"?[^`\";]+' "${SW_FILE}" | head -1 | sed 's/.*=\\s*`\\?\"\\?//')

if [[ "${ACTUAL}" != "${EXPECTED}" ]]; then
  echo "Mismatch: CACHE_NAME in ${SW_FILE} is '${ACTUAL}', expected '${EXPECTED}'."
  exit 1
fi

echo "OK: service worker CACHE_NAME matches '${EXPECTED}'."

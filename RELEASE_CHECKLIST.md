# Release Checklist

- **Service worker cache bust**: bump `CACHE_NAME` in `app/service-worker.js` for every production release so clients pick up the new worker and assets.
- Build/health: `npm run build` then `npm run start` (or your PM2/process manager) and hit `/api/health`.
- Secrets: verify env vars are injected from secret store (do not rely on `.env*` in repo).
- Database: run pending Prisma migrations if any.

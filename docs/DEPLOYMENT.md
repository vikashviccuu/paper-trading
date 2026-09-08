# Deployment

## Option A: Docker Compose (simplest)

```bash
cp backend/.env.example backend/.env   # edit values, especially JWT_SECRET
docker compose up --build
```

This starts Postgres, Redis, the backend (port 4000), and the frontend
dev server (port 5173). Visit http://localhost:5173.

Run migrations once the containers are up:
```bash
docker compose exec backend npx prisma migrate deploy
```

## Option B: Run locally without Docker

Prerequisites: Node.js 20+, a local or hosted Postgres instance, Redis
(optional in dev — only needed if you scale price-feed fan-out across
multiple backend processes).

```bash
# Backend
cd backend
cp .env.example .env      # fill in DATABASE_URL and broker credentials
npm install
npx prisma migrate dev --name init
npm run dev                # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

The Vite dev server proxies `/api` and `/socket.io` to `localhost:4000`
(see `frontend/vite.config.ts`), so the frontend works out of the box
against a locally running backend.

## First run checklist

1. Set `BROKER_PROVIDER=MOCK` first to confirm everything works end-to-end
   without any broker credentials.
2. Sign up a user, place a MARKET order on one of the seeded MOCK symbols,
   confirm it shows up under Portfolio.
3. Once broker credentials are ready (see `docs/BROKER_API_SETUP.md`),
   switch `BROKER_PROVIDER`, restart the backend, and call
   `POST /api/market/sync-instruments` to populate the real instrument
   master before trading real symbols.

## Production hardening (not included in this v1)

- Put the backend behind a reverse proxy (Nginx/Caddy) with TLS.
- Move `JWT_SECRET`, broker secrets, and `DATABASE_URL` into a secrets
  manager rather than a plain `.env` file.
- Build the frontend (`npm run build` in `frontend/`) and serve the static
  `dist/` output instead of running the Vite dev server.
- Run the backend under a process manager (pm2/systemd) or a proper
  container orchestrator; add health checks against `GET /health`.
- Horizontally scale the WebSocket gateway with the Socket.io Redis adapter
  (Redis is already provisioned in `docker-compose.yml` for this).
- Re-implement Upstox/Angel One tick subscriptions against their real
  WebSocket feeds instead of the REST-polling fallback used here.

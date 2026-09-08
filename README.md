# Paper Trading Platform

A multi-broker paper (virtual money) trading platform for Indian equities,
futures and options — the same category of product as
[Neostox](https://neostox.com/): real/derived market data, zero real fund
movement, full order/portfolio simulation.

## What's here

- **Multi-broker market data layer** — pluggable adapters for Zerodha Kite
  Connect, Upstox, and Angel One SmartAPI (plus a no-signup Mock adapter),
  behind one interface. Switch broker with a single `.env` value.
- **Virtual trading engine** — market/limit/SL/SL-M orders, margin checks,
  position/holding netting with proper average-price and realized P&L math,
  intraday auto square-off.
- **Equity + F&O paper trading** — delivery, intraday, and F&O
  carry-forward (NRML) product types; a synthesized options chain view.
- **Live charting** — candlestick charts (via `lightweight-charts`) backed
  by broker historical data, updating live off the WebSocket tick stream.
- **Multi-user accounts** — signup/login (JWT), per-user virtual wallet,
  order history, positions, holdings.
- **Contests** — join time-boxed trading contests with an isolated virtual
  portfolio per contest; leaderboard ranks on a risk-adjusted composite
  score (return and volatility/drawdown), not raw P&L alone. Weekly/
  monthly/half-yearly/yearly duration presets auto-compute the end date,
  and every contest auto-liquidates all positions at market close on its
  last day. See [`docs/CONTESTS.md`](docs/CONTESTS.md).
- **Admin panel** — contests are created and managed by `Admin` accounts, a
  fully separate login system (own table, own JWT secret, own `/admin/*`
  UI) from regular users. See [`docs/ADMIN.md`](docs/ADMIN.md).
- **Profile, KYC & bank verification** — a profile page (personal, address,
  communication details incl. phone OTP verification), PAN verification +
  document upload + admin approval for KYC, and bank account penny-drop
  verification - both PAN and bank checks go through a pluggable provider
  (Setu / Cashfree / Mock), the same adapter pattern as the broker layer.
  See [`docs/KYC_AND_BANKING.md`](docs/KYC_AND_BANKING.md).
- **Contest cash prizes & payouts** — admins set a total prize pool and how
  it splits across winning ranks; once a contest ends, gross/TDS/net
  amounts are computed per winner, gated on KYC + bank verification, and
  released by an admin as a real bank payout (pluggable provider - Cashfree
  / Mock). Choosing the "prop trading" payout preference additionally
  unlocks Live Trading eligibility for that user. See
  [`docs/PRIZES_AND_PAYOUTS.md`](docs/PRIZES_AND_PAYOUTS.md).
- **Live (real-money) trading** — an eligible, KYC-verified user can link
  their own broker account and place real orders through it from the
  trading terminal's "Live" account mode - separate from Paper and Contest
  modes, with per-order 2FA, pre-trade risk limits, a kill switch, and a
  full audit trail. Self-custody only: the platform never holds real client
  money, every live order executes on the user's own broker account via
  their own credentials. See
  [`docs/LIVE_TRADING.md`](docs/LIVE_TRADING.md) - read it before enabling
  `LIVE_TRADING_ENABLED`.

## Quick start

```bash
docker compose up --build
```

Then open http://localhost:5173, sign up, and trade the seeded MOCK
symbols immediately — no broker account needed to try the product.

To try contests, create an admin account first (`docker compose exec backend npm run seed:admin`,
or `npm run seed:admin` locally, after setting `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`
in `backend/.env`), then log in at http://localhost:5173/admin/login to
create one. See [`docs/ADMIN.md`](docs/ADMIN.md).

For local (non-Docker) setup, real broker integration, database schema, and
system design, see:

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — run it locally or via Docker
- [`docs/BROKER_API_SETUP.md`](docs/BROKER_API_SETUP.md) — step-by-step
  manual for getting API keys from Zerodha, Upstox, and Angel One, and
  wiring each into this app
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit
  together and why brokers are used only as a data source
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — table-by-table
  reference
- [`docs/CONTESTS.md`](docs/CONTESTS.md) — contest architecture, isolated
  per-contest portfolios, duration presets, and the risk/return leaderboard
  scoring formula
- [`docs/ADMIN.md`](docs/ADMIN.md) — admin auth model, seeding the first
  admin, and the end-of-contest automatic square-off logic
- [`docs/KYC_AND_BANKING.md`](docs/KYC_AND_BANKING.md) — profile/KYC/bank
  verification flow, Setu/Cashfree setup, and security notes
- [`docs/PRIZES_AND_PAYOUTS.md`](docs/PRIZES_AND_PAYOUTS.md) — prize pool
  config, TDS calculation, payout preference, Cashfree Payouts setup, and
  important regulatory scope notes before handling real money
- [`docs/LIVE_TRADING.md`](docs/LIVE_TRADING.md) — the self-custody live
  trading model, per-broker live order adapters, 2FA/risk controls/audit
  trail, and current SEBI compliance notes - **read before setting
  `LIVE_TRADING_ENABLED=true`**

## Project layout

```
backend/    Node.js + TypeScript + Express + Prisma/Postgres API,
            broker adapters, virtual order engine, Socket.io price feed
frontend/   React + TypeScript + Vite app (charts, order ticket,
            portfolio, options chain)
docs/       Setup manual, architecture, schema, deployment docs
```

## Status / scope

This is a v1 engineering-complete skeleton: every layer (broker adapters,
order engine, margin, portfolio, auth, live feed, charting UI, contests +
risk-adjusted leaderboard) is real, runnable code — not a mockup. It
intentionally does not replicate every Neostox feature (options strategy
builder, screeners, AI analytics); see the "Scope notes" section at the
bottom of `docs/ARCHITECTURE.md` for what a production build would add
next, and `docs/BROKER_API_SETUP.md` for exactly how to move from the
bundled Mock data feed to a real broker's live market data.

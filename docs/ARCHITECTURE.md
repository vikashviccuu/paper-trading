# Architecture

## Overview

```
                     ┌─────────────────────┐
                     │   Broker (data only) │
                     │ Zerodha / Upstox /   │
                     │ Angel One / Mock     │
                     └──────────┬───────────┘
                                │ IBrokerAdapter
                     ┌──────────▼───────────┐
                     │    BrokerFactory      │  picks adapter via
                     │  (backend/src/brokers)│  BROKER_PROVIDER env
                     └──────────┬───────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
┌───────▼────────┐    ┌─────────▼─────────┐    ┌─────────▼─────────┐
│   OrderEngine    │    │ priceFeedGateway  │    │  Express REST API │
│ (virtual matching,│◄──┤   (Socket.io)     │    │ auth/orders/market │
│  margin, fills)  │    │  tick fan-out     │    │ portfolio/options  │
└───────┬─────────┘    └─────────┬─────────┘    └─────────┬─────────┘
        │                        │                        │
        └────────────┬───────────┴────────────┬───────────┘
                      │                        │
              ┌───────▼────────┐      ┌────────▼────────┐
              │  PostgreSQL     │      │  React frontend  │
              │ (Prisma schema) │      │ (Vite + Socket.io│
              │ users/wallets/  │      │  + lightweight-  │
              │ orders/positions│      │  charts)         │
              └─────────────────┘      └──────────────────┘
```

## Why brokers are only a data source

Running an actual paper trading product on top of a live broker API without
executing real orders is the whole point (this mirrors how Neostox itself
works — no real fund movement, simulated fills against real/derived market
prices). `IBrokerAdapter` therefore has no `placeOrder` method at all. Order
execution is 100% internal, in `OrderEngine`, against `Wallet` / `Position` /
`Holding` rows in Postgres.

## Adapter pattern (multi-broker support)

`backend/src/brokers/IBrokerAdapter.ts` defines one contract:
`getInstruments`, `getQuote`, `getHistoricalData`, `getOptionChain`,
`subscribeTicks`/`unsubscribeTicks`, `authenticate`. Four adapters implement
it: `ZerodhaAdapter`, `UpstoxAdapter`, `AngelOneAdapter`, `MockAdapter`.
`BrokerFactory.getBrokerAdapter()` is the single place the rest of the app
asks for "the current broker" — swapping `BROKER_PROVIDER` in `.env` swaps
every data source in the app with no other code changes.

## Order lifecycle

1. Client calls `POST /api/orders`.
2. `OrderEngine.placeOrder`:
   - **MARKET** orders fetch the current LTP from the active adapter and
     fill immediately.
   - **LIMIT / SL / SL-M** orders are persisted with `status = OPEN` and
     wait.
3. `priceFeedGateway` calls `OrderEngine.evaluatePendingOrders(token, ltp)`
   on every tick for a subscribed symbol — this is what triggers resting
   LIMIT/SL orders, the same way a real exchange order book would.
4. On fill, `OrderEngine.fillOrder`:
   - Computes required margin via `MarginCalculator` (flat % model, see
     that file's docstring for why it's not full SPAN).
   - Debits/credits the user's `Wallet.cashBalance` and `marginUsed`.
   - Hands off to `PortfolioService.applyFill`, which nets the fill into
     either the `Position` table (INTRADAY/NORMAL, i.e. MIS/NRML — resets or
     carries per `SquareOffScheduler`) or the `Holding` table (DELIVERY/CNC),
     re-averaging price and realizing P&L on any closing quantity exactly
     like a broker back office does.

## Live prices

`priceFeedGateway` (Socket.io) subscribes to the broker's tick stream once
per unique instrument token (regardless of how many browser clients want
it), then fans each tick out to every socket room subscribed to that token.
Every tick also updates `Instrument.lastPrice` in Postgres as a REST
fallback and feeds `OrderEngine.evaluatePendingOrders`.

## Contests

A contest gives each joining user an isolated virtual portfolio
(`ContestParticipant` + `ContestPosition` + `ContestHolding`) completely
separate from their personal `Wallet`/`Position`/`Holding`. `OrderEngine`
takes an optional `contestId` and branches its margin/fill logic between
the personal ledger (`PortfolioService`) and the contest ledger
(`ContestPortfolioService`) accordingly - the two never mix. A cron job
(`ContestSnapshotScheduler`) periodically records each participant's NAV
and feeds `LeaderboardService`, which ranks participants on a weighted,
normalized blend of return and volatility/drawdown rather than raw P&L.
When a contest's computed end date (WEEKLY/MONTHLY/HALF_YEARLY/YEARLY/
CUSTOM, pinned to market close - see `utils/contestDuration.ts`) passes,
`ContestEndService` automatically liquidates every participant's open
positions and holdings and locks the final leaderboard. Full detail in
[`docs/CONTESTS.md`](CONTESTS.md).

## Profile, KYC and bank verification

`backend/src/kyc/IKycProvider.ts` is a third adapter interface following
the exact same shape as `IBrokerAdapter` - `SetuKycProvider`,
`CashfreeKycProvider`, and `MockKycProvider` all implement `verifyPan` and
`verifyBankAccount`, selected via `KYC_PROVIDER` in `.env`
(`kyc/KycProviderFactory.ts`). `KycService` and `BankAccountService` sit on
top: PAN verification + document upload feed an admin approval queue
(`Kyc.status`), and adding a bank account triggers online penny-drop
verification immediately. Full detail in
[`docs/KYC_AND_BANKING.md`](KYC_AND_BANKING.md).

## Contest prizes & payouts

A fourth adapter interface (`backend/src/payouts/IPayoutProvider.ts`,
`CashfreePayoutProvider` / `MockPayoutProvider`, selected via
`PAYOUT_PROVIDER` in `.env`) sits behind `PrizeService`, which turns a
contest's `totalPrizePool` + rank-based `ContestPrizeSlab`s into one
`ContestPrizeAward` per winner once `ContestEndService` locks the final
leaderboard - gross amount, a flat-rate TDS deduction, and the net payable
amount. Each award is gated on that user's KYC status and (for a
cash-withdrawal payout preference) verified bank account before an admin
can release it from `/admin/contests/:id/prizes`; the winner's own profile
setting decides whether release pays their bank account via the payout
provider or credits their personal trading `Wallet` instead. Full detail,
including the TDS legal citation and regulatory scope caveats, in
[`docs/PRIZES_AND_PAYOUTS.md`](PRIZES_AND_PAYOUTS.md).

## Live (real-money) trading

The one deliberate exception to "brokers are only a data source" above.
`backend/src/liveTrading/ILiveTradingAdapter.ts` is a fifth adapter
interface (`placeOrder`/`modifyOrder`/`cancelOrder`/`getOrderStatus`/
`getPositions`/`getHoldings`), implemented per broker
(`ZerodhaLiveTradingAdapter`, `UpstoxLiveTradingAdapter`,
`AngelOneLiveTradingAdapter`, `IciciDirectLiveTradingAdapter`,
`MockLiveTradingAdapter`) and selected per call via
`LiveTradingAdapterFactory.getLiveTradingAdapter(provider)` - unlike every
other factory in this app, this one is keyed by *which broker a specific
user linked*, not a single deployment-wide env var, and every adapter call
is made with that user's own access token from their own `BrokerLink` row,
never a shared credential. `LiveOrderService` gates every order behind a
kill switch, KYC verification, pre-trade risk limits, and a fresh per-order
2FA check, and writes an audit-first `LiveOrder` + append-only
`LiveOrderEvent` trail before ever calling the broker. `LiveTradingAccount`
tracks each user's own eligibility → link → enable state (never automatic -
always an explicit opt-in). Full detail, the self-custody execution model,
and current SEBI compliance notes in
[`docs/LIVE_TRADING.md`](LIVE_TRADING.md).

## Admin panel

Contests are created and managed by `Admin` accounts, a table and auth
system (`ADMIN_JWT_SECRET`, `requireAdminAuth`) that is completely separate
from the regular `User`/`JWT_SECRET` system - not a role flag on the same
login. The frontend renders an entirely different nav/layout for `/admin/*`
routes (`AdminApp` in `App.tsx`) with its own React context and axios
instance (`AdminAuthContext` / `adminApi.ts`) so a browser can hold a
regular user session and an admin session at once without either
clobbering the other. Full detail in [`docs/ADMIN.md`](ADMIN.md).

## Intraday square-off

`jobs/SquareOffScheduler.ts` runs a cron job every minute on trading days
and, once the clock crosses `INTRADAY_SQUAREOFF_TIME` (default 15:20 IST),
force-closes every open `INTRADAY` position at the current LTP and releases
its blocked margin — mirroring how brokers auto square-off MIS positions.

## Frontend

Vite + React + TypeScript. `AuthContext` holds the JWT (persisted to
`localStorage`) and attaches it to every API call via an axios interceptor.
`CandlestickChart` renders historical bars from `/api/market/history` with
`lightweight-charts`, then keeps the last candle live via the same
Socket.io tick stream the watchlist uses.

## Scope notes / what a production version would add

- Real WebSocket (not polling) feeds for Upstox and Angel One.
- Full SPAN + exposure margin computation for F&O instead of a flat %.
- Multi-broker *per user* (currently one BROKER_PROVIDER for the whole
  deployment; `BrokerLink` table exists in the schema to extend to
  per-user broker credentials).
- Basket orders, options strategy builder, screeners — listed as Neostox
  features but out of scope for this v1 build.

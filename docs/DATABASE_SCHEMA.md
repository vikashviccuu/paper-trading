# Database Schema

Defined in `backend/prisma/schema.prisma`. Postgres, managed by Prisma
migrations (`npx prisma migrate dev`).

| Table | Purpose |
|---|---|
| `User` | Login identity (email + bcrypt hash). |
| `BrokerLink` | Per-user broker OAuth tokens, for a future per-user multi-broker mode (schema is ready; current app uses one shared `BROKER_PROVIDER`). |
| `Wallet` | One per user. `cashBalance`, `marginUsed`, `realizedPnL`. Created with `DEFAULT_VIRTUAL_CASH` on signup. |
| `Instrument` | Local cache of the broker's instrument master (symbol, exchange, segment, lot size, tick size, expiry/strike/option type for F&O). Populated by `POST /api/market/sync-instruments`. |
| `Order` | Every order ever placed, with full lifecycle status (`PENDING`→`OPEN`→`COMPLETE`/`REJECTED`/`CANCELLED`). |
| `Position` | Net open MIS/NRML position per (user, instrument, productType). Deleted when netted to zero. |
| `Holding` | Net CNC (delivery) holding per (user, instrument) — persists across days, unlike `Position`. |
| `Watchlist` | Saved symbol lists per user. |
| `Admin` | Separate identity from `User` for platform admins - own login, own JWT secret. Never self-registered (see `docs/ADMIN.md`). |
| `Contest` | A hosted trading contest: `durationType` + window (`startDate`/`endDate`, auto-computed for preset durations), starting virtual cash, `returnWeight`/`riskWeight` used by the leaderboard formula, `createdByAdminId` (always an `Admin`, never a `User`), `squaredOffAt` (idempotency guard for end-of-contest auto square-off). |
| `ContestParticipant` | One per (contest, user): isolated wallet (`cashBalance`, `marginUsed`, `realizedPnL`) plus cached leaderboard fields (`rank`, `returnPct`, `riskScore`, `maxDrawdownPct`, `compositeScore`). |
| `ContestPosition` / `ContestHolding` | Mirror `Position`/`Holding` but keyed by `contestParticipantId` - a contest's trades never touch the user's personal position/holding books. |
| `ContestPortfolioSnapshot` | Periodic NAV sample per participant; the time series `LeaderboardService` computes return/volatility/drawdown from. |
| `UserProfile` | Personal / address / communication details for the profile page. One per user. |
| `Kyc` | KYC status machine (`NOT_STARTED`→`DOCUMENTS_PENDING`→`SUBMITTED`→`UNDER_REVIEW`→`VERIFIED`/`REJECTED`), PAN verification result, admin reviewer. |
| `KycDocument` | Uploaded KYC files (PAN card, Aadhaar, address proof, bank proof, photo) with per-document review status. |
| `BankAccount` | A user's bank account(s) with online penny-drop verification status (`NOT_VERIFIED`/`PENDING`/`VERIFIED`/`FAILED`) and the name-match result from the provider. |
| `OtpVerification` | Phone-number OTP records for the communication-details section. |
| `ContestPrizeSlab` | Defines how `Contest.totalPrizePool` splits across rank ranges (e.g. rank 1 = 50%, rank 2-3 = 30% split evenly). |
| `ContestPrizeAward` | One row per winning participant once prizes are computed: gross/TDS/net amounts, payout preference + status, and the admin who released it. |
| `LiveTradingAccount` | One per user: real-money trading eligibility/enabled/suspended state, linked `BrokerLink`, risk limits, kill switch. |
| `LiveOrder` | One row per real order placed via `ILiveTradingAdapter` - broker order id, broker-reported status/fills, immutable request/response snapshots for audit. |
| `LiveOrderEvent` | Append-only state-change trail for a `LiveOrder` - never updated or deleted. |

See [`docs/CONTESTS.md`](CONTESTS.md), [`docs/KYC_AND_BANKING.md`](KYC_AND_BANKING.md), [`docs/PRIZES_AND_PAYOUTS.md`](PRIZES_AND_PAYOUTS.md), and [`docs/LIVE_TRADING.md`](LIVE_TRADING.md) for how these tables work together.

## Key relationships

- `User 1—1 Wallet`
- `User 1—N Order / Position / Holding / Watchlist / BrokerLink / ContestParticipant`
- `Instrument 1—N Order / Position / Holding / ContestPosition / ContestHolding`
- `Admin 1—N Contest` (`Contest.createdByAdminId` - contest creation is admin-only)
- `Contest 1—N ContestParticipant 1—N ContestPosition / ContestHolding / ContestPortfolioSnapshot / Order`
- `Order` belongs to either a `User` alone (personal) or a `User` + `ContestParticipant` (contest order) — see `Order.contestParticipantId`.
- `User 1—1 UserProfile`, `User 1—1 Kyc 1—N KycDocument`, `User 1—N BankAccount`, `User 1—N OtpVerification`
- `Admin 1—N Kyc` (`Kyc.reviewedByAdminId` - KYC approval is admin-only, same as contest hosting)
- `Contest 1—N ContestPrizeSlab`, `Contest 1—N ContestPrizeAward`
- `ContestParticipant 1—N ContestPrizeAward` (in practice at most one per participant, since `@@unique([contestId, userId])` on the award)
- `Admin 1—N ContestPrizeAward` (`ContestPrizeAward.releasedByAdminId` - releasing a payout is admin-only)
- `User 1—1 LiveTradingAccount`, `User 1—N LiveOrder`
- `BrokerLink 1—N LiveTradingAccount` / `1—N LiveOrder` (a live order always executes on the linked broker's own account, via that link's own token)
- `LiveOrder 1—N LiveOrderEvent` (append-only audit trail)
- `Admin 1—N LiveTradingAccount` (`LiveTradingAccount.suspendedByAdminId` - suspending live trading is admin-only)

## Enums

- `Segment`: EQUITY, FUTURES, OPTIONS
- `ProductType`: INTRADAY (MIS), DELIVERY (CNC), NORMAL (NRML, F&O carry-forward)
- `OrderType`: MARKET, LIMIT, SL, SL_M
- `TransactionType`: BUY, SELL
- `OrderStatus`: PENDING, OPEN, COMPLETE, REJECTED, CANCELLED
- `OptionType`: CE, PE
- `ContestStatus`: UPCOMING, ACTIVE, ENDED, CANCELLED
- `ContestDurationType`: WEEKLY, MONTHLY, HALF_YEARLY, YEARLY, CUSTOM
- `PayoutPreference`: CASH_WITHDRAWAL, PROP_TRADING
- `PrizePayoutStatus`: PENDING_KYC, PENDING_BANK, READY, PROCESSING, PAID, CREDITED_TO_WALLET, FAILED
- `LiveTradingStatus`: NOT_ELIGIBLE, ELIGIBLE, ENABLED, SUSPENDED
- `LiveOrderStatus`: PENDING_SUBMISSION, SUBMITTED, OPEN, PARTIALLY_FILLED, COMPLETE, REJECTED, CANCELLED

## Migrations

```bash
cd backend
npx prisma migrate dev --name init   # creates tables, generates client
npx prisma studio                    # optional GUI to browse data
```

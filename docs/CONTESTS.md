# Contests

Time-boxed trading competitions (the same category of feature Neostox sells
to IITs/IIMs/colleges as "1000+ contests hosted"). **Only admins can host a
contest** (see [`docs/ADMIN.md`](ADMIN.md) - admins are a fully separate
login system from regular users); any regular user can join one. Ranking is
based on **return and risk together**, not just raw P&L, and every contest
auto-liquidates on its last day - see "Duration and automatic square-off"
below.

## Why risk-adjusted, not just P&L

Ranking purely on return% rewards recklessness - the top of a P&L-only
leaderboard is usually whoever YOLO'd into the highest-variance bet and got
lucky, not who traded best. This platform's leaderboard blends:

- **Return%** - total gain/loss vs. starting virtual cash.
- **Risk score** - volatility (standard deviation) of the participant's
  NAV return series over the contest.
- **Max drawdown%** - shown for context, largest peak-to-trough decline.

into one **composite score**, and ranks on that.

## Isolated per-contest portfolios

Joining a contest does not touch your personal paper trading account.
`ContestParticipant` is its own wallet (`cashBalance`, `marginUsed`,
`realizedPnL`), and `ContestPosition` / `ContestHolding` are its own
position/holding books - structurally identical to `Wallet` / `Position` /
`Holding` but keyed by `contestParticipantId` instead of `userId`. An `Order`
belongs to exactly one of the two: `contestParticipantId` is null for a
personal-account order, set for a contest order (see
`backend/prisma/schema.prisma`).

`OrderEngine.placeOrder` takes an optional `contestId`. When present, it:

1. Looks up the caller's `ContestParticipant` row for that contest (rejects
   with 403 if they haven't joined).
2. Confirms the contest is `ACTIVE` and within its `startDate`/`endDate`.
3. Runs the exact same MARKET/LIMIT/SL fill logic as a personal order, but
   debits/credits `ContestParticipant.cashBalance` and nets into
   `ContestPosition`/`ContestHolding` via `ContestPortfolioService` (a
   line-for-line mirror of `PortfolioService`, kept separate on purpose so
   the two ledgers can never cross-contaminate).

## How the leaderboard is computed

`engine/LeaderboardService.ts`:

1. For every participant, build their NAV series from
   `ContestPortfolioSnapshot` (periodic snapshots - see below). NAV = cash +
   margin used + mark-to-market value of open positions/holdings at the
   snapshot instant.
2. `returnPct = (latestNAV - startingCash) / startingCash * 100`
3. `riskScore` = standard deviation of period-over-period % NAV returns
   (volatility - a choppier equity curve scores higher/worse).
4. `maxDrawdownPct` = largest peak-to-trough % decline in the NAV series.
5. Both `returnPct` and `riskScore` are z-score normalized **within the
   contest** (relative to the other participants that contest, not some
   fixed scale):
   ```
   zReturn = (returnPct - mean(returnPct across participants)) / stddev(...)
   zRisk   = (riskScore - mean(riskScore across participants)) / stddev(...)
   compositeScore = contest.returnWeight * zReturn - contest.riskWeight * zRisk
   ```
6. Sort descending by `compositeScore` → that's the rank.

`Contest.returnWeight` / `Contest.riskWeight` (set at contest creation, both
in `[0, 1]`) let a host tune the tradeoff - e.g. a "steady hands only"
contest could set `riskWeight: 0.8, returnWeight: 0.2` so volatility
dominates the ranking; a pure momentum contest could set `riskWeight: 0`.

## Duration and automatic square-off

Contests are created with a `durationType`: `WEEKLY`, `MONTHLY`,
`HALF_YEARLY`, `YEARLY`, or `CUSTOM`. For the four presets, the admin only
picks a start date - the end date is computed automatically (start + 7
days / +1 month / +6 months / +1 year) with its time-of-day pinned to
market close, so the contest's last day always ends at close rather than
some arbitrary hour. `CUSTOM` lets the admin set both dates directly.

When a contest's `endDate` passes, `engine/ContestEndService.ts`
automatically force-closes **every** open `ContestPosition` and
`ContestHolding` for every participant - both intraday and
delivery/carry-forward, since the whole contest is ending - at the
then-current market price, realizes the P&L into each participant's
virtual cash, and locks the final leaderboard. Full detail (including the
idempotency guard and the admin's manual "End Now" override) is in
[`docs/ADMIN.md`](ADMIN.md#automatic-square-off-at-contest-end).

If the contest carries a cash prize pool, ending it also triggers
`PrizeService.computeAwards` right after the leaderboard locks, turning the
now-final ranks into per-winner prize awards (gross amount, TDS deducted,
net payable) for an admin to review and release. See
[`docs/PRIZES_AND_PAYOUTS.md`](PRIZES_AND_PAYOUTS.md).

## Snapshot cadence

`jobs/ContestSnapshotScheduler.ts` runs every 15 minutes:

1. Flips contest status `UPCOMING → ACTIVE` once `startDate` passes, and
   `ACTIVE → ENDED` once `endDate` passes.
2. For every `ACTIVE` contest, computes and stores a
   `ContestPortfolioSnapshot` (NAV) for every participant.
3. Recomputes and caches that contest's leaderboard (`rank`, `returnPct`,
   `riskScore`, `maxDrawdownPct`, `compositeScore` on `ContestParticipant`)
   so `GET /api/contests/:id/leaderboard` can serve instantly without
   recomputing on every request.

Joining a contest immediately writes one snapshot at par (NAV = starting
cash), so day-one volatility isn't undefined.

Tighten `*/15 * * * *` to something like `*/5 * * * *` in
`ContestSnapshotScheduler.ts` for shorter contests (e.g. a 2-hour intraday
contest) where 15-minute snapshots would be too coarse to see meaningful
NAV movement.

## API

All endpoints require `Authorization: Bearer <jwt>`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/contests?status=ACTIVE` | List contests, optional status filter |
| `GET` | `/api/contests/:id` | Contest detail |
| `POST` | `/api/contests/:id/join` | Join - creates your `ContestParticipant` at the contest's starting cash |
| `GET` | `/api/contests/:id/me` | Your contest wallet/positions/holdings |
| `GET` | `/api/contests/:id/leaderboard` | Cached ranked leaderboard (`?recompute=true` forces a fresh calculation) |
| `POST` | `/api/orders` (existing route) | Add `"contestId": "<id>"` to the body to place the order inside that contest instead of your personal account |
| `GET` | `/api/orders?contestId=<id>` | Order history scoped to that contest (omit `contestId` for personal-account history) |

## Frontend

- `pages/Contests.tsx` - browse/filter contests by status, host a new one.
- `pages/ContestDetail.tsx` - contest info, join button, your contest
  wallet once joined, top-5 leaderboard preview.
- `pages/Leaderboard.tsx` - full ranked table with return%, risk, drawdown,
  composite score; highlights your own row.
- `pages/Trade.tsx` - reads `?contestId=` from the URL; when present, shows
  a banner and tags every order placed with that contest so it hits the
  isolated contest ledger instead of the personal one.

## What a production version would add

- Prize/reward configuration and payout-adjacent bookkeeping (still virtual).
- Sector/segment-restricted contests (e.g. "F&O only", "Nifty 50 stocks only").
- WebSocket push of live rank changes instead of polling the leaderboard
  endpoint.

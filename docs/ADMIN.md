# Admin Panel

Contest hosting is admin-only, and admins are a deliberately separate
identity from regular users - a different database table (`Admin`, not
`User`), a different login endpoint, and a different JWT secret
(`ADMIN_JWT_SECRET`, not `JWT_SECRET`). A regular user's token is never
valid on an admin route and an admin's token is never valid on a user
route - they're not the same session with a role flag, they're two
unrelated auth systems that happen to share a database and a frontend
build.

## Creating the first admin

There's no public admin sign-up page - if there were, anyone could grant
themselves contest-hosting power. Instead:

```bash
cd backend
# in .env: ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD, ADMIN_SEED_NAME
npm run seed:admin
```

This upserts one `Admin` row from those three env vars (safe to re-run - it
just resets that admin's password if the email already exists). Log in at
`/admin/login` in the frontend, or `POST /api/admin/auth/login` directly.

Once you have one admin, they can create more via
`POST /api/admin/auth/admins` (requires an admin bearer token) - no need to
touch the seed script again.

## What admins can do

Everything under `/api/admin/*`, gated by `requireAdminAuth`
(`backend/src/middleware/adminAuth.middleware.ts`):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/auth/login` | Admin login → admin JWT |
| `GET` | `/api/admin/auth/me` | Current admin's profile |
| `POST` | `/api/admin/auth/admins` | Provision another admin |
| `POST` | `/api/admin/contests` | Create a contest |
| `GET` | `/api/admin/contests` | List all contests (any status) |
| `GET` | `/api/admin/contests/:id` | Contest detail + full participant roster |
| `PATCH` | `/api/admin/contests/:id` | Edit a contest (only while `UPCOMING`) |
| `POST` | `/api/admin/contests/:id/cancel` | Cancel a contest |
| `POST` | `/api/admin/contests/:id/end-now` | Force end + square-off immediately, regardless of `endDate` |
| `GET` | `/api/admin/contests/:id/prizes` | Current prize pool + slabs |
| `PUT` | `/api/admin/contests/:id/prizes` | Set prize pool + slabs (locked once awards are computed) |
| `POST` | `/api/admin/contests/:id/prizes/compute` | Manually (re)compute awards from the final leaderboard |
| `GET` | `/api/admin/contests/:id/prizes/awards` | Per-winner award list incl. live KYC/bank status |
| `POST` | `/api/admin/prizes/:awardId/recompute-status` | Re-check one award's KYC/bank eligibility |
| `POST` | `/api/admin/prizes/:awardId/release` | Release the payout (bank transfer or wallet credit) |
| `GET` | `/api/admin/live-trading/accounts` | List every user's live trading account status |
| `POST` | `/api/admin/live-trading/accounts/:userId/suspend` | Suspend a user's live trading (always wins over ENABLED) |
| `POST` | `/api/admin/live-trading/accounts/:userId/reinstate` | Reinstate a suspended account to ELIGIBLE |
| `POST` | `/api/admin/live-trading/accounts/:userId/grant-eligibility` | Manually grant live trading eligibility |
| `GET` | `/api/admin/live-trading/accounts/:userId/orders` | Full live order + event audit trail for a user |

See [`docs/PRIZES_AND_PAYOUTS.md`](PRIZES_AND_PAYOUTS.md) for the full prize
pool → award → release flow, TDS calculation, and regulatory caveats, and
[`docs/LIVE_TRADING.md`](LIVE_TRADING.md) for the live trading oversight
model.

Regular users only ever hit the read/join endpoints under `/api/contests`
(see `docs/CONTESTS.md`) - `POST /api/contests` no longer exists; contest
creation moved entirely to `/api/admin/contests`.

## Contest duration presets

When creating a contest, an admin picks a `durationType`:
`WEEKLY | MONTHLY | HALF_YEARLY | YEARLY | CUSTOM`.

- **WEEKLY / MONTHLY / HALF_YEARLY / YEARLY**: admin supplies only a
  `startDate`; `endDate` is computed automatically
  (`backend/src/utils/contestDuration.ts`) as start + 7 days / +1 month /
  +6 months / +1 year, with the *time-of-day* pinned to
  `CONTEST_MARKET_CLOSE_TIME` (default `15:30`) so the contest's last day
  always ends at market close, not at some arbitrary hour that happens to
  match when the admin filled out the form.
- **CUSTOM**: admin supplies both `startDate` and `endDate` directly (same
  as the original contest design before duration presets existed).

## Automatic square-off at contest end

This is the actual "on last day closing of market all positions will
square off automatically" behavior. `jobs/ContestSnapshotScheduler.ts` runs
every 15 minutes and, for every `ACTIVE` contest whose `endDate` has
passed, calls `engine/ContestEndService.ts`, which for every participant:

1. Fetches the current LTP (via the active broker adapter) for every
   instrument they hold in that contest.
2. Closes every open `ContestPosition` **and** `ContestHolding` - both
   intraday and delivery/carry-forward, since the contest itself is ending,
   not just the trading day - crediting realized P&L to
   `ContestParticipant.cashBalance` and releasing any blocked margin.
3. Records a closing `Order` (`rejectionReason: "CONTEST_END_SQUAREOFF"`)
   for each position/holding closed, so the participant's order history
   shows exactly what got liquidated and at what price.
4. Takes a final NAV snapshot and recomputes the leaderboard, so the
   ranking an admin/participant sees after a contest ends reflects fully
   realized results, not open paper marks.
5. Sets `Contest.status = ENDED` and `Contest.squaredOffAt = <timestamp>`.
6. If the contest has a prize pool, turns it + the now-final ranks into
   per-winner `ContestPrizeAward` rows (`PrizeService.computeAwards`) - see
   [`docs/PRIZES_AND_PAYOUTS.md`](PRIZES_AND_PAYOUTS.md).

`squaredOffAt` makes this idempotent - `ContestEndService.endContest` checks
it first and no-ops if already set, so it's safe for the admin's manual
"End Now" button and the scheduler to both potentially call it around the
same contest.

Because the scheduler runs every 15 minutes, actual square-off can lag the
contest's true `endDate` (market close) by up to 15 minutes. Shorten the
cron expression in `ContestSnapshotScheduler.ts` if you need tighter timing
(e.g. for short intraday contests).

## Frontend

- `pages/admin/AdminLogin.tsx` - separate login form, posts to
  `/api/admin/auth/login`, stores the token under `localStorage.adminToken`
  (not `token`, so a regular user session and an admin session can coexist
  in the same browser).
- `pages/admin/AdminDashboard.tsx` - list/filter contests by status, create
  a new one (duration preset dropdown + conditional custom-date fields).
- `pages/admin/AdminContestDetail.tsx` - full participant roster with live
  rank/return/risk/score, "End Now" (manual force square-off), "Cancel
  Contest", and a link to "Manage Prizes & Payouts".
- `pages/admin/AdminContestPrizes.tsx` - prize pool + rank-slab editor, and
  the per-winner award table (gross/TDS/net, KYC + bank status, Release
  button) - see [`docs/PRIZES_AND_PAYOUTS.md`](PRIZES_AND_PAYOUTS.md).
- `pages/admin/AdminLiveTrading.tsx` - every user's live trading account
  status, suspend/reinstate, manual eligibility grant, and a per-user live
  order + event audit trail - see [`docs/LIVE_TRADING.md`](LIVE_TRADING.md).
- `store/AdminAuthContext.tsx` / `services/adminApi.ts` - separate React
  context and axios instance from the regular user ones
  (`store/AuthContext.tsx` / `services/api.ts`), so the two sessions never
  cross-contaminate on the frontend either.
- Routing: `App.tsx` renders a completely different nav/layout for any
  `/admin/*` path (`AdminApp`) vs. everything else (`UserApp`) - admins
  don't see the regular trading nav and vice versa.

## What a production version would add

- Real admin roles/permissions (`Admin.role` already exists as a plain
  string - e.g. `SUPER_ADMIN` who can provision other admins vs.
  `CONTEST_MANAGER` who can only manage contests).
- Audit log of admin actions (contest create/edit/cancel/end-now).
- Email/notification to participants when a contest they joined ends.
- A dedicated background worker/queue for square-off instead of an inline
  cron job, so a very large contest doesn't block the same process's other
  scheduled work while it liquidates thousands of positions.

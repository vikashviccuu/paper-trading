# Contest Prizes & Payouts

Contests can carry a real cash prize pool on top of the leaderboard. This
doc covers how a pool splits across winners, how TDS is calculated, how an
admin reviews and releases payouts, and - importantly - what this
scaffolding does *not* handle that a real-money product would need.

## Flow

```
Admin sets Contest.totalPrizePool + ContestPrizeSlab[]
  (e.g. rank 1 = 50%, rank 2-3 = 30% split evenly, rank 4-10 = 20% split evenly)
        │
        ▼
Contest ends (ContestEndService) → LeaderboardService locks final ranks
        │
        ▼
PrizeService.computeAwards (automatic, once - guarded by Contest.prizesComputedAt)
  → one ContestPrizeAward per winning rank:
      grossAmount, tdsAmount (flat TDS_RATE_PCT), netAmount,
      payoutPreference (snapshot of the user's profile setting),
      payoutStatus: PENDING_KYC | PENDING_BANK | READY
        │
        ▼
Admin reviews /admin/contests/:id/prizes
  → sees each winner's live KYC + bank verification status
  → clicks "Refresh" to re-check eligibility, "Release" once READY
        │
        ▼
PrizeService.release → IPayoutProvider.initiatePayout to the user's verified
  bank account (BOTH preferences - no broker API can deposit cash for us)
        │
        ▼
If payoutPreference === PROP_TRADING and the payout succeeded:
  LiveTradingAccountService.grantEligibility - see docs/LIVE_TRADING.md
```

## Prize pool configuration

`Contest.totalPrizePool` (₹) plus one or more `ContestPrizeSlab` rows, each
`{ rankFrom, rankTo, percentage }` - the slab's percentage of the pool is
split evenly across every rank in its range. Slabs don't have to cover every
participant; ranks outside any slab simply get no prize. Configured from
`PUT /api/admin/contests/:id/prizes` (`AdminContestPrizesAPI.setConfig`) -
locked (400 error) once `Contest.prizesComputedAt` is set, i.e. once awards
have actually been computed, so a pool/split can't change out from under a
winner after the fact.

## Computing awards

`PrizeService.computeAwards(contestId)` - called automatically by
`ContestEndService.endContest` right after the final leaderboard is locked,
or manually via `POST /api/admin/contests/:id/prizes/compute`. Idempotent
(`Contest.prizesComputedAt` guard): safe to call more than once, and never
re-prices an existing award. For each slab's rank range, the per-winner
amount is `totalPrizePool * slab.percentage / 100 / winnersInSlab`.

## TDS (tax deducted at source)

A flat `TDS_RATE_PCT` (default 30, `.env`) is deducted from every award's
gross amount - `tdsAmount = gross * TDS_RATE_PCT / 100`,
`netAmount = gross - tdsAmount`. This matches India's "net winnings from
online games" rule: **Section 194BA** of the Income Tax Act, 1961 (in force
through 31 Mar 2026), continued as **Section 393(3)** of the Income Tax Act,
2025 (effective 1 Apr 2026) - both apply a flat 30% TDS with **no minimum
threshold** (unlike most other TDS sections, this one applies from the
first rupee of net winnings). Confirmed current as of Aug 2026 via web
search; re-verify against the Income Tax Department / a tax professional
before relying on this for a live product, since rates and thresholds are
set by the Finance Act and can change.

**This project does not**: issue Form 16A / TDS certificates, remit the
deducted TDS to the government (via Form 26Q / TRACES), aggregate winnings
"net of entry fees across the financial year" the way the real formula
technically requires for multiple contests, or account for GST on platform
fees. `tdsAmount` is tracked per award for record-keeping only - actual TDS
compliance (deposit, quarterly returns, certificates) is a real accounting
obligation that sits outside this codebase.

## Payout preference

`UserProfile.payoutPreference` (`CASH_WITHDRAWAL` default, or
`PROP_TRADING`) - set from the Profile page (`PATCH /api/profile/payout-preference`).
Snapshotted onto `ContestPrizeAward.payoutPreference` at computation time,
so changing the preference later never retroactively changes an
already-computed award.

Both preferences require `Kyc.status = VERIFIED` and at least one
`BankAccount` with `verificationStatus = VERIFIED` (see
`docs/KYC_AND_BANKING.md`) - net winnings are always paid to that account
via the configured `IPayoutProvider`, since no broker API can deposit real
cash into a user's account on our behalf. The two preferences differ only in
what happens *in addition* to that payout:

- **CASH_WITHDRAWAL**: nothing further - the money is in the user's bank
  account, done.
- **PROP_TRADING**: a successful payout also calls
  `LiveTradingAccountService.grantEligibility`, unlocking Live Trading for
  that user - once they link their own broker and opt in, they can trade
  that (now real, in-hand) capital for real through their own account. See
  `docs/LIVE_TRADING.md` for the full eligibility → link → enable flow, the
  self-custody execution model, and SEBI compliance notes. This is the
  closest honest interpretation of "prop trading capital" available given
  that no broker API can fund a user's account directly - the platform
  cannot hand someone tradeable capital any other way than through their
  own bank/broker.

## Eligibility gating (`PrizePayoutStatus`)

`PrizeService.determineEligibility` runs at computation time and again
(via `recomputeEligibility`) right before every release attempt, so a user
who finishes KYC or adds a bank account *after* awards were computed isn't
stuck:

| Status | Meaning |
|---|---|
| `PENDING_KYC` | `Kyc.status` isn't `VERIFIED` yet |
| `PENDING_BANK` | No `VERIFIED` bank account on file (required for both preferences now) |
| `READY` | Eligible - admin can release |
| `PROCESSING` | A payout call is in flight |
| `PAID` | Payout confirmed by the provider |
| `CREDITED_TO_WALLET` | Legacy status from an earlier version of this feature (internal wallet credit) - no longer set by `PrizeService`, kept in the enum for backward compatibility |
| `FAILED` | Provider call failed - can be retried from the admin page |

## Admin release action

`POST /api/admin/prizes/:awardId/release` (`PrizeService.release`) always
re-validates eligibility immediately before paying - it never trusts a
stale `READY` from computation time. For `PROP_TRADING` it's a single
Prisma transaction crediting `Wallet.cashBalance`. For `CASH_WITHDRAWAL` it
calls `IPayoutProvider.initiatePayout` with the award id as the idempotency
key (`transferId`), so retrying a `FAILED` release is safe.

## Payout provider adapter

Same pattern as brokers (`IBrokerAdapter`) and KYC (`IKycProvider`):
`backend/src/payouts/IPayoutProvider.ts` defines `initiatePayout` /
`getPayoutStatus`; `MockPayoutProvider` and `CashfreePayoutProvider`
implement it; `PayoutProviderFactory.getPayoutProvider()` picks one via
`PAYOUT_PROVIDER` in `.env`. `PrizeService` only ever calls through the
interface.

### Cashfree Payouts

**Docs:** https://www.cashfree.com/docs/api-reference/payouts/overview

Confirmed structure (fetched directly from the docs page): **Beneficiary
management** (Create/Get/Remove Beneficiary V2) plus **Standard Transfer
V2** and **Get Transfer Status V2** for single bank-account disbursements,
with **Batch Transfer V2**, **Validate Payout V2** / **Process Validated
Payout V2** ("Verify and Pay" UPI flow), Cashgram one-time payout links,
Card Payouts, and **Webhooks V2** for real-time status also available if
you want to extend this later.

1. Sign up at https://merchant.cashfree.com and enable the **Payouts**
   product (separate from Verification Suite, used for KYC/bank
   verification - see `docs/KYC_AND_BANKING.md`).
2. Get your Payouts API credentials from the merchant dashboard →
   Payouts → Developers → API Keys.
3. Add to `backend/.env`:
   ```
   PAYOUT_PROVIDER=CASHFREE
   CASHFREE_PAYOUT_CLIENT_ID=
   CASHFREE_PAYOUT_CLIENT_SECRET=
   ```
4. **Important:** `CashfreePayoutProvider.ts`'s exact request/response field
   names (`beneficiary_id`, `transfer_amount`, `transfer_mode`, etc.) follow
   Cashfree's documented V2 conventions but were **not verified against a
   live sandbox call** in this environment - re-check them against the docs
   link above before processing a real payout. This is the same caveat
   `SetuKycProvider.ts` carries in `docs/KYC_AND_BANKING.md`.

### Running without any provider account (MOCK mode)

`PAYOUT_PROVIDER=MOCK` (the default) uses `MockPayoutProvider.ts`, which
always "succeeds" instantly - lets the whole compute → review → release
flow be exercised end to end with no third-party account, the same role
`MockKycProvider`/`MockAdapter` play elsewhere in this project.

## Regulatory scope notes - read before handling real money

This feature is architectural scaffolding for a prize-payout flow, **not**
a compliant real-money payout system on its own. Before running this with
real cash prizes in India:

- **Games-of-skill legal status varies by state.** Several Indian states
  restrict or ban real-money games (including games-of-skill in some
  readings), and the regulatory landscape has shifted multiple times in
  recent years (state bans, the erstwhile self-regulatory-body approach,
  and central-level online gaming legislation). Get a legal opinion on
  which states you can legally operate a real-money contest in before
  launching - this is not something to infer from the code.
- **Payment aggregator / RBI compliance.** Actually moving money (both
  collecting any entry fees and disbursing payouts) through Cashfree or any
  other PA/PG requires your own merchant agreement, KYC with the payment
  aggregator, and compliance with RBI's Payment Aggregator regulations -
  none of that is handled by this codebase, which only calls the payout
  API as an authenticated merchant would.
- **TDS deposit & filing.** As noted above, this project computes and
  displays `tdsAmount` but does not deposit it with the government or file
  the associated TDS returns (Form 26Q) / issue Form 16A certificates -
  that's a real compliance workflow (typically via your accounting/payroll
  system or a tax professional), separate from this application.
- **AML/PMLA.** Real-money payouts are a natural target for money
  laundering - a production system needs transaction monitoring, source-
  of-funds checks for large payouts, and PMLA reporting obligations that
  this project's KYC flow (PAN + bank penny-drop only, see
  `docs/KYC_AND_BANKING.md`) does not fully satisfy on its own.
- **Audit trail.** `ContestPrizeAward.payoutRaw` stores the raw provider
  response for every attempt, and `releasedByAdminId`/`paidAt` record who
  released what and when - a reasonable starting audit trail, but a
  production system should also rate-limit/alert on unusual release
  patterns and reconcile provider webhooks (`Webhooks V2`) rather than
  trusting only the synchronous response.

See `docs/KYC_AND_BANKING.md#security-notes` for the related data-handling
caveats (PAN/bank account encryption at rest, DPDP Act 2023 compliance)
that apply equally here since payouts flow through the same KYC/bank data.

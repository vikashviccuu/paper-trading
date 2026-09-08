# Live Trading

Everything else in this project is a simulator: paper accounts and contest
accounts never move real money, and `IBrokerAdapter` deliberately has no
order-placement method (see `docs/ARCHITECTURE.md`). This feature is the one
deliberate exception - a user can, if eligible, place real orders that
execute for real money through their own linked broker account. Read this
document in full before enabling it.

## Execution model

**Self-custody only.** No broker API (Kite Connect, Upstox, SmartAPI, Breeze
Connect) has any endpoint that lets a third-party platform deposit cash into
a user's trading account - real money only enters a live broker account via
the user's own bank transfer to their broker. Given that, this codebase
implements exactly one execution model:

- Each user links **their own** broker account (`BrokerLink`, extended from
  the schema's original per-user-broker placeholder) with **their own** API
  credentials.
- Every live order executes on **that user's own account**, using **their
  own** access token, via `ILiveTradingAdapter` (`backend/src/liveTrading/`).
  The platform never custodies real client money and never places an order
  against a shared/platform-level broker account.

`LIVE_EXECUTION_MODE=SELF_CUSTODY` (the default and only implemented value)
reflects this. `PLATFORM_POOLED` - one shared broker account executing on
behalf of many users, with the platform tracking each user's share - is
**not implemented**: `LiveOrderService.placeOrder` fails closed with a 501
if `LIVE_EXECUTION_MODE` is set to anything else. That model would make the
platform a de facto broker/intermediary, very likely requiring SEBI
stockbroker or portfolio-manager registration - a real legal/operational
undertaking outside what source code can satisfy on its own, so this
codebase doesn't pretend to implement it.

## How a user gets here: eligibility → link → enable

```
NOT_ELIGIBLE
   │  a PROP_TRADING contest prize award is paid out (PrizeService.release),
   │  or an admin grants eligibility directly
   ▼
ELIGIBLE
   │  user links a broker (their own credentials) and explicitly opts in -
   │  never automatic (see docs/PRIZES_AND_PAYOUTS.md - the payout
   │  preference choice unlocks eligibility, it does not itself flip the
   │  account live)
   ▼
ENABLED  ←──────────────┐
   │  admin risk control  │  user can re-enable anytime (goes back to
   ▼                      │  ELIGIBLE, not NOT_ELIGIBLE, on disable)
SUSPENDED ────────────────┘  (admin reinstate → ELIGIBLE, not straight to ENABLED)
```

`LiveTradingAccountService` owns this state machine; see
`docs/PRIZES_AND_PAYOUTS.md` for how a PROP_TRADING award interacts with it
(short version: the award still pays real money to the user's bank exactly
like a CASH_WITHDRAWAL award, since that's the only real fund-movement path
available - PROP_TRADING's distinct effect is granting this eligibility).

KYC must be `VERIFIED` before a user can move from ELIGIBLE to ENABLED, and
again before every order placement (`LiveOrderService.placeOrder` re-checks
it, not just at enable time).

## Trading terminal: account mode

The trading terminal (`frontend/src/pages/Trade.tsx`) now has three account
contexts a user can be in:

- **Paper** (default) - the existing virtual matching engine, unchanged.
- **Contest** (`?contestId=`) - the existing isolated per-contest virtual
  ledger, unchanged.
- **Live** (`?mode=live`, only reachable if `LiveTradingAccount.status ===
  ENABLED`) - `LiveOrderTicket.tsx` renders instead of the paper order form,
  with a persistent red "LIVE TRADING - REAL MONEY" banner and a mandatory
  OTP confirmation step before the Place Order button is enabled at all.

These three never mix in the same order: an order is routed to exactly one
of the paper `Order` table, a contest's `ContestPosition`/`ContestHolding`
tables, or the real broker via `LiveOrder` - see
`backend/src/services/LiveOrderService.ts`.

## Per-order checks (`LiveOrderService.placeOrder`)

In order, every one of these can reject an order:

1. `LIVE_TRADING_ENABLED` (deployment-level kill switch, default `false`).
2. `LIVE_EXECUTION_MODE === SELF_CUSTODY` (see above).
3. Account `status === ENABLED` and `killSwitchActive === false`.
4. `Kyc.status === VERIFIED`.
5. Daily order count under `LiveTradingAccount.dailyOrderLimit`; order value
   under `maxOrderValue` for non-MARKET orders (basic pre-trade risk
   controls, user-editable within an admin-set ceiling from the Live
   Trading setup page).
6. A **fresh** 2FA confirmation - an OTP verified for purpose
   `LIVE_ORDER_2FA` within `LIVE_ORDER_2FA_VALIDITY_MINUTES` (default 5) of
   this specific order. See "SEBI compliance notes" below for why this
   exists.

The `LiveOrder` row (with an immutable `rawRequest` snapshot) is written
**before** the broker call, and a `LiveOrderEvent` is appended for every
state transition (`PLACED`, `BROKER_ACK`, `CANCELLED`, `REJECTED`,
`STATUS_POLL`, ...) - so even a crash mid-call, or a broker outage, leaves
an audit trail rather than silently losing the attempt.

## Broker adapters (`backend/src/liveTrading/`)

Same adapter-interface pattern used everywhere else in this project
(`IBrokerAdapter`, `IKycProvider`, `IPayoutProvider`) - `ILiveTradingAdapter`
defines `placeOrder`/`modifyOrder`/`cancelOrder`/`getOrderStatus`/
`getPositions`/`getHoldings`, and `LiveTradingAdapterFactory.getLiveTradingAdapter(provider)`
picks an implementation **per broker**, not per deployment (`BrokerFactory`
for market data is one adapter for the whole app; this is one adapter class
per broker, instantiated fresh with the calling user's own access token on
every call - the adapter classes hold no per-user secrets themselves).

| Broker | Adapter | Built against |
|---|---|---|
| Zerodha | `ZerodhaLiveTradingAdapter.ts` | kiteconnect npm package's real `placeOrder`/`modifyOrder`/`cancelOrder`/`getOrderHistory`/`getPositions`/`getHoldings` methods - same package as the market-data adapter |
| Upstox | `UpstoxLiveTradingAdapter.ts` | Upstox API v2 REST order endpoints |
| Angel One | `AngelOneLiveTradingAdapter.ts` | SmartAPI REST order endpoints |
| ICICI Direct | `IciciDirectLiveTradingAdapter.ts` | Breeze Connect - **not verified against a live sandbox call in this environment**, see the caveat in that file and re-check field names against https://api.icicidirect.com/breezeapi/documents/index.html before going live |
| (any) | `MockLiveTradingAdapter.ts` | No real account/network call at all - the only adapter safe to point a demo or test deployment at |

### Linking a broker (manual token entry, not full OAuth)

`BrokerLinkService.link` is a pragmatic **manual-token-paste** flow: the
user completes their broker's own login (and, for Angel One, TOTP) flow
themselves in a separate tab, then pastes the resulting access token into
the Live Trading setup page. This is NOT the OAuth login-redirect
integration a production deployment needs (see the compliance note below) -
it's the fastest way to exercise the whole eligibility → enable → order →
audit flow without building four separate OAuth redirect handlers.

- **Zerodha**: same manual flow documented in
  `docs/BROKER_API_SETUP.md#zerodha-kite-connect` - log in via the Kite
  Connect login URL, capture `request_token`, exchange for an
  `access_token`.
- **Upstox**: same OAuth authorization-code flow as
  `docs/BROKER_API_SETUP.md#upstox` - the resulting `access_token` is what
  you paste in.
- **Angel One**: log in via SmartAPI's TOTP-based `loginByPassword` (see
  `AngelOneAdapter.authenticate`) - the returned JWT is what you paste in.
- **ICICI Direct**: log in at
  `https://secure.icicidirect.com/apiuser/login?api_key=<ICICI_BREEZE_API_KEY>`,
  copy the session token from the redirect.

## SEBI compliance notes (as of Aug 2026) - read before enabling for real users

This schema/service design is informed by two current SEBI frameworks, but
**does not by itself make the platform compliant** - production use requires
real operational steps outlined below, not just running this code.

- **SEBI's Feb 2025 circular, "Safeguarding Retail Investors in
  Algorithmic Trading"** (compliance deadline extended to 1 Oct 2025, so
  already in force): OAuth-based authentication and two-factor
  authentication are mandated for API-based order placement; open/shared
  API keys are prohibited - access must be via a unique vendor
  client-specific API key plus a broker-whitelisted static IP; every
  algo/API order must carry a unique exchange-issued **Algo ID**; and,
  critically, **API/algo providers must be empanelled as an agent of a
  registered broker (the broker is the "principal") and cannot connect
  directly to an exchange**. What this means for this codebase:
  - The per-order 2FA requirement is implemented (`LIVE_ORDER_2FA`, step 6
    above). The OAuth requirement is **not** - see "manual token entry"
    above; replace it with each broker's real OAuth redirect flow before
    production use.
  - `LiveOrder.algoId` exists in the schema and is threaded through to
    every adapter, but is left `undefined` by `LiveOrderService` - a real
    Algo ID can only be obtained by actually completing empanelment with
    each broker/exchange, which is an operational registration process,
    not a code change.
  - **Before offering this to users beyond yourself, get your own legal
    read on whether your deployment needs to complete that broker
    empanelment** - a single retail user running this against their own
    account for their own orders is a very different posture than a
    platform offering it to many third-party users.
- **SEBI (Stock Brokers) Regulations, 2026**: extends record-retention for
  books/records to **8 years** (up from 5), and requires client order
  records to be kept a **minimum of 3 years** (indefinitely if a dispute is
  raised). `LiveOrder` + the append-only `LiveOrderEvent` trail are designed
  to support this (nothing is ever deleted, only appended to) - but actual
  retention/backup/deletion-prevention policy at the infrastructure level
  (backups, WORM storage, etc.) is an operational responsibility outside
  this codebase.

None of the above makes this platform a substitute for your own compliance
review. If you intend to let real third-party users place live orders
through this feature, talk to a securities lawyer familiar with SEBI's
algo-trading and stockbroker frameworks first.

## Risk controls

- **Kill switch** (`LiveTradingAccount.killSwitchActive`) - instant stop on
  new order placement, toggleable by the user or an admin, without fully
  disabling/unlinking the account.
- **Daily order limit / max order value** - basic pre-trade caps, editable
  by the user within an admin-set ceiling (`LIVE_DEFAULT_DAILY_ORDER_LIMIT`
  / `LIVE_DEFAULT_MAX_ORDER_VALUE` in `.env`).
- **Admin suspend/reinstate** (`/admin/live-trading`) - an admin can suspend
  any account (always wins over ENABLED) and view its full order+event
  audit trail.

A production deployment should add real position-level and portfolio-level
risk checks (margin/exposure limits pulled from the broker, not just an
order-count/value cap) - what's here is a starting point, not a complete
risk system.

## Configuration (`.env`)

```
LIVE_TRADING_ENABLED=false          # master kill switch - read this whole doc before setting true
LIVE_EXECUTION_MODE=SELF_CUSTODY    # only implemented value
ICICI_BREEZE_API_KEY=
ICICI_BREEZE_API_SECRET=
LIVE_DEFAULT_DAILY_ORDER_LIMIT=50
LIVE_DEFAULT_MAX_ORDER_VALUE=50000
LIVE_ORDER_2FA_VALIDITY_MINUTES=5
```

Zerodha/Upstox/Angel One live trading reuse the same `KITE_API_KEY` /
`UPSTOX_*` / `ANGEL_API_KEY` app-level credentials already configured for
market data (see `docs/BROKER_API_SETUP.md`) - only the per-user access
token differs, and that comes from each user's own `BrokerLink`, not `.env`.

## Running without any real broker (MOCK mode)

Every route works end to end with `provider: "MOCK"` when linking a
"broker" - `MockLiveTradingAdapter` always succeeds instantly with no
network call and no real account, so the full eligibility → link → enable →
2FA → place → audit flow can be exercised safely. **Never** point a
deployment with `LIVE_TRADING_ENABLED=true` at a mix of MOCK and real
broker links without being very sure which is which - consider disabling
MOCK entirely (remove it from the allowed provider list in
`liveTrading.routes.ts`) once you're ready to go live for real.

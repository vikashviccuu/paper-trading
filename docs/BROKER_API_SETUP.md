# Broker API Setup Manual

This platform never places real orders or moves real money — every trade is
recorded in the app's own database against a virtual wallet. Brokers are
used **only as a data source**: instrument master, quotes, historical
candles, option chains, and live ticks. You can wire up one broker or all
three; the active one is selected with `BROKER_PROVIDER` in `backend/.env`.

Pricing below was current as of August 2026 — broker fee structures change,
so re-check the official pages before you rely on this for budgeting.

---

## Zerodha Kite Connect

**Docs:** https://kite.trade/docs/connect/v3/
**Cost (Aug 2026):** Order placement / account APIs are free. Market data
(live quotes + historical candles) is ₹500/month per API key. You also need
an active Zerodha trading (Kite) account.

### Steps

1. Log in to https://developers.kite.trade with your Zerodha credentials.
2. Click **Create new app**. Choose app type "Connect", give it a name, and
   set a **Redirect URL** (for local dev: `http://localhost:4000/api/broker/zerodha/callback`).
3. You'll get an **API key** and **API secret**. Put them in `backend/.env`:
   ```
   BROKER_PROVIDER=ZERODHA
   KITE_API_KEY=your_api_key
   KITE_API_SECRET=your_api_secret
   ```
4. If you only need order/account APIs, the app is free. If you need live
   ticks and historical candles for charting, subscribe to the data plan
   (₹500/month) from the same developer console.
5. **Daily login flow** (Kite access tokens expire every day around market
   open): direct the user to
   `https://kite.zerodha.com/connect/login?api_key=<KITE_API_KEY>&v=3`.
   After they log in and approve, Zerodha redirects to your Redirect URL
   with `?request_token=...`. `ZerodhaAdapter.authenticate({ requestToken })`
   (see `backend/src/brokers/zerodha/ZerodhaAdapter.ts`) exchanges that for
   an `access_token` — store it in `KITE_ACCESS_TOKEN` or on the user's
   `BrokerLink` row. You (or a scheduled job) need to repeat this every
   trading day.
6. Instrument master: `kc.getInstruments()` — a full CSV/JSON dump of every
   tradable symbol across NSE/BSE/NFO/MCX, refreshed daily. The app syncs
   this into Postgres via `POST /api/market/sync-instruments`.

---

## Upstox

**Docs:** https://upstox.com/developer/api-documentation/open-api
**Cost (Aug 2026):** Free promotional pricing through 31 March 2026 for
trading + market data APIs (excludes GTT orders). Confirm current pricing
at https://upstox.com/developer/api-pricing/ before going live, since this
offer has an end date.

### Steps

1. Log in to https://account.upstox.com/developer/apps with your Upstox
   trading account.
2. Click **New App**. Set a **Redirect URI** (e.g.
   `http://localhost:4000/api/broker/upstox/callback`).
3. Copy the **API Key (client_id)** and **API Secret** into `backend/.env`:
   ```
   BROKER_PROVIDER=UPSTOX
   UPSTOX_API_KEY=your_client_id
   UPSTOX_API_SECRET=your_client_secret
   UPSTOX_REDIRECT_URI=http://localhost:4000/api/broker/upstox/callback
   ```
4. **OAuth2 login flow** (access tokens are valid until ~3:30am IST the
   next day): direct the user to
   `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=<UPSTOX_API_KEY>&redirect_uri=<UPSTOX_REDIRECT_URI>`.
   After login, Upstox redirects with `?code=...`.
   `UpstoxAdapter.authenticate({ code })` (see
   `backend/src/brokers/upstox/UpstoxAdapter.ts`) exchanges that code for an
   `access_token`.
5. Instrument master: Upstox publishes gzipped JSON dumps per exchange
   segment at `https://assets.upstox.com/market-quote/instruments/exchange/<SEGMENT>.json.gz`
   — no auth required, refreshed daily.
6. Note: this adapter polls the REST quote endpoint every 2s for "live"
   ticks rather than using Upstox's binary/protobuf WebSocket feed. Swap in
   the real feed (docs: market-data-feed) if you need sub-second latency.

---

## Angel One SmartAPI

**Docs:** https://smartapi.angelbroking.com/docs
**Cost:** Free — no monthly fee for trading or historical data APIs. You
need an active Angel One trading account.

### Steps

1. Register a developer account at https://smartapi.angelbroking.com using
   your Angel One Client ID.
2. Create an app to get an **API Key**.
3. Enable TOTP-based 2FA on your Angel One account and save the **TOTP
   secret** shown as a QR code / text string during setup — the adapter
   needs this to generate login OTPs programmatically (via the `otplib`
   package), the same way an authenticator app would.
4. **Since 1 April 2026, Angel One requires a registered static IP** for
   any account placing algo-driven orders through the API. If you're
   running this in the cloud, register that server's static IP in your
   Angel One API settings before authenticating — logins will otherwise be
   rejected.
5. Fill in `backend/.env`:
   ```
   BROKER_PROVIDER=ANGELONE
   ANGEL_API_KEY=your_api_key
   ANGEL_CLIENT_ID=your_client_id
   ANGEL_PASSWORD=your_trading_password
   ANGEL_TOTP_SECRET=your_totp_secret
   ```
6. Auth flow: `AngelOneAdapter.authenticate()` (see
   `backend/src/brokers/angelone/AngelOneAdapter.ts`) POSTs
   `clientcode` + `password` + a freshly generated `totp` to
   `/rest/auth/angelbroking/user/v1/loginByPassword` and gets back a JWT
   valid for the session.
7. Instrument master: Angel One publishes a combined JSON scrip master at
   `https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json`.
8. Note: this adapter also polls REST quotes for "live" ticks rather than
   using Angel One's binary WebSocket feed (`WebSocket2` in their docs) —
   swap that in for production latency.

---

## Running without any broker account (MOCK mode)

`BROKER_PROVIDER=MOCK` (the default) uses `backend/src/brokers/mock/MockAdapter.ts`,
a random-walk price simulator seeded with a handful of NSE symbols. Use this
to develop and demo the whole product — signup, order placement, charts,
positions, options chain — before you've registered with any broker.

## Switching brokers later

Because every adapter implements the same `IBrokerAdapter` interface
(`backend/src/brokers/IBrokerAdapter.ts`), switching is just:

1. Fill in that broker's credentials in `.env`.
2. Set `BROKER_PROVIDER` to `ZERODHA`, `UPSTOX`, or `ANGELONE`.
3. Restart the backend.

No route, engine, or frontend code needs to change.

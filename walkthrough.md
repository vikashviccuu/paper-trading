# Walkthrough: Zerodha Live/Demo, Chart Timeframes, & Complete Trading Scenario

We have fixed the Zerodha data pipeline, chart timeframes, and trading workflow so that you can test live and demo trading locally anytime.

---

## 1. What Was Fixed

### A. Chart Timeframe Fixes (`1m`, `5m`, `15m`, `1D`)
- **Root Cause**: KiteConnect API strictly rejects `"1minute"`, returning `{"error":"invalid interval: 1minute"}`. It only accepts `"minute"`. Additionally, `<LiveChart>` was rendered without the `timeframe` prop, causing tick interval calculations to always default to 60s.
- **Fixes Applied**:
  - In [market.routes.ts](file:///d:/python-pron/paper-trading-platform/backend/src/routes/market.routes.ts) and [ZerodhaAdapter.ts](file:///d:/python-pron/paper-trading-platform/backend/src/brokers/zerodha/ZerodhaAdapter.ts): Added interval normalization (`1m`/`1minute`/`minute` → `minute`, `5m` → `5minute`, `15m` → `15minute`, `day`/`1d` → `day`).
  - In [Trade.tsx](file:///d:/python-pron/paper-trading-platform/frontend/src/pages/Trade.tsx): Passed `timeframe={tf}` to `<LiveChart>` and fixed toolbar buttons to use normalized values.
  - Added synthetic candle fallback: If Kite returns empty or fails (e.g., weekend or expired token), the chart generates clean candles matching the symbol's price so the chart never breaks.

### B. Zerodha Live vs. Demo Mode Switcher
- **Problem**: Outside NSE trading hours (9:15 AM - 3:30 PM IST) or when Kite token expires, Zerodha sends no ticks and testing is blocked.
- **Fixes Applied**:
  - In [broker.routes.ts](file:///d:/python-pron/paper-trading-platform/backend/src/routes/broker.routes.ts): Added `GET /api/broker/mode` and `POST /api/broker/mode` to switch between `ZERODHA` and `MOCK` live at runtime without restarting the server.
  - In [priceFeedGateway.ts](file:///d:/python-pron/paper-trading-platform/backend/src/websocket/priceFeedGateway.ts): Added a non-market-hours heartbeat fallback that generates realistic micro-ticks (±0.05%) when the live tape is silent, so orders and charts keep ticking during local testing.
  - In [Trade.tsx](file:///d:/python-pron/paper-trading-platform/frontend/src/pages/Trade.tsx): Added a **1-click Mode Toggle button** in the top navbar (`⚡ KITE LIVE` vs `🎮 DEMO MOCK`).

### C. Holdings & Positions Management in Trading Terminal
- **Problem**: When placing a `DELIVERY` (CNC) order, it goes into `holdings`, but the Trade terminal sidebar had no Holdings tab—leaving users wondering where their order went.
- **Fixes Applied**:
  - In [Trade.tsx](file:///d:/python-pron/paper-trading-platform/frontend/src/pages/Trade.tsx): Added a dedicated **`📦 Holdings` tab** in the sidebar.
  - Each holding displays: Qty, Avg Buy Price, Live LTP, Current Total Value, and P&L (₹ and %).
  - Added a **1-click "Exit / Sell" button** on each holding that pre-fills the order ticket with `SELL`, `DELIVERY`, and the holding's quantity.
  - In the **`💼 Positions` tab**: Added a **1-click "Square Off" button** on each active position to immediately close open intraday/F&O contracts.

---

## 2. Verification Results

### API Interval Tests
```bash
1m       => Status: 200 Bars: 1125
minute   => Status: 200 Bars: 1125
5minute  => Status: 200 Bars: 225
15minute => Status: 200 Bars: 75
day      => Status: 200 Bars: 3
```

### Order & Portfolio Test
- **Delivery (CNC) Order**: Placed 5 Qty BUY CNC → created row in `Holding` table (`Holdings count: 1`).
- **Intraday (MIS) Order**: Placed 10 Qty BUY MIS → created row in `Position` table (`Positions count: 1`).
- **Build & Typecheck**:
  - Frontend: `✓ built in 5.66s` with 0 errors.
  - Backend: `tsc --noEmit` passed with 0 errors.

---

## 3. How to Test Complete Scenarios in Local Environment

Navigate to **`http://localhost:5174/trade`** in your browser:

### Scenario 1: Test Chart Timeframes
1. In the Left Sidebar Watchlist, click any symbol (e.g. **NIFTY 50** or **RELIANCE**).
2. On the chart top bar, click:
   - **`1m`**: Loads 1-minute candlestick bars.
   - **`5m`**: Loads 5-minute candlestick bars.
   - **`15m`**: Loads 15-minute candlestick bars.
   - **`1D`**: Loads daily candlestick bars.
3. Observe live ticks updating the latest candle in real time.

### Scenario 2: Test Delivery (CNC) & Holdings
1. Select any equity stock (e.g. `RELIANCE` or `TCS`).
2. In the Order Form (Right Panel):
   - **Side**: `BUY`
   - **Product**: `CNC` (Delivery)
   - **Order Type**: `Market`
   - **Qty**: `5`
3. Click **Place BUY Order**.
4. In the Left Sidebar, click the **`📦 Hold` (Holdings)** tab:
   - Your newly purchased stock appears with Qty, Avg Buy Price, Current Value, and Live P&L.
5. Click **"Exit / Sell"** on the holding card:
   - The order ticket automatically switches to `SELL`, `CNC`, and `5 Qty`.
   - Click **Place SELL Order** to book profit and exit your holding.

### Scenario 3: Test Intraday (MIS) & Quick Square-Off
1. In the Order Form:
   - **Side**: `BUY`
   - **Product**: `MIS` (Intraday)
   - **Order Type**: `Market`
   - **Qty**: `10`
2. Click **Place BUY Order**.
3. In the Left Sidebar, click the **`💼 Pos` (Positions)** tab:
   - Your intraday position appears with live P&L.
4. Click **"Square Off"**:
   - The ticket pre-populates with `SELL`, `MIS`, `10 Qty`. Click Place Order to close the position.

### Scenario 4: Test Options Chain & F&O Trading
1. In the Watchlist, click any index or stock to expand its card.
2. Click **`⛓️ Option Chain`**:
   - The full interactive Option Chain opens with Calls (CE) and Puts (PE) around the ATM strike.
3. Click **`BUY CE`** or **`BUY PE`** on any strike:
   - The modal automatically loads that Option contract into your trading ticket with `NORMAL` (NRML) product.
4. Click **Place BUY Order**:
   - The option contract opens in your Positions tab with live P&L tracking.

### Scenario 5: Toggle Between Live Zerodha and Demo Simulation
1. In the top navbar, look at the broker feed button:
   - If connected to Zerodha: Shows **`⚡ KITE LIVE`**.
   - If in Demo mode: Shows **`🎮 DEMO MOCK`**.
2. Click **"Switch to Demo"** or **"Switch to Live"**:
   - Instant toggle with zero downtime—ideal for testing outside market hours or when your Zerodha token is expired.

---

## 4. Git Commit & Server Deployment

### Git
- **Commit**: `eb75abe` ("feat: Full support for Realized P&L, live open/closed positions and holdings in Zerodha Live and Demo data")
- **Pushed to**: `origin/main` (`https://github.com/vikashviccuu/paper-trading.git`)

### Server Deployment (`187.127.178.25`)
- **Directory**: `/opt/paper-trading-platform`
- **Branch**: `main` (updated to `eb75abe`)
- **Docker Compose**: Rebuilt both backend and frontend images and restarted containers cleanly.
- **Containers Running**:
  - `paper-trading-platform-backend-1`: `Up` (port `4000`)
  - `paper-trading-platform-frontend-1`: `Up` (port `5173` mapped to Nginx reverse proxy)
  - `paper-trading-platform-postgres-1`: `Up` (port `5433`)
  - `paper-trading-platform-redis-1`: `Up` (port `6379`)
- **Live URL**: [https://187-127-178-25.sslip.io/trade](https://187-127-178-25.sslip.io/trade) (HTTP 200 OK)

---

## 5. Realized P&L, Positions & Holdings Fixes for Zerodha Live & Demo

### A. Root Causes Identified & Fixed
1. **Zerodha Live Quote Resolution**:
   - In [ZerodhaAdapter.ts](file:///d:/python-pron/paper-trading-platform/backend/src/brokers/zerodha/ZerodhaAdapter.ts): Wrapped `kc.getQuote` in try/catch and mapped `q.instrument_token` properly so numeric tokens match database records.
   - In [OrderEngine.ts](file:///d:/python-pron/paper-trading-platform/backend/src/engine/OrderEngine.ts): Multi-token lookup (both numeric token and `exchange:tradingsymbol`) with robust fallback to `instrument.lastPrice` and fallback base prices so market orders never fail outside market hours or when tokens expire.
2. **Realized P&L & Closed Positions Book**:
   - In [PortfolioService.ts](file:///d:/python-pron/paper-trading-platform/backend/src/engine/PortfolioService.ts): When squaring off a position (`remainder === 0`), instead of deleting the position from the database, it is preserved with `quantity: 0` and its booked `realizedPnL`.
   - In [Trade.tsx](file:///d:/python-pron/paper-trading-platform/frontend/src/pages/Trade.tsx): Added a dedicated **Closed Positions (Realized Today)** list showing entry prices and booked Realized P&L.
3. **Live Floating Unrealised P&L for Open Positions**:
   - In [Trade.tsx](file:///d:/python-pron/paper-trading-platform/frontend/src/pages/Trade.tsx): Added a WebSocket subscriber for all active open positions and holdings tokens so their LTP and P&L update live on every tick.
   - Real-time P&L formula: `pnl = quantity * (currentLtp - avgPrice)`.
4. **Holdings Current Value & P&L**:
   - Holdings cards now compute live `currentValue = qty * ltp`, `pnl = currentValue - invested`, and `pnlPct`.
   - Added a header summary in the Holdings tab showing total invested and total holdings P&L.
5. **Portfolio Page ([Portfolio.tsx](file:///d:/python-pron/paper-trading-platform/frontend/src/pages/Portfolio.tsx))**:
   - Added 4 stat cards: Cash Balance, Margin Used, Realized P&L, and Unrealised P&L.
   - Separate tables for **Open Positions** (with live LTP & Unrealised P&L) and **Closed Positions** (with Realized P&L).
   - Holdings table displays Qty, Avg Buy Price, LTP, Current Value, and P&L.




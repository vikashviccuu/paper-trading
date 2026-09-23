# Step-by-Step Contest Trading, Ranking & Scoring User Manual

This manual provides a complete, end-to-end walkthrough for **Joining a Trading Contest**, **Executing Virtual Trades**, and **Verifying Real-Time Performance Metrics (Rank, Return %, Risk Score, Max Drawdown %, Composite Score, and Prize Allocations)** on the platform.

---

## 📑 Table of Contents
1. [Contest Architecture & Rules](#1-contest-architecture--rules)
2. [Step 1: User Login & Authentication](#step-1-user-login--authentication)
3. [Step 2: Browsing & Joining the Contest](#step-2-browsing--joining-the-contest)
4. [Step 3: Accessing the Contest Trading Terminal](#step-3-accessing-the-contest-trading-terminal)
5. [Step 4: Executing Trades (Equities, F&O, Intraday, CNC)](#step-4-executing-trades)
6. [Step 5: Managing Open Positions & Realized PnL](#step-5-managing-open-positions--realized-pnl)
7. [Step 6: Mathematical Scoring & Ranking Formulations](#step-6-mathematical-scoring--ranking-formulations)
8. [Step 7: Verifying Own Rank & Performance on the Leaderboard](#step-7-verifying-own-rank--performance-on-the-leaderboard)
9. [Step 8: Pre-Configured Test Accounts for Verification](#step-8-pre-configured-test-accounts-for-verification)
10. [Step 9: Admin Audit & Prize Pool Distribution](#step-9-admin-audit--prize-pool-distribution)

---

## 1. Contest Architecture & Rules

In this platform, contests operate with **isolated virtual ledgers**:
- Each contest participant receives a dedicated **Contest Virtual Wallet** (e.g. ₹100,000 Starting Cash).
- Contest trading balances and positions are strictly segregated from regular paper trading wallets.
- Participants are ranked not merely on raw profit, but on **Risk-Adjusted Performance (Composite Score)** to reward skillful trading and penalize excessive risk.

### Active Test Contest Details:
- **Contest ID**: `df294030-62c6-480e-b8b4-002fdf09191c`
- **Contest Name**: `test contest`
- **Direct Contest URL**: [https://187-127-178-25.sslip.io/contests/df294030-62c6-480e-b8b4-002fdf09191c](https://187-127-178-25.sslip.io/contests/df294030-62c6-480e-b8b4-002fdf09191c)
- **Direct Trading Terminal URL**: [https://187-127-178-25.sslip.io/trade?contestId=df294030-62c6-480e-b8b4-002fdf09191c](https://187-127-178-25.sslip.io/trade?contestId=df294030-62c6-480e-b8b4-002fdf09191c)
- **Starting Virtual Cash**: ₹100,000.00
- **Weightings**: **60% Return Weight** (`0.60`), **40% Risk Weight** (`0.40`)
- **Total Prize Pool**: ₹10,000.00 (Rank 1: 90% = ₹9,000 | Rank 2: 10% = ₹1,000)

---

## Step 1: User Login & Authentication

1. Navigate to the login page: [https://187-127-178-25.sslip.io/login](https://187-127-178-25.sslip.io/login)
2. Enter your credentials (or one of the test accounts):
   - **Email**: `aarav.alpha@contesttest.com`
   - **Password**: `Password@123`
3. Click **Sign In**.
4. **2FA Security OTP**:
   - If the Two-Factor OTP prompt appears, enter the demo 6-digit code shown directly in the UI modal dialog and click **Verify OTP**.
5. You are redirected to the Dashboard.

---

## Step 2: Browsing & Joining the Contest

1. Click on **Contests** in the navigation bar or open:
   [https://187-127-178-25.sslip.io/contests](https://187-127-178-25.sslip.io/contests)
2. Select **`test contest`** (or open [`/contests/df294030-62c6-480e-b8b4-002fdf09191c`](https://187-127-178-25.sslip.io/contests/df294030-62c6-480e-b8b4-002fdf09191c)).
3. If you have not joined yet:
   - Click the green **Join Contest** button.
   - The platform will allocate **₹100,000.00** in starting virtual cash and record your registration timestamp.
4. If you have already joined:
   - A badge displaying **✓ Registered** and **Trade in Contest** will be visible.

---

## Step 3: Accessing the Contest Trading Terminal

1. From the contest details page, click **Trade in Contest** or open:
   [https://187-127-178-25.sslip.io/trade?contestId=df294030-62c6-480e-b8b4-002fdf09191c](https://187-127-178-25.sslip.io/trade?contestId=df294030-62c6-480e-b8b4-002fdf09191c)
2. The trading terminal loads with the active contest scope:
   - **Right Panel (Virtual Wallet)**: Displays your Contest Cash Balance (e.g. ₹103,150), Realized P&L (+₹5,400.00), and Margin Used.
   - **Left Panel (Watchlist / Search)**: Provides access to all 61,000+ NSE Equities, NFO Futures/Options, and MCX Commodities.
   - **Center Panel (Interactive Chart)**: Displays real-time live candlestick price action and OHLC data.

---

## Step 4: Executing Trades

### Example A: Buying Intraday Equity Shares (e.g. RELIANCE)
1. In the search box on the left, type **`RELIANCE`**.
2. Select **RELIANCE (NSE · EQUITY)**.
3. On the right-hand **Place Order** ticket:
   - **Side**: `BUY` (Green button)
   - **Quantity**: `10`
   - **Order Type**: `MARKET` (or `LIMIT` with a specific price)
   - **Product**: `MIS` (Intraday with 5x leverage / 20% margin)
4. Check the **Margin Required** summary:
   $$\text{Margin} = 10 \times \text{Price} \times 0.20$$
5. Click **Place Order**.
6. A success confirmation `✓ BUY order placed — RELIANCE` appears.

### Example B: Trading Options via Option Chain
1. In the search bar, search for **`NIFTY 50`** or **`BANKNIFTY`**.
2. Click the **Option Chain** button next to the instrument.
3. The Option Chain modal opens showing strikes, LTP, Open Interest, and Implied Volatility.
4. Click **BUY CE** or **BUY PE** on your chosen strike to load the option contract directly into the order ticket.
5. Enter quantity (lots) and submit.

---

## Step 5: Managing Open Positions & Realized PnL

1. Click on the **Positions** tab on the left sidebar.
2. **Open Positions Card**:
   - Shows symbol, quantity, average price, LTP, and live floating unrealized P&L:
     $$\text{Unrealised PnL} = \text{Quantity} \times (\text{LTP} - \text{Average Price})$$
3. **Squaring Off a Position**:
   - Click the red **Square Off** button on the position card.
   - The terminal automatically creates an offsetting market order.
   - Realized profit/loss is permanently credited to your **Realized P&L** and cash balance.

---

## Step 6: Mathematical Scoring & Ranking Formulations

The leaderboard ranking engine computes performance across five distinct mathematical dimensions:

### 1. Net Asset Value (NAV)
The total net liquidation value of the participant's contest portfolio:
$$\text{NAV} = \text{Cash Balance} + \text{Margin Used} + \sum (\text{Unrealised PnL of Open Positions \& Holdings})$$

### 2. Percentage Return (Return %)
$$\text{Return \%} = \left( \frac{\text{Current NAV} - \text{Starting Virtual Cash}}{\text{Starting Virtual Cash}} \right) \times 100$$
*(Example: A NAV of ₹105,925 with ₹100,000 starting cash produces **+5.93%**).*

### 3. Risk / Volatility Score (Risk %)
Calculated as the sample standard deviation of period-over-period percentage returns across the participant's NAV equity curve time-series:
$$R_t = \left( \frac{\text{NAV}_t - \text{NAV}_{t-1}}{\text{NAV}_{t-1}} \right) \times 100$$
$$\text{Risk Score} = \sqrt{\frac{1}{K - 1} \sum_{t=1}^{K} (R_t - \bar{R})^2}$$

### 4. Maximum Drawdown (MDD %)
Measures peak-to-trough capital decline to penalize high drawdown:
$$\text{MDD \%} = \max_{t} \left( \frac{\text{Peak NAV}_t - \text{NAV}_t}{\text{Peak NAV}_t} \right) \times 100$$

### 5. Composite Score (Risk-Adjusted Ranking Metric)
$$\text{Composite Score} = (\text{Return Weight} \times \text{Return \%}) - (\text{Risk Weight} \times \text{Risk Score})$$
With default parameters (60% Return, 40% Risk):
$$\text{Composite Score} = (0.60 \times \text{Return \%}) - (0.40 \times \text{Risk Score})$$

### Deterministic Tie-Breaking Hierarchy:
1. **Composite Score** (Descending — higher score wins)
2. **Return %** (Descending)
3. **Maximum Drawdown %** (Ascending — lower drawdown is better)
4. **Risk / Volatility %** (Ascending — lower volatility is better)
5. **Registration Timestamp** (Ascending — earlier registration wins)

---

## Step 7: Verifying Own Rank & Performance on the Leaderboard

1. Open the Contest Details Page:
   [https://187-127-178-25.sslip.io/contests/df294030-62c6-480e-b8b4-002fdf09191c](https://187-127-178-25.sslip.io/contests/df294030-62c6-480e-b8b4-002fdf09191c)
2. Switch to the **Leaderboard** tab:
   - Your row will be highlighted showing your **Current Rank**, **NAV**, **Return %**, **Risk %**, **Max Drawdown %**, and **Composite Score**.
   - If your rank falls within winning slabs (Rank 1 or Rank 2), your projected prize allocation is shown.
3. Switch to the **Portfolio / My Contest Trades** tab:
   - View your cash balance, locked margin, realized PnL, and completed order history.

---

## Step 8: Pre-Configured Test Accounts for Verification

You can log in to any of the following 5 pre-configured dummy trader accounts to test each rank and behavior:

| Rank | Name | Email | Password | Portfolio Metrics | Composite Score | Prize Won |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 🥇 **#1** | **Aarav Sharma (Alpha Trader)** | `aarav.alpha@contesttest.com` | `Password@123` | • NAV: **₹105,925**<br>• Return: **+5.93%**<br>• Risk: 1.42%<br>• MDD: 0.00% | **+2.989** | **₹9,000.00** *(90%)* |
| 🥈 **#2** | **Pooja Patel (Quant Scalper)** | `pooja.scalper@contesttest.com` | `Password@123` | • NAV: **₹103,000**<br>• Return: **+3.00%**<br>• Risk: 0.86%<br>• MDD: 0.00% | **+1.456** | **₹1,000.00** *(10%)* |
| 🥉 **#3** | **Rohan Gupta (Moderate Trader)** | `rohan.neutral@contesttest.com` | `Password@123` | • NAV: **₹100,800**<br>• Return: **+0.80%**<br>• Risk: 0.23%<br>• MDD: 0.00% | **+0.388** | ₹0.00 |
| **#7** | **Kavita Verma (Passive Trader)** | `kavita.passive@contesttest.com` | `Password@123` | • NAV: **₹100,000**<br>• Return: **0.00%**<br>• 0 Trades (100% Cash) | **0.000** | ₹0.00 |
| **#8** | **Dev Malhotra (YOLO Trader)** | `dev.yolo@contesttest.com` | `Password@123` | • NAV: **₹94,650**<br>• Return: **-5.35%**<br>• Risk: 0.95%<br>• MDD: **5.35%** | **-3.591** | ₹0.00 |

---

## Step 9: Admin Audit & Prize Pool Distribution

1. Log in to the Admin Contest Panel:
   [https://187-127-178-25.sslip.io/admin/contests/df294030-62c6-480e-b8b4-002fdf09191c](https://187-127-178-25.sslip.io/admin/contests/df294030-62c6-480e-b8b4-002fdf09191c)
2. **On-Demand Leaderboard Recomputation**:
   - Click **⚡ Force Recompute Leaderboard** to re-score all participants in real time.
3. **Prize Slabs Review**:
   - **Slab 1**: Ranks 1 to 1 $\rightarrow$ 90% of ₹10,000 = **₹9,000.00**
   - **Slab 2**: Ranks 2 to 2 $\rightarrow$ 10% of ₹10,000 = **₹1,000.00**
4. **Finalizing & Awarding**:
   - When the contest status changes to `ENDED`, the final leaderboard locks, and `PrizeService.computeAwards()` calculates gross payouts, standard TDS deductions, and net payable amounts for winning participants.

import { Router } from "express";
import { env, getZerodhaRedirectUrl } from "../config/env";
import { resetBrokerAdapter, getBrokerAdapter } from "../brokers/BrokerFactory";
import fs from "fs";
import path from "path";

export const brokerRouter = Router();

// Key NSE indices + liquid stocks to show in live quotes
const LIVE_QUOTE_TOKENS = [
  "NSE:NIFTY 50",
  "NSE:NIFTY BANK",
  "NSE:RELIANCE",
  "NSE:INFY",
  "NSE:TCS",
  "NSE:HDFCBANK",
  "NSE:ICICIBANK",
  "NSE:SBIN",
  "NSE:AXISBANK",
  "NSE:WIPRO",
  "NSE:BAJFINANCE",
  "NSE:MARUTI",
];

/**
 * POST /api/broker/zerodha/exchange
 * Body: { requestToken: string }
 * Exchanges Zerodha request_token → access_token, saves to .env, resets adapter.
 */
brokerRouter.post("/zerodha/exchange", async (req, res) => {
  const { requestToken } = req.body;
  if (!requestToken) return res.status(400).json({ error: "requestToken required" });

  try {
    const { ZerodhaAdapter } = await import("../brokers/zerodha/ZerodhaAdapter");
    const adapter = new ZerodhaAdapter(env.KITE_API_KEY, env.KITE_API_SECRET);
    const { accessToken } = await adapter.authenticate({ requestToken });

    // Patch running process
    process.env.KITE_ACCESS_TOKEN = accessToken;
    (env as any).KITE_ACCESS_TOKEN = accessToken;
    process.env.BROKER_PROVIDER = "ZERODHA";
    (env as any).BROKER_PROVIDER = "ZERODHA";

    // Persist to .env file safely
    try {
      const envPath = path.resolve(process.cwd(), ".env");
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
      if (/^KITE_ACCESS_TOKEN=.*/m.test(envContent)) {
        envContent = envContent.replace(/^KITE_ACCESS_TOKEN=.*/m, `KITE_ACCESS_TOKEN=${accessToken}`);
      } else {
        envContent += (envContent.endsWith("\n") || envContent === "" ? "" : "\n") + `KITE_ACCESS_TOKEN=${accessToken}\n`;
      }
      if (/^BROKER_PROVIDER=.*/m.test(envContent)) {
        envContent = envContent.replace(/^BROKER_PROVIDER=.*/m, `BROKER_PROVIDER=ZERODHA`);
      } else {
        envContent += `BROKER_PROVIDER=ZERODHA\n`;
      }
      fs.writeFileSync(envPath, envContent, "utf8");
    } catch (fsErr: any) {
      console.warn("[Zerodha] Warning saving to .env file:", fsErr.message);
    }

    // Reset cached adapter so next call uses new token
    resetBrokerAdapter();

    console.log(`[Zerodha] Access token saved successfully: ${accessToken.slice(0, 12)}...`);
    res.json({ accessToken, message: "Token saved and adapter reset" });
  } catch (err: any) {
    // If process already has an active access token generated recently, fall back gracefully
    if (process.env.KITE_ACCESS_TOKEN) {
      console.log(`[Zerodha] Request token exchange failed (${err.message}), using existing active token.`);
      return res.json({ accessToken: process.env.KITE_ACCESS_TOKEN, message: "Using active access token" });
    }
    console.error("[Zerodha] Token exchange failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/broker/zerodha/live-quotes
 * Returns live quotes for key indices/stocks as JSON.
 * Prints to backend terminal as well.
 */
brokerRouter.get("/zerodha/live-quotes", async (_req, res) => {
  try {
    const broker = getBrokerAdapter();
    const quotes = await broker.getQuote(LIVE_QUOTE_TOKENS);

    const enriched = quotes.map((q: any) => ({
      symbol: q.tradingSymbol ?? q.instrumentToken,
      instrumentToken: q.instrumentToken,
      lastPrice: q.lastPrice,
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume,
      change: Number((q.lastPrice - q.close).toFixed(2)),
      changePct: q.close ? Number(((q.lastPrice - q.close) / q.close * 100).toFixed(2)) : 0,
      netChange: Number((q.lastPrice - q.close).toFixed(2)),
      timestamp: new Date().toISOString(),
    }));

    // Print to backend terminal
    console.log("\n─── ZERODHA LIVE QUOTES ─────────────────────────────");
    console.log(JSON.stringify(enriched, null, 2));
    console.log("─────────────────────────────────────────────────────\n");

    res.json(enriched);
  } catch (err: any) {
    console.error("[Zerodha] Live quotes failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/broker/zerodha/login-url
 * Returns the Zerodha login URL for the frontend to redirect to.
 */
brokerRouter.get("/zerodha/login-url", (req, res) => {
  const redirectUrl = getZerodhaRedirectUrl(req.headers.origin || req.headers.referer);
  res.json({
    url: `https://kite.zerodha.com/connect/login?api_key=${env.KITE_API_KEY}&v=3`,
    apiKey: env.KITE_API_KEY,
    redirectUrl,
  });
});

/**
 * GET /api/broker/zerodha/status
 * Returns whether the current access token is valid by doing a lightweight quote call.
 */
brokerRouter.get("/zerodha/status", async (_req, res) => {
  try {
    const broker = getBrokerAdapter();
    await broker.getQuote(["NSE:NIFTY 50"]);
    res.json({ connected: true, accessToken: (env as any).KITE_ACCESS_TOKEN?.slice(0, 12) + "..." });
  } catch (err: any) {
    res.json({ connected: false, error: err.message });
  }
});

/**
 * GET /api/broker/mode
 * Returns active broker provider and connection status.
 */
brokerRouter.get("/mode", async (_req, res) => {
  const currentProvider = env.BROKER_PROVIDER || "MOCK";
  let connected = false;
  try {
    if (currentProvider === "ZERODHA") {
      const broker = getBrokerAdapter();
      await broker.getQuote(["NSE:NIFTY 50"]);
      connected = true;
    } else {
      connected = true; // MOCK is always ready
    }
  } catch {
    connected = false;
  }
  res.json({
    provider: currentProvider,
    connected,
    isMock: currentProvider === "MOCK",
    hasZerodhaToken: Boolean(process.env.KITE_ACCESS_TOKEN || (env as any).KITE_ACCESS_TOKEN),
  });
});

/**
 * POST /api/broker/mode
 * Switch active broker provider at runtime between ZERODHA and MOCK without server restart.
 * Body: { provider: "ZERODHA" | "MOCK" }
 */
brokerRouter.post("/mode", (req, res) => {
  const { provider } = req.body;
  if (!provider || !["ZERODHA", "MOCK", "UPSTOX", "ANGELONE"].includes(provider)) {
    return res.status(400).json({ error: "Invalid provider. Must be ZERODHA or MOCK." });
  }

  process.env.BROKER_PROVIDER = provider;
  (env as any).BROKER_PROVIDER = provider;
  resetBrokerAdapter();

  console.log(`[BrokerFactory] Switched active BROKER_PROVIDER to ${provider}`);
  res.json({
    provider,
    message: `Switched active broker provider to ${provider}`,
  });
});


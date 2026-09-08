import "express-async-errors";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { env } from "./config/env";
import { authRouter } from "./routes/auth.routes";
import { ordersRouter } from "./routes/orders.routes";
import { portfolioRouter } from "./routes/portfolio.routes";
import { marketRouter } from "./routes/market.routes";
import { optionChainRouter } from "./routes/optionChain.routes";
import { contestsRouter } from "./routes/contests.routes";
import { adminAuthRouter } from "./routes/adminAuth.routes";
import { adminContestsRouter } from "./routes/adminContests.routes";
import { profileRouter } from "./routes/profile.routes";
import { kycRouter } from "./routes/kyc.routes";
import { bankAccountsRouter } from "./routes/bankAccounts.routes";
import { adminKycRouter } from "./routes/adminKyc.routes";
import { adminPrizesRouter } from "./routes/adminPrizes.routes";
import { liveTradingRouter } from "./routes/liveTrading.routes";
import { adminLiveTradingRouter } from "./routes/adminLiveTrading.routes";
import { initPriceFeedGateway } from "./websocket/priceFeedGateway";
import { startSquareOffScheduler } from "./jobs/SquareOffScheduler";
import { startContestSnapshotScheduler } from "./jobs/ContestSnapshotScheduler";
import { brokerRouter } from "./routes/broker.routes";
import { getBrokerAdapter, resetBrokerAdapter } from "./brokers/BrokerFactory";
import { prisma } from "./utils/prisma";
import { Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, broker: env.BROKER_PROVIDER }));

// ── Zerodha OAuth callback ──────────────────────────────────────────────────
// 1. Set redirect URL in https://developers.kite.trade/apps to:
//    http://localhost:4000/api/broker/zerodha/callback
// 2. Visit: https://kite.zerodha.com/connect/login?api_key=jfwd2gvwal8pq0rp&v=3
// 3. Login → auto-redirected here → access_token saved → instruments synced
app.get("/api/broker/zerodha/callback", async (req, res) => {
  const requestToken = req.query.request_token as string;
  if (!requestToken) return res.status(400).send("Missing request_token");
  try {
    const { ZerodhaAdapter } = await import("./brokers/zerodha/ZerodhaAdapter");
    const adapter = new ZerodhaAdapter(env.KITE_API_KEY, env.KITE_API_SECRET);
    const { accessToken } = await adapter.authenticate({ requestToken });

    // Patch running env
    process.env.KITE_ACCESS_TOKEN = accessToken;
    (env as any).KITE_ACCESS_TOKEN = accessToken;

    // Write to .env file (cwd = backend/)
    const envPath = path.resolve(process.cwd(), ".env");
    let envContent = fs.readFileSync(envPath, "utf8");
    if (/^KITE_ACCESS_TOKEN=.*/m.test(envContent)) {
      envContent = envContent.replace(/^KITE_ACCESS_TOKEN=.*/m, `KITE_ACCESS_TOKEN=${accessToken}`);
    } else {
      envContent += `\nKITE_ACCESS_TOKEN=${accessToken}`;
    }
    fs.writeFileSync(envPath, envContent);

    // Reset cached adapter so it uses the new token
    resetBrokerAdapter();

    res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;max-width:600px">
      <h2 style="color:green">&#10003; Zerodha Connected!</h2>
      <p>Access token saved. Syncing instruments now (takes ~30s)...</p>
      <div id="status">&#9203; Please wait...</div>
      <script>
        fetch('/api/market/sync-instruments-public',{method:'POST'})
          .then(r=>r.json())
          .then(d=>{ document.getElementById('status').innerHTML='&#10003; Synced <b>'+d.synced+'</b> instruments. <br><br><a href="http://localhost:5173" style="font-size:18px">&#128073; Open Trading App</a>'; })
          .catch(e=>{ document.getElementById('status').innerHTML='Sync failed: '+e+'<br><a href="http://localhost:5173">Open app anyway</a>'; });
      </script>
    </body></html>`);
  } catch (err: any) {
    res.status(500).send(`<h2 style="color:red">Auth failed</h2><pre>${err.message}</pre>`);
  }
});

// Public instrument sync — called from callback page above (no JWT required)
app.post("/api/market/sync-instruments-public", async (_req, res) => {
  try {
    const broker = getBrokerAdapter();
    const rawInstruments = await broker.getInstruments();
    const instruments = rawInstruments.filter(
      (i) => i && i.instrumentToken && (i.tradingSymbol || i.name)
    );
    const BATCH = 500;
    for (let i = 0; i < instruments.length; i += BATCH) {
      const batch = instruments.slice(i, i + BATCH).map((inst) => ({
        instrumentToken: String(inst.instrumentToken),
        tradingSymbol: String(inst.tradingSymbol || inst.name || inst.instrumentToken),
        exchange: String(inst.exchange || "NSE"),
        segment: inst.segment,
        name: inst.name ? String(inst.name) : null,
        lotSize: Number(inst.lotSize) || 1,
        tickSize: new Prisma.Decimal(inst.tickSize ? String(inst.tickSize) : "0.05"),
        expiry: inst.expiry ? new Date(inst.expiry) : null,
        strike: inst.strike != null ? new Prisma.Decimal(String(inst.strike)) : null,
        optionType: inst.optionType ?? null,
      }));
      try {
        await prisma.instrument.createMany({ data: batch, skipDuplicates: true });
      } catch (batchErr: any) {
        console.warn(`[Sync] Batch ${i} warning:`, batchErr.message);
      }
    }
    res.json({ synced: instruments.length });
  } catch (err: any) {
    console.error("[Sync] Instrument sync error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use("/api/broker", brokerRouter);
app.use("/api/auth", authRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/portfolio", portfolioRouter);
app.use("/api/market", marketRouter);
app.use("/api/options", optionChainRouter);
app.use("/api/contests", contestsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/kyc", kycRouter);
app.use("/api/bank-accounts", bankAccountsRouter);
app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/admin/contests", adminContestsRouter);
app.use("/api/admin/kyc", adminKycRouter);
app.use("/api/admin/prizes", adminPrizesRouter);
app.use("/api/live-trading", liveTradingRouter);
app.use("/api/admin/live-trading", adminLiveTradingRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.statusCode ?? 500).json({ error: err.message ?? "Internal server error" });
});

const httpServer = createServer(app);
initPriceFeedGateway(httpServer);
startSquareOffScheduler();
startContestSnapshotScheduler();

httpServer.listen(env.PORT, () => {
  console.log(`Backend listening on :${env.PORT} (broker=${env.BROKER_PROVIDER})`);
  console.log(`Zerodha login URL: https://kite.zerodha.com/connect/login?api_key=${env.KITE_API_KEY}&v=3`);
});

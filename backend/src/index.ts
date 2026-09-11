import "express-async-errors";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
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
import { adminLoginHistoryRouter } from "./routes/adminLoginHistory.routes";
import { initPriceFeedGateway } from "./websocket/priceFeedGateway";
import { startSquareOffScheduler } from "./jobs/SquareOffScheduler";
import { startContestSnapshotScheduler } from "./jobs/ContestSnapshotScheduler";
import { brokerRouter } from "./routes/broker.routes";
import { InstrumentSyncService } from "./services/InstrumentSyncService";
import { getBrokerAdapter, resetBrokerAdapter } from "./brokers/BrokerFactory";
import { prisma } from "./utils/prisma";
import { Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";

const app = express();
const allowedOrigins = [env.CORS_ORIGIN, "http://localhost:5174", "http://localhost:5173"].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
}));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, broker: env.BROKER_PROVIDER }));

// ── Zerodha OAuth callback ──────────────────────────────────────────────────
// 1. Set redirect URL in https://developers.kite.trade/apps to:
//    http://localhost:4000/api/broker/zerodha/callback
// 2. Visit: https://kite.zerodha.com/connect/login?api_key=ouuv4g2r3iyafu5c&v=3
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
          .then(d=>{ document.getElementById('status').innerHTML='&#10003; Synced <b>'+d.synced+'</b> instruments. <br><br><a href="'+(env.CORS_ORIGIN || "http://localhost:5174")+'" style="font-size:18px">&#128073; Open Trading App</a>'; })
          .catch(e=>{ document.getElementById('status').innerHTML='Sync failed: '+e+'<br><a href="'+(env.CORS_ORIGIN || "http://localhost:5174")+'">Open app anyway</a>'; });
      </script>
    </body></html>`);
  } catch (err: any) {
    res.status(500).send(`<h2 style="color:red">Auth failed</h2><pre>${err.message}</pre>`);
  }
});

// Public instrument sync — called from callback page above or public setup (no JWT required)
app.post("/api/market/sync-instruments-public", async (req, res) => {
  try {
    const ex = req.query.exchange ? String(req.query.exchange).split(",") : ["NSE", "NFO", "MCX"];
    const result = await InstrumentSyncService.syncExchanges(ex);
    res.json(result);
  } catch (err: any) {
    console.error("[Sync] Public instrument sync error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Public stats endpoint for admin card & monitoring
app.get("/api/market/stats", async (_req, res) => {
  try {
    const total = await prisma.instrument.count();
    const byExchange = await prisma.instrument.groupBy({
      by: ["exchange"],
      _count: { _all: true },
    });
    res.json({ total, byExchange });
  } catch (err: any) {
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
app.use("/api/admin/login-history", adminLoginHistoryRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.statusCode ?? 500).json({ error: err.message ?? "Internal server error" });
});

async function ensureDbInitialized() {
  try {
    const adminCount = await prisma.admin.count().catch(() => 0);
    if (adminCount === 0) {
      const email = process.env.ADMIN_SEED_EMAIL || "admin@example.com";
      const password = process.env.ADMIN_SEED_PASSWORD || "admin123456";
      const name = process.env.ADMIN_SEED_NAME || "Platform Admin";
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.admin.create({
        data: { email, passwordHash, name }
      }).catch((e) => console.warn("[DB Init] Admin seed warning:", e.message));
      console.log(`[DB Init] Created default admin: ${email}`);
    }

    await InstrumentSyncService.autoSyncIfEmpty();
  } catch (err: any) {
    console.warn("[DB Init] Initialization warning:", err.message);
  }
}

const httpServer = createServer(app);
initPriceFeedGateway(httpServer);
startSquareOffScheduler();
startContestSnapshotScheduler();

ensureDbInitialized().finally(() => {
  httpServer.listen(env.PORT, () => {
    console.log(`Backend listening on :${env.PORT} (broker=${env.BROKER_PROVIDER})`);
    console.log(`Zerodha login URL: https://kite.zerodha.com/connect/login?api_key=${env.KITE_API_KEY}&v=3`);
  });
});

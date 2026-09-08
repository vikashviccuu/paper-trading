import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { getBrokerAdapter } from "../brokers/BrokerFactory";
import { prisma } from "../utils/prisma";
import { Prisma } from "@prisma/client";

export const marketRouter = Router();
marketRouter.use(requireAuth);

/** Search the locally cached instrument master (populated by /sync-instruments). */
marketRouter.get("/instruments", async (req, res) => {
  const q = (req.query.q as string) || "";
  const segment = req.query.segment as string | undefined;
  const instruments = await prisma.instrument.findMany({
    where: {
      tradingSymbol: { contains: q, mode: "insensitive" },
      ...(segment ? { segment: segment as any } : {}),
    },
    take: 50,
  });
  res.json(instruments);
});

/** Pulls the full instrument dump from the active broker adapter into Postgres. Run daily. */
marketRouter.post("/sync-instruments", async (_req, res) => {
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

marketRouter.get("/quote", async (req, res) => {
  const tokens = ((req.query.tokens as string) || "").split(",").filter(Boolean);
  if (tokens.length === 0) return res.status(400).json({ error: "tokens query param required" });
  const quotes = await getBrokerAdapter().getQuote(tokens);
  res.json(quotes);
});

marketRouter.get("/history", async (req, res) => {
  const { token, interval, from, to } = req.query as Record<string, string>;
  if (!token || !interval || !from || !to) {
    return res.status(400).json({ error: "token, interval, from, to are required" });
  }
  const bars = await getBrokerAdapter().getHistoricalData(token, interval as any, from, to);
  res.json(bars);
});

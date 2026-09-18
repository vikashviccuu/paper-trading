import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { getBrokerAdapter } from "../brokers/BrokerFactory";
import { prisma } from "../utils/prisma";

export const optionChainRouter = Router();
optionChainRouter.use(requireAuth);

/** Returns distinct option expiry dates from the DB for an underlying */
optionChainRouter.get("/expiries", async (req, res) => {
  try {
    const underlying = (req.query.underlying as string)?.trim().toUpperCase();
    if (!underlying) {
      return res.status(400).json({ error: "underlying query param is required" });
    }
    const options = await prisma.instrument.findMany({
      where: {
        segment: "OPTIONS",
        OR: [
          { name: { equals: underlying, mode: "insensitive" } },
          { tradingSymbol: { startsWith: underlying, mode: "insensitive" } },
        ],
        expiry: { not: null },
      },
      select: { expiry: true },
      distinct: ["expiry"],
      orderBy: { expiry: "asc" },
    });

    const expiries = options
      .map((o) => (o.expiry ? o.expiry.toISOString().slice(0, 10) : null))
      .filter((e): e is string => Boolean(e));

    res.json(expiries);
  } catch (err: any) {
    console.error("[OptionChain] Error fetching expiries:", err);
    res.status(500).json({ error: err.message || "Failed to fetch expiries" });
  }
});

/** Returns option chain rows for an underlying and expiry */
optionChainRouter.get("/chain", async (req, res) => {
  try {
    const { underlying, expiry } = req.query as Record<string, string>;
    if (!underlying) {
      return res.status(400).json({ error: "underlying query param is required" });
    }

    let chain: any[] = [];
    try {
      chain = await getBrokerAdapter().getOptionChain(underlying, expiry || "");
    } catch (adapterErr: any) {
      console.warn("[OptionChain] Broker adapter getOptionChain failed:", adapterErr.message);
    }

    if (chain && chain.length > 0) {
      return res.json(chain);
    }

    // DB Fallback: query instruments table directly
    const whereClause: any = {
      segment: "OPTIONS",
      OR: [
        { name: { equals: underlying, mode: "insensitive" } },
        { tradingSymbol: { startsWith: underlying, mode: "insensitive" } },
      ],
    };

    if (expiry) {
      const d = new Date(expiry);
      if (!isNaN(d.getTime())) {
        const nextD = new Date(d);
        nextD.setDate(nextD.getDate() + 1);
        whereClause.expiry = { gte: d, lt: nextD };
      }
    }

    const contracts = await prisma.instrument.findMany({
      where: whereClause,
      take: 100,
      orderBy: { strike: "asc" },
    });

    if (contracts.length === 0) {
      return res.json([]);
    }

    // Group contracts by strike
    const byStrike = new Map<number, any>();
    for (const c of contracts) {
      const strike = Number(c.strike || 0);
      if (!strike) continue;
      const row = byStrike.get(strike) ?? { strike };
      const legData = {
        instrumentToken: c.instrumentToken,
        tradingSymbol: c.tradingSymbol,
        lastPrice: Number(c.lastPrice || 0),
        oi: 0,
      };
      if (c.optionType === "CE") row.call = legData;
      if (c.optionType === "PE") row.put = legData;
      byStrike.set(strike, row);
    }

    const dbChain = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
    res.json(dbChain);
  } catch (err: any) {
    console.error("[OptionChain] Chain lookup error:", err);
    res.status(500).json({ error: err.message || "Failed to load option chain" });
  }
});


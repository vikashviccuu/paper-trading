import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { getBrokerAdapter } from "../brokers/BrokerFactory";

export const optionChainRouter = Router();
optionChainRouter.use(requireAuth);

optionChainRouter.get("/chain", async (req, res) => {
  const { underlying, expiry } = req.query as Record<string, string>;
  if (!underlying || !expiry) {
    return res.status(400).json({ error: "underlying and expiry query params are required" });
  }
  const chain = await getBrokerAdapter().getOptionChain(underlying, expiry);
  res.json(chain);
});

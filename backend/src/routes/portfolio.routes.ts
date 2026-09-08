import { Router } from "express";
import { requireAuth, AuthedRequest } from "../middleware/auth.middleware";
import { portfolioService } from "../engine/PortfolioService";
import { env } from "../config/env";

export const portfolioRouter = Router();
portfolioRouter.use(requireAuth);

portfolioRouter.get("/", async (req: AuthedRequest, res) => {
  await portfolioService.getOrCreateWallet(req.userId!, env.DEFAULT_VIRTUAL_CASH);
  const snapshot = await portfolioService.getPortfolioSnapshot(req.userId!);
  res.json(snapshot);
});

import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth } from "../middleware/adminAuth.middleware";
import { liveTradingAccountService } from "../services/LiveTradingAccountService";
import { liveOrderService } from "../services/LiveOrderService";
import { AppError } from "../engine/OrderEngine";

/**
 * Admin oversight of live trading accounts - list every account's status,
 * suspend/reinstate (risk control), grant eligibility manually, and view a
 * user's full live-order audit trail (LiveOrder + LiveOrderEvent). See
 * docs/LIVE_TRADING.md.
 */
export const adminLiveTradingRouter = Router();
adminLiveTradingRouter.use(requireAdminAuth);

function wrap(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
      throw err;
    }
  };
}

adminLiveTradingRouter.get(
  "/accounts",
  wrap(async (_req, res) => {
    res.json(await liveTradingAccountService.listAllForAdmin());
  })
);

const suspendSchema = z.object({ reason: z.string().min(1) });

adminLiveTradingRouter.post(
  "/accounts/:userId/suspend",
  wrap(async (req, res) => {
    const parsed = suspendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.json(await liveTradingAccountService.adminSuspend(req.adminId!, req.params.userId, parsed.data.reason));
  })
);

adminLiveTradingRouter.post(
  "/accounts/:userId/reinstate",
  wrap(async (req, res) => {
    res.json(await liveTradingAccountService.adminReinstate(req.params.userId));
  })
);

adminLiveTradingRouter.post(
  "/accounts/:userId/grant-eligibility",
  wrap(async (req, res) => {
    res.json(await liveTradingAccountService.adminGrantEligibility(req.params.userId));
  })
);

adminLiveTradingRouter.get(
  "/accounts/:userId/orders",
  wrap(async (req, res) => {
    res.json(await liveOrderService.listOrdersForAdmin(req.params.userId));
  })
);

import { Router } from "express";
import { requireAdminAuth, AdminAuthedRequest } from "../middleware/adminAuth.middleware";
import { prizeService } from "../services/PrizeService";
import { AppError } from "../engine/OrderEngine";

/**
 * Per-award actions, keyed by ContestPrizeAward id rather than contest id -
 * contest-scoped listing/config lives in adminContests.routes.ts
 * (GET/PUT /api/admin/contests/:id/prizes, GET .../prizes/awards). See
 * docs/PRIZES_AND_PAYOUTS.md.
 */
export const adminPrizesRouter = Router();
adminPrizesRouter.use(requireAdminAuth);

/** Re-check KYC/bank eligibility for one award without touching its amounts - e.g. after a user finishes verification. */
adminPrizesRouter.post("/:awardId/recompute-status", async (req, res) => {
  try {
    const award = await prizeService.recomputeEligibility(req.params.awardId);
    res.json(award);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

/** Release the payout: credits Wallet (PROP_TRADING) or calls the payout provider (CASH_WITHDRAWAL). */
adminPrizesRouter.post("/:awardId/release", async (req: AdminAuthedRequest, res) => {
  try {
    const award = await prizeService.release(req.adminId!, req.params.awardId);
    res.json(award);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

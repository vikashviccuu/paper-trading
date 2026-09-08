import { Router } from "express";
import path from "path";
import { z } from "zod";
import { requireAdminAuth, AdminAuthedRequest } from "../middleware/adminAuth.middleware";
import { kycService } from "../services/KycService";
import { AppError } from "../engine/OrderEngine";

export const adminKycRouter = Router();
adminKycRouter.use(requireAdminAuth);

adminKycRouter.get("/pending", async (_req, res) => {
  res.json(await kycService.listPendingForReview());
});

adminKycRouter.get("/:userId", async (req, res) => {
  try {
    res.json(await kycService.getForAdmin(req.params.userId));
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

/** Same file the user can view, but without the ownership check - any admin can review any submission's documents. */
adminKycRouter.get("/:userId/documents/:docId/file", async (req, res) => {
  try {
    const doc = await kycService.getDocumentForOwnerOrAdmin(req.params.docId);
    res.sendFile(path.resolve(doc.filePath));
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

adminKycRouter.post("/:userId/approve", async (req: AdminAuthedRequest, res) => {
  try {
    const kyc = await kycService.approve(req.adminId!, req.params.userId);
    res.json(kyc);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

const rejectSchema = z.object({ reason: z.string().min(1) });

adminKycRouter.post("/:userId/reject", async (req: AdminAuthedRequest, res) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const kyc = await kycService.reject(req.adminId!, req.params.userId, parsed.data.reason);
    res.json(kyc);
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

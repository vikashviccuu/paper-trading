import { Router } from "express";
import { requireAdminAuth } from "../middleware/adminAuth.middleware";
import { LoginAuditService } from "../services/LoginAuditService";
import { LoginStatus } from "@prisma/client";

export const adminLoginHistoryRouter = Router();
adminLoginHistoryRouter.use(requireAdminAuth);

/**
 * GET /api/admin/login-history
 * Query params: page, limit, search, status, userId, isSuspicious, startDate, endDate
 */
adminLoginHistoryRouter.get("/", async (req, res) => {
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const search = req.query.search as string | undefined;
  const status = req.query.status as LoginStatus | undefined;
  const userId = req.query.userId as string | undefined;
  const isSuspicious = req.query.isSuspicious !== undefined ? req.query.isSuspicious === "true" : undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;

  const result = await LoginAuditService.getAdminLoginHistory({
    page,
    limit,
    search,
    status,
    userId,
    isSuspicious,
    startDate,
    endDate,
  });

  res.json(result);
});

/**
 * GET /api/admin/login-history/stats
 * High-level security KPIs for dashboard and security alerts
 */
adminLoginHistoryRouter.get("/stats", async (_req, res) => {
  const stats = await LoginAuditService.getAdminSecurityStats();
  res.json(stats);
});

/**
 * GET /api/admin/login-history/users/:userId
 * Complete security footprint for a specific user
 */
adminLoginHistoryRouter.get("/users/:userId", async (req, res) => {
  try {
    const overview = await LoginAuditService.getUserSecurityOverview(req.params.userId);
    res.json(overview);
  } catch (err: any) {
    res.status(404).json({ error: err.message || "User not found" });
  }
});

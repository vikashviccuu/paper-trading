import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AdminAuthedRequest extends Request {
  adminId?: string;
}

/**
 * Verifies a token issued by ADMIN_JWT_SECRET (see routes/adminAuth.routes.ts).
 * Deliberately does NOT accept a regular-user token signed with JWT_SECRET -
 * the two are different secrets, so this rejects a user's token outright
 * rather than merely checking a role claim. See docs/ADMIN.md.
 */
export function requireAdminAuth(req: AdminAuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const token = header.slice("Bearer ".length);
    const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as { adminId: string };
    req.adminId = payload.adminId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

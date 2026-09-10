import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../utils/prisma";

export interface AuthedRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const token = header.slice("Bearer ".length);

    // 1. Try regular user JWT
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      if (payload?.userId) {
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { id: true },
        });
        if (user) {
          req.userId = payload.userId;
          return next();
        }
      }
    } catch {}

    // 2. Try admin JWT (maps admin session to dedicated admin trader account)
    try {
      const adminPayload = jwt.verify(token, env.ADMIN_JWT_SECRET) as { adminId: string };
      if (adminPayload?.adminId) {
        const admin = await prisma.admin.findUnique({ where: { id: adminPayload.adminId } });
        if (admin) {
          let adminUser = await prisma.user.findFirst({ where: { email: admin.email } });
          if (!adminUser) {
            adminUser = await prisma.user.create({
              data: {
                email: admin.email,
                name: `${admin.name} (Admin)`,
                passwordHash: admin.passwordHash,
                wallet: { create: { cashBalance: 10000000 } },
              },
            });
          }
          req.userId = adminUser.id;
          return next();
        }
      }
    } catch {}

    return res.status(401).json({ error: "Invalid or expired token" });
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

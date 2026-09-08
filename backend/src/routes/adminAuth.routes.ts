import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../utils/prisma";
import { env } from "../config/env";
import { requireAdminAuth, AdminAuthedRequest } from "../middleware/adminAuth.middleware";

export const adminAuthRouter = Router();

/**
 * No public /register here on purpose - admins are provisioned via
 * `npm run seed:admin` (prisma/seedAdmin.ts) or by another admin through
 * POST /api/admin/admins (below), never by anyone signing themselves up.
 * See docs/ADMIN.md.
 */
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

adminAuthRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ adminId: admin.id }, env.ADMIN_JWT_SECRET, {
    expiresIn: env.ADMIN_JWT_EXPIRES_IN,
  } as jwt.SignOptions);

  res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
});

adminAuthRouter.get("/me", requireAdminAuth, async (req: AdminAuthedRequest, res) => {
  const admin = await prisma.admin.findUniqueOrThrow({ where: { id: req.adminId! } });
  res.json({ id: admin.id, name: admin.name, email: admin.email, role: admin.role });
});

/** Let an existing admin provision another admin, without exposing this publicly. */
const createAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

adminAuthRouter.post("/admins", requireAdminAuth, async (req, res) => {
  const parsed = createAdminSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, email, password } = parsed.data;

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "An admin with that email already exists" });

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.admin.create({ data: { name, email, passwordHash } });
  res.status(201).json({ id: admin.id, name: admin.name, email: admin.email });
});

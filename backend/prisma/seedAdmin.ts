/**
 * Creates (or updates the password of) the first admin account from
 * ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD / ADMIN_SEED_NAME in .env.
 *
 * Run: npm run seed:admin
 *
 * This is the *only* way to create the very first admin - there is no
 * public registration endpoint (see routes/adminAuth.routes.ts). Once you
 * have one admin, they can create more via POST /api/admin/auth/admins.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const name = process.env.ADMIN_SEED_NAME || "Platform Admin";

  if (!email || !password) {
    console.error("Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in backend/.env before running this script.");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("ADMIN_SEED_PASSWORD must be at least 6 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: { passwordHash, name },
    create: { email, passwordHash, name },
  });

  console.log(`Admin ready: ${admin.email} (id: ${admin.id})`);
  console.log(`Log in at POST /api/admin/auth/login with this email/password.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

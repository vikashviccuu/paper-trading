import { prisma } from "../src/utils/prisma";
import axios from "axios";

async function run() {
  console.log("=== Testing User Signup with Mobile Number ===");

  const randomSuffix = Math.floor(Math.random() * 100000);
  const testEmail = `test_phone_user_${randomSuffix}@example.com`;
  const testPhone = "+919876543210";

  const res = await axios.post("http://localhost:4000/api/auth/signup", {
    name: "Mobile Test User",
    email: testEmail,
    password: "securePassword123",
    phone: testPhone,
  });

  console.log("Signup API response:", res.data);

  if (res.data.user.phone !== testPhone) {
    throw new Error(`Expected phone ${testPhone}, got ${res.data.user.phone}`);
  }

  // Check database
  const dbUser = await prisma.user.findUnique({
    where: { email: testEmail },
    include: { profile: true },
  });

  console.log("DB User:", {
    id: dbUser?.id,
    name: dbUser?.name,
    email: dbUser?.email,
    phone: dbUser?.phone,
    profilePhone: dbUser?.profile?.phone,
  });

  if (dbUser?.phone !== testPhone) {
    throw new Error("Phone was not saved on User table in DB!");
  }
  if (dbUser?.profile?.phone !== testPhone) {
    throw new Error("Phone was not saved on UserProfile table in DB!");
  }

  console.log("✓ User & UserProfile phone successfully verified!");
  console.log("🎉 SIGNUP WITH MOBILE NUMBER TEST PASSED!");
}

run()
  .catch((err) => {
    console.error("Test error:", err.response?.data || err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { prisma } from "../src/utils/prisma";
import bcrypt from "bcryptjs";
import { otpService } from "../src/services/OtpService";
import { LoginAuditService } from "../src/services/LoginAuditService";

async function run() {
  console.log("=== Testing User Forgot Password & Recovery Flow ===");

  const testEmail = "forgot_pwd_test@example.com";
  let user = await prisma.user.findUnique({ where: { email: testEmail } });

  const initialPassword = "initialPassword123";
  const newPassword = "newSecuredPassword456";

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: testEmail,
        name: "Forgot Pwd Tester",
        passwordHash: await bcrypt.hash(initialPassword, 10),
      },
    });
    console.log(`Created test user: ${user.email}`);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(initialPassword, 10) },
    });
    console.log(`Reset test user password to initial: ${user.email}`);
  }

  // 1. Send OTP
  console.log("\n[Test 1] Sending password reset OTP...");
  const { otp, expiresAt } = await otpService.send(user.id, "PASSWORD_RESET", user.email);
  console.log("Generated OTP:", otp, "Expires at:", expiresAt);

  if (!otp || otp.length !== 6) {
    throw new Error("Invalid OTP generated!");
  }
  console.log("✓ OTP generated successfully.");

  // 2. Test incorrect OTP attempt
  console.log("\n[Test 2] Verifying incorrect OTP handling...");
  let failedAsExpected = false;
  try {
    await otpService.verify(user.id, "PASSWORD_RESET", user.email, "000000");
  } catch (err: any) {
    console.log("Caught expected error on bad OTP:", err.message);
    failedAsExpected = true;
  }
  if (!failedAsExpected) {
    throw new Error("Verification should have failed with bad OTP!");
  }
  console.log("✓ Bad OTP correctly rejected.");

  // 3. Test correct OTP verification and password update
  console.log("\n[Test 3] Verifying correct OTP and updating password...");
  await otpService.verify(user.id, "PASSWORD_RESET", user.email, otp);
  console.log("✓ OTP verified successfully.");

  const newHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  // 4. Record audit entry
  const mockReq: any = {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0",
      "x-forwarded-for": "198.51.100.77",
      "x-device-id": "test-reset-device-uuid-999",
    },
    socket: { remoteAddress: "127.0.0.1" },
  };

  const auditRecord = await LoginAuditService.recordAttempt({
    req: mockReq,
    email: user.email,
    userId: user.id,
    status: "SUCCESS",
    authMethod: "PASSWORD_RESET",
  });
  console.log("Recorded security audit for password reset:", {
    id: auditRecord?.id,
    authMethod: auditRecord?.authMethod,
    ip: auditRecord?.ipAddress,
  });

  // 5. Test logging in with new password
  console.log("\n[Test 4] Verifying login with newly updated password...");
  const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const oldOk = await bcrypt.compare(initialPassword, updatedUser.passwordHash);
  const newOk = await bcrypt.compare(newPassword, updatedUser.passwordHash);

  if (oldOk) {
    throw new Error("Old password still matched after reset!");
  }
  if (!newOk) {
    throw new Error("New password did not match updated hash!");
  }

  console.log("✓ Old password successfully invalidated, new password successfully authenticated!");
  console.log("\n🎉 ALL FORGOT PASSWORD TESTS PASSED!");
}

run()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

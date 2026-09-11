import { prisma } from "../src/utils/prisma";
import bcrypt from "bcryptjs";

async function testMobileForgotPassword() {
  console.log("================================================================================");
  console.log("Testing Mobile Number Forgot Password OTP Recovery via MSG91 SMS");
  console.log("================================================================================");

  const BASE_URL = "http://localhost:4000/api/auth";
  const testId = Date.now();
  const testEmail = `forgot_pwd_test_${testId}@example.com`;
  const testPhone = "9" + String(testId).slice(-9);
  const initialPassword = "OldPassword@123";
  const newPassword = "NewSecuredPassword@456";
  const deviceId = `device-forgot-pwd-${testId}`;

  // 1. Create a test user with verified mobile number
  console.log("\n[STEP 1] Creating test user with mobile number...");
  const passwordHash = await bcrypt.hash(initialPassword, 10);
  const user = await prisma.user.create({
    data: {
      name: "Forgot Password Mobile Tester",
      email: testEmail,
      passwordHash,
      phone: testPhone,
      emailVerified: true,
      phoneVerified: true,
    },
  });
  console.log(`--> Created test user ${user.id} with phone ${user.phone}`);

  try {
    // 2. Request OTP using Mobile Number
    console.log("\n[STEP 2] Requesting Forgot Password OTP using Mobile Number...");
    const sendOtpRes = await fetch(`${BASE_URL}/forgot-password/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: testPhone,
      }),
    });

    const sendOtpData: any = await sendOtpRes.json();
    console.log("Send OTP Status:", sendOtpRes.status);
    console.log("Send OTP Response:", JSON.stringify(sendOtpData, null, 2));

    if (sendOtpRes.status !== 200 || !sendOtpData.sent) {
      throw new Error(`Failed to send OTP to mobile: ${JSON.stringify(sendOtpData)}`);
    }

    const otp = sendOtpData.otp;
    console.log(`--> Successfully received OTP for mobile: ${otp}`);

    // 3. Test Invalid OTP rejection
    console.log("\n[STEP 3] Testing Invalid OTP rejection on reset...");
    const invalidResetRes = await fetch(`${BASE_URL}/forgot-password/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: testPhone,
        otp: "000000",
        newPassword,
        deviceId,
      }),
    });
    console.log("Invalid Reset Status:", invalidResetRes.status);
    if (invalidResetRes.status !== 400) {
      throw new Error("Expected status 400 for invalid OTP");
    }
    console.log("--> Invalid OTP correctly rejected!");

    // 4. Test Valid Reset with Mobile Number
    console.log("\n[STEP 4] Testing Valid Password Reset using Mobile Number + OTP...");
    const validResetRes = await fetch(`${BASE_URL}/forgot-password/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: testPhone,
        otp,
        newPassword,
        deviceId,
      }),
    });

    const validResetData: any = await validResetRes.json();
    console.log("Valid Reset Status:", validResetRes.status);
    console.log("Valid Reset Response:", JSON.stringify(validResetData, null, 2));

    if (validResetRes.status !== 200 || !validResetData.success) {
      throw new Error(`Password reset failed: ${JSON.stringify(validResetData)}`);
    }
    console.log("--> Password successfully updated via Mobile OTP!");

    // 5. Verify database password was updated and matches new password
    console.log("\n[STEP 5] Verifying database password hash...");
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    const matchesOld = await bcrypt.compare(initialPassword, updatedUser!.passwordHash);
    const matchesNew = await bcrypt.compare(newPassword, updatedUser!.passwordHash);

    console.log(`Old password valid: ${matchesOld} (Expected: false)`);
    console.log(`New password valid: ${matchesNew} (Expected: true)`);

    if (matchesOld || !matchesNew) {
      throw new Error("Password hash verification failed in database");
    }
    console.log("--> Database hash confirmed updated to new password!");

    // 6. Verify audit trail log
    console.log("\n[STEP 6] Verifying Security Audit Log in PostgreSQL...");
    const auditLog = await prisma.userLoginHistory.findFirst({
      where: { userId: user.id, authMethod: "PASSWORD_RESET" },
    });
    if (!auditLog) {
      throw new Error("Expected PASSWORD_RESET audit log in userLoginHistory");
    }
    console.log(`--> Security audit record found: Status: ${auditLog.status}, Method: ${auditLog.authMethod}, Device: ${auditLog.deviceId}`);

    console.log("\n================================================================================");
    console.log("SUCCESS: Mobile Number Forgot Password OTP Verification Passed 100%!");
    console.log("================================================================================");
  } finally {
    // Cleanup
    console.log(`\n[CLEANUP] Removing test user ${user.id}...`);
    await prisma.userLoginHistory.deleteMany({ where: { userId: user.id } });
    await prisma.otpVerification.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log("--> Cleanup complete.");
  }
}

testMobileForgotPassword()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

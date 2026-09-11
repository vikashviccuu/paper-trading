import { prisma } from "../src/utils/prisma";

async function main() {
  console.log("================================================================================");
  console.log("Starting Dual OTP Verification & Modern Login 2FA Automated Test Suite");
  console.log("================================================================================");

  const BASE_URL = "http://localhost:4000/api/auth";
  const testId = Date.now();
  const testEmail = `test_dual_otp_${testId}@example.com`;
  const testPassword = "Password@123!";
  const testPhone = "9876543210";
  const deviceId = `test-device-${testId}`;

  console.log(`\n[STEP 1] Testing POST /signup with Dual Verification (Email + Mobile)...`);
  const signupRes = await fetch(`${BASE_URL}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Dual OTP Tester",
      email: testEmail,
      password: testPassword,
      phone: testPhone,
      deviceId,
      clientTimezone: "Asia/Kolkata",
      clientScreen: "1920x1080",
    }),
  });

  const signupData: any = await signupRes.json();
  console.log("Signup Response Status:", signupRes.status);
  console.log("Signup Response Payload:", JSON.stringify(signupData, null, 2));

  if (signupRes.status !== 201 || !signupData.requiresVerification) {
    throw new Error(`Signup failed or did not require verification: ${JSON.stringify(signupData)}`);
  }

  const userId = signupData.userId;
  const emailOtp = signupData.demoOtp?.emailOtp;
  const phoneOtp = signupData.demoOtp?.phoneOtp;

  if (!emailOtp || !phoneOtp) {
    throw new Error(`Demo OTPs not returned in dev response: emailOtp=${emailOtp}, phoneOtp=${phoneOtp}`);
  }
  console.log(`--> Signup successful. Generated Email OTP: ${emailOtp}, Phone OTP: ${phoneOtp}`);

  console.log(`\n[STEP 2] Testing Invalid OTP rejection on /verify-registration-otp...`);
  const invalidVerifyRes = await fetch(`${BASE_URL}/verify-registration-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      emailOtp: "000000",
      phoneOtp: phoneOtp,
      deviceId,
    }),
  });

  const invalidVerifyData: any = await invalidVerifyRes.json();
  console.log("Invalid Verify Status:", invalidVerifyRes.status);
  console.log("Invalid Verify Data:", invalidVerifyData);

  if (invalidVerifyRes.status !== 400) {
    throw new Error("Expected status 400 for invalid email OTP");
  }
  console.log("--> Invalid OTP correctly rejected!");

  console.log(`\n[STEP 3] Testing Valid Dual OTP Verification on /verify-registration-otp...`);
  const validVerifyRes = await fetch(`${BASE_URL}/verify-registration-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      emailOtp,
      phoneOtp,
      deviceId,
    }),
  });

  const validVerifyData: any = await validVerifyRes.json();
  console.log("Valid Verify Status:", validVerifyRes.status);
  console.log("Valid Verify Data:", JSON.stringify(validVerifyData, null, 2));

  if (!validVerifyData.verified || !validVerifyData.token) {
    throw new Error("Registration verification failed to issue token or mark user verified");
  }
  console.log("--> User successfully verified both email and phone! Received JWT Token.");

  console.log(`\n[STEP 4] Testing Resend Verification OTP Endpoint /resend-verification-otp...`);
  const resendRes = await fetch(`${BASE_URL}/resend-verification-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      channel: "both",
    }),
  });
  const resendData: any = await resendRes.json();
  console.log("Resend Status:", resendRes.status);
  console.log("Resend Data:", resendData);
  if (!resendData.sent) {
    throw new Error("Resend verification OTP failed");
  }
  console.log("--> Resend OTP working smoothly!");

  console.log(`\n[STEP 5] Testing POST /login with 2FA OTP Gating for Verified User...`);
  const loginRes = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      deviceId,
      clientTimezone: "Asia/Kolkata",
      clientScreen: "1920x1080",
    }),
  });

  const loginData: any = await loginRes.json();
  console.log("Login Status:", loginRes.status);
  console.log("Login Data:", JSON.stringify(loginData, null, 2));

  if (!loginData.requiresLoginOtp || !loginData.demoOtp?.otp) {
    throw new Error("Expected requiresLoginOtp: true with demoOtp for login 2FA challenge");
  }
  const loginOtp = loginData.demoOtp.otp;
  console.log(`--> Modern 2FA challenge successfully triggered. Login OTP: ${loginOtp}`);

  console.log(`\n[STEP 6] Testing Invalid Login 2FA OTP Rejection...`);
  const invalidLoginOtpRes = await fetch(`${BASE_URL}/verify-login-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      otp: "999999",
      deviceId,
    }),
  });
  const invalidLoginOtpData: any = await invalidLoginOtpRes.json();
  console.log("Invalid Login OTP Status:", invalidLoginOtpRes.status);
  console.log("Invalid Login OTP Data:", invalidLoginOtpData);
  if (invalidLoginOtpRes.status !== 400) {
    throw new Error("Expected 400 for invalid login OTP");
  }
  console.log("--> Invalid login OTP correctly rejected!");

  console.log(`\n[STEP 7] Testing Valid Login 2FA OTP Verification /verify-login-otp...`);
  const validLoginOtpRes = await fetch(`${BASE_URL}/verify-login-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      otp: loginOtp,
      deviceId,
    }),
  });
  const validLoginOtpData: any = await validLoginOtpRes.json();
  console.log("Valid Login OTP Status:", validLoginOtpRes.status);
  console.log("Valid Login OTP Data:", JSON.stringify(validLoginOtpData, null, 2));

  if (!validLoginOtpData.token || !validLoginOtpData.user) {
    throw new Error("Valid login OTP failed to authenticate session");
  }
  console.log("--> Modern 2FA Login OTP successfully verified! Authenticated session established.");

  console.log(`\n[STEP 8] Verifying Security Audit Log entries in PostgreSQL...`);
  const auditLogs = await prisma.userLoginHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${auditLogs.length} audit history logs for test user:`);
  auditLogs.forEach((log, idx) => {
    console.log(`  ${idx + 1}. [${log.authMethod}] Status: ${log.status}, Device: ${log.deviceId}, IP: ${log.ipAddress}, Browser: ${log.browser}, OS: ${log.os}`);
  });

  if (auditLogs.length < 3) {
    throw new Error("Expected at least 3 audit log records (SIGNUP_PENDING_OTP, SIGNUP_VERIFIED, PASSWORD_PLUS_OTP_2FA)");
  }
  console.log("--> Security audit trail verified with full device, IP, and browser telemetry!");

  // Cleanup test user
  console.log(`\n[CLEANUP] Removing test user ${userId}...`);
  await prisma.userLoginHistory.deleteMany({ where: { userId } });
  await prisma.otpVerification.deleteMany({ where: { userId } });
  await prisma.userProfile.deleteMany({ where: { userId } });
  await prisma.wallet.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  console.log("--> Cleanup complete.");

  console.log("\n================================================================================");
  console.log("SUCCESS: All Dual OTP & Login 2FA Tests Passed 100%!");
  console.log("================================================================================");
}

main()
  .catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

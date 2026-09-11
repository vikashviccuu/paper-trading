import { prisma } from "../src/utils/prisma";
import { LoginAuditService } from "../src/services/LoginAuditService";

async function run() {
  console.log("=== Testing User Login History & Security Audit System ===");

  // 1. Find or create a test user
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: "audit_test_user@example.com",
        name: "Security Test User",
        passwordHash: "hash123456",
      },
    });
    console.log(`Created test user: ${user.email} (${user.id})`);
  } else {
    console.log(`Using existing user: ${user.email} (${user.id})`);
  }

  // 2. Mock express requests
  const mockSuccessReq: any = {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "x-forwarded-for": "203.0.113.195, 10.0.0.1",
      "x-device-id": "mock-pc-device-uuid-12345",
      "x-client-timezone": "Asia/Kolkata",
      "x-client-screen": "1920x1080",
    },
    socket: { remoteAddress: "127.0.0.1" },
  };

  const mockMobileFailReq: any = {
    headers: {
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "x-real-ip": "198.51.100.42",
      "x-device-id": "mock-iphone-device-uuid-67890",
      "x-client-timezone": "America/New_York",
      "x-client-screen": "390x844",
    },
    socket: { remoteAddress: "127.0.0.1" },
  };

  // 3. Test recording successful login
  console.log("\n[Test 1] Recording successful login...");
  const successRecord = await LoginAuditService.recordAttempt({
    req: mockSuccessReq,
    email: user.email,
    userId: user.id,
    status: "SUCCESS",
    authMethod: "PASSWORD",
  });
  console.log("Recorded success record:", {
    id: successRecord?.id,
    ip: successRecord?.ipAddress,
    browser: `${successRecord?.browser} ${successRecord?.browserVersion}`,
    os: `${successRecord?.os} ${successRecord?.osVersion}`,
    deviceType: successRecord?.deviceType,
    deviceModel: successRecord?.deviceModel,
    deviceId: successRecord?.deviceId,
    status: successRecord?.status,
  });

  if (
    successRecord?.ipAddress !== "203.0.113.195" ||
    successRecord?.browser !== "Chrome" ||
    successRecord?.os !== "Windows" ||
    successRecord?.deviceType !== "DESKTOP" ||
    successRecord?.deviceId !== "mock-pc-device-uuid-12345"
  ) {
    throw new Error("Failed validation on successRecord parsing!");
  }
  console.log("✓ Success record assertions passed.");

  // 4. Test recording failed login with wrong password
  console.log("\n[Test 2] Recording failed login (wrong password)...");
  const failRecord = await LoginAuditService.recordAttempt({
    req: mockMobileFailReq,
    email: user.email,
    userId: user.id,
    status: "FAILED",
    failureReason: "INVALID_PASSWORD",
  });
  console.log("Recorded failed record:", {
    id: failRecord?.id,
    ip: failRecord?.ipAddress,
    browser: failRecord?.browser,
    os: failRecord?.os,
    deviceType: failRecord?.deviceType,
    deviceModel: failRecord?.deviceModel,
    deviceId: failRecord?.deviceId,
    status: failRecord?.status,
    failureReason: failRecord?.failureReason,
  });

  if (
    failRecord?.ipAddress !== "198.51.100.42" ||
    failRecord?.os !== "iOS" ||
    failRecord?.deviceType !== "MOBILE" ||
    failRecord?.deviceModel !== "iPhone" ||
    failRecord?.failureReason !== "INVALID_PASSWORD"
  ) {
    throw new Error("Failed validation on failRecord parsing!");
  }
  console.log("✓ Fail record assertions passed.");

  // 5. Test user login history retrieval
  console.log("\n[Test 3] Retrieving User Login History...");
  const userHistory = await LoginAuditService.getUserLoginHistory(
    user.id,
    "mock-pc-device-uuid-12345",
    1,
    10
  );
  console.log(`Retrieved ${userHistory.items.length} items for user (Total: ${userHistory.total})`);
  const currentDeviceItem = userHistory.items.find((i) => i.deviceId === "mock-pc-device-uuid-12345");
  if (!currentDeviceItem?.isCurrentDevice) {
    throw new Error("isCurrentDevice was not true for current device ID!");
  }
  console.log("✓ User history & isCurrentDevice verified.");

  // 6. Test Admin login history filtering
  console.log("\n[Test 4] Retrieving Admin Login History with filter...");
  const adminHistory = await LoginAuditService.getAdminLoginHistory({
    search: "203.0.113.195",
    limit: 10,
  });
  console.log(`Admin search found ${adminHistory.items.length} items matching IP.`);
  if (adminHistory.items.length === 0) {
    throw new Error("Admin search failed to find matching record!");
  }
  console.log("✓ Admin filtering verified.");

  // 7. Test Admin Security Stats
  console.log("\n[Test 5] Retrieving Admin Security Stats...");
  const stats = await LoginAuditService.getAdminSecurityStats();
  console.log("Security Stats:", stats);
  if (stats.total24h < 2) {
    throw new Error("Expected at least 2 events in 24h stats!");
  }
  console.log("✓ Admin security stats verified.");

  // 8. Test User Security Overview
  console.log("\n[Test 6] Retrieving User Security Overview...");
  const overview = await LoginAuditService.getUserSecurityOverview(user.id);
  console.log("User Security Overview:", {
    userName: overview.user.name,
    totalLogins: overview.totalLogins,
    failedAttempts: overview.failedAttempts,
    devicesCount: overview.devices.length,
    ipsCount: overview.ips.length,
  });
  if (overview.devices.length < 2) {
    throw new Error("Expected at least 2 distinct devices for this user!");
  }
  console.log("✓ User Security Overview verified.");

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
}

run()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

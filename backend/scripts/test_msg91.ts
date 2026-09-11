import { Msg91Service } from "../src/services/Msg91Service";
import { OtpService } from "../src/services/OtpService";
import { prisma } from "../src/utils/prisma";

async function run() {
  console.log("=== Testing MSG91 Service Integration ===");

  // 1. Test mobile normalization
  const normalized1 = Msg91Service.normalizeMobile("+91 98765 43210");
  const normalized2 = Msg91Service.normalizeMobile("9876543210");
  const normalized3 = Msg91Service.normalizeMobile("09876543210");

  console.log("Normalization tests:", {
    "+91 98765 43210": normalized1,
    "9876543210": normalized2,
    "09876543210": normalized3,
  });

  if (normalized1 !== "919876543210" || normalized2 !== "919876543210" || normalized3 !== "919876543210") {
    throw new Error("Mobile number normalization failed!");
  }
  console.log("✓ Mobile number normalization passed.");

  // 2. Test MSG91 API call with real authkey
  console.log("\n[Test 2] Testing live MSG91 sendOtp endpoint...");
  const dummyMobile = "919876543210";
  const dummyOtp = "123456";

  const res = await Msg91Service.sendOtp(dummyMobile, dummyOtp);
  console.log("MSG91 API Response:", res);

  if (res.type !== "success" || !res.request_id) {
    throw new Error(`Expected success from MSG91, got: ${JSON.stringify(res)}`);
  }
  console.log(`✓ MSG91 accepted SMS request successfully (request_id: ${res.request_id})!`);

  // 3. Test OtpService integration
  console.log("\n[Test 3] Testing OtpService integration with mobile target...");
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: "MSG91 User",
        email: "msg91_test@example.com",
        passwordHash: "hash123",
      },
    });
  }

  const otpResult = await new OtpService().send(user.id, "PHONE_VERIFICATION", "+919876543210");
  console.log("OtpService.send result:", otpResult);
  if (!otpResult.otp || otpResult.otp.length !== 6) {
    throw new Error("OtpService failed to generate 6-digit OTP!");
  }
  console.log("✓ OtpService send with MSG91 passed!");

  // 4. Run Diagnostics
  console.log("\n[Test 4] Running MSG91 Diagnostics...");
  const diagnostics = await Msg91Service.checkDiagnostics();
  console.log("Diagnostics Report:", JSON.stringify(diagnostics, null, 2));

  console.log("\n🎉 ALL MSG91 INTEGRATION TESTS PASSED SUCCESSFULLY!");
}

run()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

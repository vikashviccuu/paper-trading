import { MailService } from "../src/services/MailService";

async function main() {
  console.log("==========================================");
  console.log("   Paper Trading Mail Server Diagnostic   ");
  console.log("==========================================");

  const diag = await MailService.getDiagnostics();
  console.log("Current Mail Server Diagnostics:");
  console.log(JSON.stringify(diag, null, 2));

  const targetEmail = process.argv[2] || "test@example.com";
  console.log(`\nTesting OTP Email send to: ${targetEmail}...`);

  const res = await MailService.sendOtpEmail(targetEmail, "654321", "EMAIL_VERIFICATION");
  console.log("Send Result:", res);
}

main().catch((err) => {
  console.error("Test mail error:", err);
  process.exit(1);
});

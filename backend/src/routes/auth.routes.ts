import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../utils/prisma";
import { env } from "../config/env";
import { portfolioService } from "../engine/PortfolioService";
import { LoginAuditService } from "../services/LoginAuditService";
import { otpService } from "../services/OtpService";
import { Msg91Service } from "../services/Msg91Service";

export const authRouter = Router();

function signToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

const signupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().min(10, "Please enter a valid 10-digit mobile number"),
  deviceId: z.string().optional(),
  clientTimezone: z.string().optional(),
  clientScreen: z.string().optional(),
});

/**
 * POST /api/auth/signup
 * Creates account in pending verification state and dispatches OTPs to both Email and Mobile (via MSG91).
 */
authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { name, email, password, phone, deviceId } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const cleanPhone = phone.trim();
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      phone: cleanPhone,
      emailVerified: false,
      phoneVerified: false,
    },
  });

  await portfolioService.getOrCreateWallet(user.id, env.DEFAULT_VIRTUAL_CASH);

  // Initialize profile with phone
  await prisma.userProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, phone: cleanPhone },
    update: { phone: cleanPhone },
  }).catch((e) => console.warn("[Signup] Profile init warning:", e.message));

  // Dispatch OTP to Email
  const emailResult = await otpService.send(user.id, "EMAIL_VERIFICATION", user.email);

  // Dispatch OTP to Mobile Number (via MSG91 SMS gateway)
  const phoneResult = await otpService.send(user.id, "PHONE_VERIFICATION", cleanPhone);

  // Record initial attempt in security audit
  await LoginAuditService.recordAttempt({
    req,
    email: user.email,
    userId: user.id,
    status: "SUCCESS",
    authMethod: "SIGNUP_PENDING_OTP",
    deviceId,
  });

  res.status(201).json({
    requiresVerification: true,
    userId: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    demoOtp: {
      emailOtp: emailResult.otp,
      phoneOtp: phoneResult.otp,
    },
    message: "Verification codes have been dispatched to your email and mobile number (via MSG91 SMS).",
  });
});

/**
 * POST /api/auth/verify-registration-otp
 * Validates both Email OTP and Mobile OTP after signup to complete user registration.
 */
const verifyRegistrationSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  emailOtp: z.string().length(6, "Email OTP must be 6 digits"),
  phoneOtp: z.string().length(6, "Mobile OTP must be 6 digits"),
  deviceId: z.string().optional(),
});

authRouter.post("/verify-registration-otp", async (req, res) => {
  const parsed = verifyRegistrationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { userId, emailOtp, phoneOtp, deviceId } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  // 1. Verify Email OTP
  try {
    await otpService.verify(user.id, "EMAIL_VERIFICATION", user.email, emailOtp);
  } catch (err: any) {
    return res.status(400).json({ error: `Email OTP failed: ${err.message || "Invalid or expired code"}` });
  }

  // 2. Verify Mobile OTP
  if (user.phone) {
    try {
      await otpService.verify(user.id, "PHONE_VERIFICATION", user.phone, phoneOtp);
    } catch (err: any) {
      return res.status(400).json({ error: `Mobile OTP failed: ${err.message || "Invalid or expired code"}` });
    }
  }

  // Mark verified in DB
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      phoneVerified: true,
    },
  });

  await prisma.userProfile.updateMany({
    where: { userId: user.id },
    data: { phoneVerified: true },
  });

  // Audit verified registration
  await LoginAuditService.recordAttempt({
    req,
    email: user.email,
    userId: user.id,
    status: "SUCCESS",
    authMethod: "SIGNUP_VERIFIED",
    deviceId,
  });

  const token = signToken(user.id);
  res.json({
    success: true,
    verified: true,
    token,
    user: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      emailVerified: updatedUser.emailVerified,
      phoneVerified: updatedUser.phoneVerified,
    },
    message: "Both email and mobile number have been successfully verified!",
  });
});

/**
 * POST /api/auth/resend-verification-otp
 * Resend OTP to email, phone (MSG91 SMS), or both.
 */
const resendOtpSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  channel: z.enum(["email", "phone", "both"]).default("both"),
});

authRouter.post("/resend-verification-otp", async (req, res) => {
  const parsed = resendOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { userId, channel } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  let emailOtp: string | undefined;
  let phoneOtp: string | undefined;

  if (channel === "email" || channel === "both") {
    const resEmail = await otpService.send(user.id, "EMAIL_VERIFICATION", user.email);
    emailOtp = resEmail.otp;
  }

  if ((channel === "phone" || channel === "both") && user.phone) {
    const resPhone = await otpService.send(user.id, "PHONE_VERIFICATION", user.phone);
    phoneOtp = resPhone.otp;
  }

  res.json({
    sent: true,
    message: `Verification code resent successfully to ${channel}.`,
    demoOtp: { emailOtp, phoneOtp },
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().optional(),
  clientTimezone: z.string().optional(),
  clientScreen: z.string().optional(),
});

/**
 * POST /api/auth/login
 * Validates credentials and checks verification status / dispatches login 2FA OTP.
 */
authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password, deviceId } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await LoginAuditService.recordAttempt({
      req,
      email,
      status: "FAILED",
      failureReason: "USER_NOT_FOUND",
      deviceId,
    });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await LoginAuditService.recordAttempt({
      req,
      email: user.email,
      userId: user.id,
      status: "FAILED",
      failureReason: "INVALID_PASSWORD",
      deviceId,
    });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Check if user has unverified email or phone
  if (!user.emailVerified || (user.phone && !user.phoneVerified)) {
    const emailResult = await otpService.send(user.id, "EMAIL_VERIFICATION", user.email);
    const phoneResult = user.phone ? await otpService.send(user.id, "PHONE_VERIFICATION", user.phone) : { otp: undefined };

    return res.json({
      requiresVerification: true,
      userId: user.id,
      email: user.email,
      phone: user.phone,
      demoOtp: {
        emailOtp: emailResult.otp,
        phoneOtp: phoneResult.otp,
      },
      message: "Please complete OTP verification for your email and mobile number before logging in.",
    });
  }

  // Modern login system: Dispatches 2FA Login OTP to mobile (MSG91 SMS) and email
  const destination = user.phone || user.email;
  const loginOtpResult = await otpService.send(user.id, "LOGIN_2FA", destination);

  res.json({
    requiresLoginOtp: true,
    userId: user.id,
    email: user.email,
    phone: user.phone,
    demoOtp: {
      otp: loginOtpResult.otp,
    },
    message: `Security OTP sent to your registered mobile (${user.phone ? user.phone.slice(-4) : user.email}) via MSG91 SMS.`,
  });
});

/**
 * POST /api/auth/verify-login-otp
 * Verifies the login 2FA OTP and issues the authenticated JWT token.
 */
const verifyLoginOtpSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  deviceId: z.string().optional(),
});

authRouter.post("/verify-login-otp", async (req, res) => {
  const parsed = verifyLoginOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { userId, otp, deviceId } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const destination = user.phone || user.email;
  try {
    await otpService.verify(user.id, "LOGIN_2FA", destination, otp);
  } catch (err: any) {
    await LoginAuditService.recordAttempt({
      req,
      email: user.email,
      userId: user.id,
      status: "FAILED",
      failureReason: "INVALID_LOGIN_OTP",
      deviceId,
    });
    return res.status(400).json({ error: err.message || "Invalid or expired OTP" });
  }

  // Record successful login audit
  await LoginAuditService.recordAttempt({
    req,
    email: user.email,
    userId: user.id,
    status: "SUCCESS",
    authMethod: "PASSWORD_PLUS_OTP_2FA",
    deviceId,
  });

  const token = signToken(user.id);
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    },
  });
});

/**
 * Forgot Password routes
 */
/**
 * Helper to find user by email or mobile number
 */
async function findUserByIdentifier(params: { email?: string; phone?: string; identifier?: string }) {
  const { email, phone, identifier } = params;
  let targetEmail = email?.toLowerCase().trim();
  let targetPhone = phone?.trim();

  if (identifier) {
    const raw = identifier.trim();
    if (raw.includes("@")) {
      targetEmail = raw.toLowerCase();
    } else {
      targetPhone = raw;
    }
  }

  if (targetEmail) {
    const user = await prisma.user.findUnique({ where: { email: targetEmail } });
    if (user) {
      return { user, destination: targetPhone ? (user.phone || targetPhone) : (user.phone || user.email) };
    }
  }

  if (targetPhone) {
    const cleanDigits = targetPhone.replace(/\D/g, "");
    const last10 = cleanDigits.slice(-10);
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: targetPhone },
          { phone: cleanDigits },
          { phone: last10 },
          { phone: `+91${last10}` },
          { phone: `91${last10}` },
        ],
      },
    });
    if (user) {
      return { user, destination: user.phone || last10 };
    }
  }

  return { user: null, destination: null };
}

/**
 * Forgot Password routes (supports both Mobile Number via MSG91 SMS and Email)
 */
const forgotPasswordSendSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(10).optional(),
  identifier: z.string().optional(),
}).refine(data => data.email || data.phone || data.identifier, {
  message: "Please provide a registered mobile number or email address",
});

authRouter.post("/forgot-password/send-otp", async (req, res) => {
  const parsed = forgotPasswordSendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { user, destination } = await findUserByIdentifier(parsed.data);
  if (!user || !destination) {
    const label = parsed.data.phone ? "mobile number" : "email or mobile number";
    return res.status(404).json({ error: `No user account registered with that ${label}.` });
  }

  const { otp, expiresAt } = await otpService.send(user.id, "PASSWORD_RESET", destination);

  const isPhone = destination.replace(/\D/g, "").length >= 10;
  res.json({
    sent: true,
    destination,
    message: isPhone
      ? `Verification code dispatched via MSG91 SMS to mobile ${destination.slice(0, 4)}****${destination.slice(-3)}`
      : `Verification code sent to ${destination}`,
    expiresAt,
    otp, // Available in non-production for instant testing
  });
});

const forgotPasswordResetSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(10).optional(),
  identifier: z.string().optional(),
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
  newPassword: z.string().min(6, "Password must be at least 6 characters long"),
  deviceId: z.string().optional(),
}).refine(data => data.email || data.phone || data.identifier, {
  message: "Please provide a registered mobile number or email address",
});

authRouter.post("/forgot-password/reset", async (req, res) => {
  const parsed = forgotPasswordResetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { otp, newPassword, deviceId } = parsed.data;
  const { user, destination } = await findUserByIdentifier(parsed.data);
  if (!user || !destination) {
    return res.status(404).json({ error: "No user account registered with that email or mobile number" });
  }

  let verified = false;
  let lastError = "Invalid or expired OTP";
  const possibleDestinations = [destination, user.phone, user.email].filter(Boolean) as string[];
  for (const dest of Array.from(new Set(possibleDestinations))) {
    try {
      await otpService.verify(user.id, "PASSWORD_RESET", dest, otp);
      verified = true;
      break;
    } catch (err: any) {
      lastError = err.message || lastError;
    }
  }

  if (!verified) {
    return res.status(400).json({ error: lastError });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  // Record password reset in security audit log
  await LoginAuditService.recordAttempt({
    req,
    email: user.email,
    userId: user.id,
    status: "SUCCESS",
    authMethod: "PASSWORD_RESET",
    deviceId,
  });

  res.json({ success: true, message: "Password has been successfully updated. You can now log in." });
});

/**
 * Direct MSG91 SMS testing endpoint.
 * POST /api/auth/msg91/test-send
 * Body: { mobile: "9876543210" }
 */
const testSmsSchema = z.object({
  mobile: z.string().min(10, "Enter at least a 10-digit mobile number"),
});

authRouter.post("/msg91/test-send", async (req, res) => {
  const parsed = testSmsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { mobile } = parsed.data;
  const testOtp = String(Math.floor(100000 + Math.random() * 900000));

  try {
    const msg91Res = await Msg91Service.sendOtp(mobile, testOtp);
    res.json({
      success: true,
      message: `Test OTP ${testOtp} dispatched to ${mobile} via MSG91`,
      otp: testOtp,
      msg91: msg91Res,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to send SMS via MSG91",
    });
  }
});

/**
 * Diagnostic status endpoint for MSG91 integration.
 * GET /api/auth/msg91/diagnostics
 */
authRouter.get("/msg91/diagnostics", async (_req, res) => {
  try {
    const diagnostics = await Msg91Service.checkDiagnostics();
    res.json({ success: true, diagnostics });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


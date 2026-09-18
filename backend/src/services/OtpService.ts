import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { env } from "../config/env";
import { AppError } from "../engine/OrderEngine";
import { Msg91Service } from "./Msg91Service";
import { MailService } from "./MailService";

export type OtpPurpose = "PHONE_VERIFICATION" | "LIVE_ORDER_2FA" | "PASSWORD_RESET" | "EMAIL_VERIFICATION" | "LOGIN_2FA";


/**
 * Minimal OTP generate/verify flow with MSG91 SMS gateway integration and SMTP MailService.
 * Sends live SMS OTPs to mobile numbers via MSG91 SendOTP API and emails via MailService.
 */
export class OtpService {
  async send(userId: string, purpose: OtpPurpose, target: string): Promise<{
    otp?: string;
    expiresAt: Date;
    emailSent?: boolean;
    emailError?: string;
    smsSent?: boolean;
  }> {
    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    const otpHash = await bcrypt.hash(otp, 8);
    const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

    await prisma.otpVerification.create({
      data: { userId, purpose, target, otpHash, expiresAt },
    });

    let emailSent = false;
    let emailError: string | undefined;
    let smsSent = false;

    // If target is an email address, dispatch email via MailService
    if (target.includes("@") || purpose === "EMAIL_VERIFICATION") {
      try {
        const mailRes = await MailService.sendOtpEmail(target, otp, purpose);
        if (mailRes.success) {
          emailSent = true;
        } else {
          emailError = mailRes.error;
        }
      } catch (err: any) {
        emailError = err.message;
        console.error(`[OtpService] Email delivery to ${target} failed:`, err.message);
      }
    }

    // If target is a phone number (10+ digits), dispatch real SMS via MSG91
    const digitsOnly = target.replace(/\D/g, "");
    if (digitsOnly.length >= 10 && !target.includes("@")) {
      try {
        await Msg91Service.sendOtp(target, otp);
        smsSent = true;
      } catch (err: any) {
        console.error(`[OtpService] MSG91 SMS delivery to ${target} failed:`, err.message);
      }
    }

    return { otp: env.ENABLE_DEMO_OTP ? otp : undefined, expiresAt, emailSent, emailError, smsSent };
  }


  /**
   * Dispatches a single unified 6-digit OTP code to multiple targets simultaneously (e.g. Email AND Phone).
   */
  async sendMultiTarget(userId: string, purpose: OtpPurpose, targets: string[]): Promise<{
    otp?: string;
    expiresAt: Date;
    emailSent?: boolean;
    emailError?: string;
    smsSent?: boolean;
  }> {
    const validTargets = targets.filter((t) => t && t.trim().length > 0);
    if (validTargets.length === 0) throw new AppError(400, "No destination target specified for OTP");

    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    const otpHash = await bcrypt.hash(otp, 8);
    const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

    let emailSent = false;
    let emailError: string | undefined;
    let smsSent = false;

    // Create database records and dispatch to each target channel
    for (const target of validTargets) {
      await prisma.otpVerification.create({
        data: { userId, purpose, target, otpHash, expiresAt },
      });

      if (target.includes("@")) {
        try {
          console.log(`[OtpService] Dispatching OTP email to ${target}...`);
          const mailRes = await MailService.sendOtpEmail(target, otp, purpose);
          if (mailRes.success) {
            emailSent = true;
          } else {
            emailError = mailRes.error;
          }
        } catch (err: any) {
          emailError = err.message;
          console.error(`[OtpService] Email delivery to ${target} failed:`, err.message);
        }
      } else {
        const digitsOnly = target.replace(/\D/g, "");
        if (digitsOnly.length >= 10) {
          try {
            console.log(`[OtpService] Dispatching OTP SMS to ${target}...`);
            await Msg91Service.sendOtp(target, otp);
            smsSent = true;
          } catch (err: any) {
            console.error(`[OtpService] MSG91 SMS delivery to ${target} failed:`, err.message);
          }
        }
      }
    }

    return { otp: env.ENABLE_DEMO_OTP ? otp : undefined, expiresAt, emailSent, emailError, smsSent };
  }

  async verify(userId: string, purpose: OtpPurpose, target: string, otp: string): Promise<void> {
    const record = await prisma.otpVerification.findFirst({
      where: { userId, purpose, target, verified: false },
      orderBy: { createdAt: "desc" },
    });
    if (!record) throw new AppError(400, "No pending OTP for this number - request a new one");
    if (record.expiresAt < new Date()) throw new AppError(400, "OTP has expired - request a new one");
    if (record.attempts >= env.OTP_MAX_ATTEMPTS) throw new AppError(429, "Too many incorrect attempts - request a new OTP");

    const ok = await bcrypt.compare(otp, record.otpHash);
    if (!ok) {
      await prisma.otpVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      throw new AppError(400, "Incorrect OTP");
    }

    await prisma.otpVerification.update({ where: { id: record.id }, data: { verified: true } });
  }

  /**
   * Validates OTP against ANY of the provided targets (e.g. verified by either email or phone).
   */
  async verifyAny(userId: string, purpose: OtpPurpose, targets: string[], otp: string): Promise<void> {
    const validTargets = targets.filter((t) => t && t.trim().length > 0);
    const record = await prisma.otpVerification.findFirst({
      where: { userId, purpose, target: { in: validTargets }, verified: false },
      orderBy: { createdAt: "desc" },
    });

    if (!record) throw new AppError(400, "No pending OTP found - please request a new one");
    if (record.expiresAt < new Date()) throw new AppError(400, "OTP has expired - please request a new one");
    if (record.attempts >= env.OTP_MAX_ATTEMPTS) throw new AppError(429, "Too many incorrect attempts - please request a new OTP");

    const ok = await bcrypt.compare(otp, record.otpHash);
    if (!ok) {
      await prisma.otpVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      throw new AppError(400, "Incorrect OTP");
    }

    // Mark verified for this record and any sibling records in the same batch
    await prisma.otpVerification.updateMany({
      where: { userId, purpose, target: { in: validTargets }, otpHash: record.otpHash },
      data: { verified: true },
    });
  }

  /** Was `target` verified for `purpose` within the last `withinMinutes`? Used to gate a single live order on a fresh 2FA check without forcing a brand-new OTP per click. */
  async wasRecentlyVerified(userId: string, purpose: OtpPurpose, target: string, withinMinutes: number): Promise<boolean> {
    const record = await prisma.otpVerification.findFirst({
      where: { userId, purpose, target, verified: true },
      orderBy: { createdAt: "desc" },
    });
    if (!record) return false;
    return record.createdAt.getTime() > Date.now() - withinMinutes * 60 * 1000;
  }
}

export const otpService = new OtpService();

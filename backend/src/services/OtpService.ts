import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { env } from "../config/env";
import { AppError } from "../engine/OrderEngine";
import { Msg91Service } from "./Msg91Service";

export type OtpPurpose = "PHONE_VERIFICATION" | "LIVE_ORDER_2FA" | "PASSWORD_RESET" | "EMAIL_VERIFICATION" | "LOGIN_2FA";


/**
 * Minimal OTP generate/verify flow with MSG91 SMS gateway integration.
 * Sends live SMS OTPs to mobile numbers via MSG91 SendOTP API.
 */
export class OtpService {
  async send(userId: string, purpose: OtpPurpose, target: string): Promise<{ otp?: string; expiresAt: Date }> {
    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    const otpHash = await bcrypt.hash(otp, 8);
    const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

    await prisma.otpVerification.create({
      data: { userId, purpose, target, otpHash, expiresAt },
    });

    // If target is a phone number (10+ digits), dispatch real SMS via MSG91
    const digitsOnly = target.replace(/\D/g, "");
    if (digitsOnly.length >= 10) {
      try {
        await Msg91Service.sendOtp(target, otp);
      } catch (err: any) {
        console.error(`[OtpService] MSG91 SMS delivery to ${target} failed:`, err.message);
        // Do not fail local flow if testing with dummy numbers or offline
      }
    }

    return { otp: env.ENABLE_DEMO_OTP ? otp : undefined, expiresAt };
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

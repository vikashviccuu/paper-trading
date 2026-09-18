import nodemailer from "nodemailer";
import { env } from "../config/env";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from?: string;
  ignoreTLS?: boolean;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  config?: Partial<SmtpConfig>;
}

export class MailService {
  /**
   * Resolves effective SMTP settings using environment defaults with optional runtime user overrides.
   */
  public static resolveConfig(custom?: Partial<SmtpConfig>): SmtpConfig {
    return {
      host: custom?.host?.trim() || env.SMTP_HOST || "localhost",
      port: custom?.port ? Number(custom.port) : env.SMTP_PORT || 587,
      secure: custom?.secure !== undefined ? Boolean(custom.secure) : env.SMTP_SECURE,
      user: custom?.user !== undefined ? custom.user : env.SMTP_USER,
      pass: custom?.pass !== undefined ? custom.pass : env.SMTP_PASS,
      from: custom?.from?.trim() || env.SMTP_FROM || "Paper Trading <noreply@papertrading.local>",
      ignoreTLS: custom?.ignoreTLS !== undefined ? Boolean(custom.ignoreTLS) : env.SMTP_IGNORE_TLS,
    };
  }

  /**
   * Instantiates a Nodemailer transporter.
   */
  public static createTransporter(custom?: Partial<SmtpConfig>) {
    const config = this.resolveConfig(custom);

    const transportOpts: any = {
      host: config.host,
      port: config.port,
      secure: config.secure, // true for port 465, false for 587 or 25
      tls: {
        rejectUnauthorized: !config.ignoreTLS,
      },
    };

    if (config.user && config.user.trim().length > 0) {
      transportOpts.auth = {
        user: config.user,
        pass: config.pass || "",
      };
    }

    return { transporter: nodemailer.createTransport(transportOpts), config };
  }

  /**
   * Verifies connectivity to the SMTP mail server.
   */
  public static async verifyConnection(custom?: Partial<SmtpConfig>): Promise<{ success: boolean; message: string }> {
    try {
      const { transporter } = this.createTransporter(custom);
      await transporter.verify();
      return { success: true, message: "SMTP mail server connection verified successfully." };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to connect to SMTP mail server." };
    }
  }

  /**
   * Sends an email using configured or custom SMTP credentials.
   */
  public static async sendMail(options: SendMailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { transporter, config } = this.createTransporter(options.config);

    try {
      const info = await transporter.sendMail({
        from: config.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      console.log(`[MailService] Email successfully sent to ${options.to} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      console.error(`[MailService] Failed to send email to ${options.to}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Sends formatted OTP emails for account verification or security purposes.
   */
  public static async sendOtpEmail(
    to: string,
    otp: string,
    purpose: string,
    customConfig?: Partial<SmtpConfig>
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const purposeTitles: Record<string, string> = {
      EMAIL_VERIFICATION: "Verify Your Email Address",
      PASSWORD_RESET: "Reset Your Password",
      LOGIN_2FA: "Login Verification Code",
      LIVE_ORDER_2FA: "Order Confirmation Code",
    };

    const title = purposeTitles[purpose] || "Verification Code";
    const subject = `[Paper Trading] ${otp} is your ${title.toLowerCase()}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #0b0f19; color: #f3f4f6; border-radius: 12px; border: 1px solid #1f2937;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #38bdf8; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Paper Trading Platform</h2>
          <p style="color: #9ca3af; margin-top: 4px; font-size: 14px;">Security & Account Verification</p>
        </div>
        
        <div style="background-color: #111827; border-radius: 8px; padding: 24px; border: 1px solid #374151; text-align: center;">
          <p style="margin: 0 0 12px 0; color: #d1d5db; font-size: 15px;">Your one-time verification code is:</p>
          <div style="display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #10b981; background-color: #064e3b26; padding: 12px 24px; border-radius: 8px; border: 1px dashed #10b981;">
            ${otp}
          </div>
          <p style="margin: 16px 0 0 0; color: #9ca3af; font-size: 13px;">
            This code will expire in <strong>${env.OTP_EXPIRY_MINUTES} minutes</strong>. Do not share this OTP with anyone.
          </p>
        </div>

        <p style="color: #6b7280; font-size: 12px; margin-top: 24px; text-align: center; line-height: 1.5;">
          If you did not request this verification code, please ignore this email or contact support if you suspect unauthorized activity.
        </p>
      </div>
    `;

    const text = `Your Paper Trading verification code is: ${otp}. It will expire in ${env.OTP_EXPIRY_MINUTES} minutes.`;

    return this.sendMail({
      to,
      subject,
      html,
      text,
      config: customConfig,
    });
  }

  /**
   * Diagnostic summary of current SMTP settings.
   */
  public static async getDiagnostics() {
    const config = this.resolveConfig();
    const testResult = await this.verifyConnection();

    return {
      host: config.host,
      port: config.port,
      secure: config.secure,
      hasAuthUser: Boolean(config.user && config.user.trim().length > 0),
      authUser: config.user ? `${config.user.slice(0, 3)}***` : "(none)",
      from: config.from,
      ignoreTLS: config.ignoreTLS,
      connectionStatus: testResult.success ? "CONNECTED" : "FAILED",
      message: testResult.message,
    };
  }
}

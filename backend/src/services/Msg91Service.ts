import axios from "axios";
import { env } from "../config/env";

export interface Msg91SendOtpResponse {
  type: string;
  message?: string;
  request_id?: string;
  reqId?: string;
  methodUsed?: "widget" | "sendOtp";
  warning?: string;
  [key: string]: any;
}

export interface Msg91WidgetVerifyResponse {
  type: string;
  message?: string;
  code?: string;
  [key: string]: any;
}

export interface Msg91Diagnostics {
  serverPublicIp?: string;
  config: {
    authKeyConfigured: boolean;
    authKeyMasked: string;
    tokenConfigured: boolean;
    tokenMasked: string;
    widgetId: string;
    templateId: string;
  };
  sendOtpTest: {
    success: boolean;
    data?: any;
    error?: string;
    diagnostic?: string;
  };
  widgetTest: {
    success: boolean;
    data?: any;
    error?: string;
    diagnostic?: string;
  };
  recommendations: string[];
}

export class Msg91Service {
  private static controlBaseUrl = "https://control.msg91.com/api/v5";
  private static apiBaseUrl = "https://api.msg91.com/api/v5";

  /**
   * Normalize an Indian or international mobile number to standard E.164 digits without leading '+'.
   * Examples:
   *  - "+91 98765 43210" -> "919876543210"
   *  - "9876543210"      -> "919876543210"
   *  - "09876543210"     -> "919876543210"
   */
  public static normalizeMobile(mobile: string): string {
    let cleaned = mobile.replace(/\D/g, "");
    if (cleaned.length === 10) {
      cleaned = `91${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith("0")) {
      cleaned = `91${cleaned.substring(1)}`;
    }
    return cleaned;
  }

  /**
   * Send 6-digit OTP to mobile number using MSG91.
   * Employs a dual-dispatch approach:
   * 1. Attempts MSG91 OTP Widget API if widget credentials (widgetId & tokenAuth) are configured.
   * 2. If Widget fails or is unconfigured, falls back to standard MSG91 SendOTP API with authkey and templateId.
   */
  public static async sendOtp(
    mobile: string,
    otp: string,
    templateId?: string
  ): Promise<Msg91SendOtpResponse> {
    const cleanMobile = this.normalizeMobile(mobile);
    const authkey = env.MSG91_AUTHKEY;
    const widgetToken = env.MSG91_TOKEN;
    const widgetId = env.MSG91_WIDGET_ID;
    const activeTemplate = templateId || env.MSG91_TEMPLATE_ID || widgetId || "";

    let widgetError: string | null = null;

    // Strategy 1: Attempt OTP Widget API if widget credentials exist
    if (widgetId && (widgetToken || authkey)) {
      try {
        const widgetRes = await this.sendViaWidget(cleanMobile, widgetId, widgetToken || authkey, otp);
        console.log(`[MSG91] OTP sent via Widget API to ${cleanMobile}:`, widgetRes);
        return { ...widgetRes, methodUsed: "widget" };
      } catch (err: any) {
        widgetError = err.message || "Widget dispatch failed";
        console.warn(`[MSG91] Widget dispatch failed (${widgetError}), falling back to SendOTP API...`);
      }
    }

    // Strategy 2: Attempt standard SendOTP API
    if (authkey) {
      try {
        const sendOtpRes = await this.sendViaSendOtp(cleanMobile, otp, authkey, activeTemplate);
        console.log(`[MSG91] OTP sent via SendOTP API to ${cleanMobile}:`, sendOtpRes);
        return {
          ...sendOtpRes,
          methodUsed: "sendOtp",
          warning: widgetError ? `Widget failed: ${widgetError}. Sent via SendOTP.` : undefined,
        };
      } catch (err: any) {
        const errorMsg = err.message || "SendOTP dispatch failed";
        console.error(`[MSG91] SendOTP dispatch failed for ${cleanMobile}:`, errorMsg);
        throw new Error(
          this.formatHelpfulError(errorMsg, widgetError)
        );
      }
    }

    console.warn("[MSG91] Neither MSG91_AUTHKEY nor valid widget configured. Skipping SMS dispatch.");
    return { type: "skipped", message: "MSG91 credentials missing" };
  }

  /**
   * Dispatch OTP using MSG91 OTP Widget API:
   * POST https://control.msg91.com/api/v5/widget/sendOtp
   * Headers: tokenAuth: <MSG91_TOKEN>, Content-Type: application/json
   * Body: { widgetId, identifier }
   */
  private static async sendViaWidget(
    cleanMobile: string,
    widgetId: string,
    token: string,
    otp?: string
  ): Promise<Msg91SendOtpResponse> {
    const payload: Record<string, any> = {
      widgetId,
      identifier: cleanMobile,
    };
    if (otp) {
      payload.otp = otp;
    }

    const hosts = [this.controlBaseUrl, this.apiBaseUrl];
    let lastError: any = null;

    for (const host of hosts) {
      try {
        const response = await axios.post(
          `${host}/widget/sendOtp`,
          payload,
          {
            headers: {
              "Content-Type": "application/json",
              tokenAuth: token,
              authkey: token,
            },
            timeout: 10000,
          }
        );

        if (response.data && response.data.type === "error") {
          throw new Error(response.data.message || `MSG91 Widget Error (${response.data.code})`);
        }

        return response.data;
      } catch (err: any) {
        lastError = err.response?.data?.error || err.response?.data?.message || err.message;
      }
    }

    throw new Error(lastError || "Widget API call failed");
  }

  /**
   * Dispatch OTP using MSG91 SendOTP API:
   * POST https://control.msg91.com/api/v5/otp?mobile=...&otp=...&authkey=...&template_id=...
   */
  private static async sendViaSendOtp(
    cleanMobile: string,
    otp: string,
    authkey: string,
    templateId?: string
  ): Promise<Msg91SendOtpResponse> {
    const params: Record<string, string> = {
      mobile: cleanMobile,
      otp,
      authkey,
    };

    if (templateId) {
      params.template_id = templateId;
    }

    const queryString = new URLSearchParams(params).toString();
    const url = `${this.controlBaseUrl}/otp?${queryString}`;

    const response = await axios.post<Msg91SendOtpResponse>(
      url,
      {},
      {
        headers: {
          authkey,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (response.data && response.data.type === "error") {
      throw new Error(response.data.message || `MSG91 SendOTP Error`);
    }

    return response.data;
  }

  /**
   * Retry OTP via Voice call or alternative SMS channel using MSG91.
   * Endpoint: POST https://control.msg91.com/api/v5/otp/retry
   */
  public static async retryOtp(mobile: string, retryType: "voice" | "text" = "voice"): Promise<any> {
    const authkey = env.MSG91_AUTHKEY;
    const cleanMobile = this.normalizeMobile(mobile);
    const url = `${this.controlBaseUrl}/otp/retry?authkey=${encodeURIComponent(authkey)}&mobile=${encodeURIComponent(
      cleanMobile
    )}&retrytype=${retryType}`;

    try {
      const response = await axios.post(url, {}, { headers: { authkey } });
      return response.data;
    } catch (err: any) {
      console.error(`[MSG91] Failed to retry OTP for ${cleanMobile}:`, err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Verify an access token issued by MSG91's client OTP widget.
   * Endpoint: POST https://control.msg91.com/api/v5/widget/verifyAccessToken
   */
  public static async verifyWidgetAccessToken(accessToken: string): Promise<Msg91WidgetVerifyResponse> {
    const authkey = env.MSG91_AUTHKEY || env.MSG91_TOKEN;
    const url = `${this.controlBaseUrl}/widget/verifyAccessToken`;

    try {
      const response = await axios.post<Msg91WidgetVerifyResponse>(
        url,
        {
          authkey,
          "access-token": accessToken,
        },
        {
          headers: {
            "Content-Type": "application/json",
            authkey,
            tokenAuth: env.MSG91_TOKEN || authkey,
          },
          timeout: 10000,
        }
      );

      return response.data;
    } catch (err: any) {
      console.error("[MSG91] Failed to verify widget access token:", err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * Helper to format human-readable error descriptions with actionable troubleshooting steps.
   */
  private static formatHelpfulError(mainError: string, widgetError?: string | null): string {
    let advice = "";
    if (mainError.includes("418") || mainError.includes("not whitelisted") || mainError.includes("IPBlocked") || mainError.includes("408")) {
      advice = " [Action Required: Your public IP is blocked or not whitelisted in MSG91 dashboard. Please add your server IP to MSG91 Whitelist under AuthKey settings or disable IP restriction.]";
    } else if (mainError.includes("201") || mainError.includes("AuthenticationFailure")) {
      advice = " [Action Required: MSG91 AuthKey is invalid or expired. Check your AuthKey in MSG91 dashboard.]";
    } else if (mainError.includes("Widget Not Found")) {
      advice = " [Action Required: Verify the Widget ID in your MSG91 dashboard under OTP Widget.]";
    }

    return `${mainError}${advice}${widgetError ? ` (Widget error: ${widgetError})` : ""}`;
  }

  /**
   * Comprehensive diagnostic check for MSG91 integration.
   */
  public static async checkDiagnostics(): Promise<Msg91Diagnostics> {
    const authKey = env.MSG91_AUTHKEY;
    const token = env.MSG91_TOKEN;
    const widgetId = env.MSG91_WIDGET_ID;
    const templateId = env.MSG91_TEMPLATE_ID;

    // Fetch public IP
    let serverPublicIp = "unknown";
    try {
      const ipRes = await axios.get("https://api.ipify.org?format=json", { timeout: 3000 });
      serverPublicIp = ipRes.data?.ip || "unknown";
    } catch {}

    const recommendations: string[] = [];

    // Test SendOTP endpoint
    let sendOtpTest: Msg91Diagnostics["sendOtpTest"] = { success: false };
    try {
      const testMobile = "919999999999";
      const testUrl = `${this.controlBaseUrl}/otp?mobile=${testMobile}&otp=999999&authkey=${authKey}&template_id=${templateId}`;
      const res = await axios.post(testUrl, {}, { headers: { authkey: authKey }, timeout: 5000 });
      sendOtpTest = { success: res.data?.type === "success", data: res.data };
    } catch (e: any) {
      const errData = e.response?.data || e.message;
      sendOtpTest = { success: false, error: typeof errData === "string" ? errData : JSON.stringify(errData) };
    }

    // Test Widget endpoint
    let widgetTest: Msg91Diagnostics["widgetTest"] = { success: false };
    try {
      const res = await axios.post(
        `${this.controlBaseUrl}/widget/sendOtp`,
        { widgetId, identifier: "919999999999" },
        { headers: { tokenAuth: token, "Content-Type": "application/json" }, timeout: 5000 }
      );
      widgetTest = { success: res.data?.type === "success", data: res.data };
    } catch (e: any) {
      const errData = e.response?.data || e.message;
      widgetTest = { success: false, error: typeof errData === "string" ? errData : JSON.stringify(errData) };
    }

    // Evaluate recommendations
    if (serverPublicIp !== "unknown") {
      recommendations.push(`Server Public IP is ${serverPublicIp}. Ensure this IP is whitelisted in MSG91 dashboard -> AuthKey settings.`);
    }

    if (widgetTest.error?.includes("Widget Not Found")) {
      recommendations.push(`Widget ID '${widgetId}' was not recognized by MSG91. Check MSG91 Dashboard -> OTP Widget to get the exact 32-character Widget ID or name.`);
    }

    if (sendOtpTest.error?.includes("IP") || widgetTest.error?.includes("IP") || widgetTest.error?.includes("408") || widgetTest.error?.includes("418")) {
      recommendations.push("IP Restriction is currently active in your MSG91 account. Whitelist your IP in MSG91 or turn off IP Restriction.");
    }

    recommendations.push("For Indian mobile numbers, ensure your DLT Principal Entity ID, Sender ID, and DLT Content Template are registered and approved by telecom operators.");

    return {
      serverPublicIp,
      config: {
        authKeyConfigured: Boolean(authKey),
        authKeyMasked: authKey ? `${authKey.slice(0, 6)}...${authKey.slice(-4)}` : "missing",
        tokenConfigured: Boolean(token),
        tokenMasked: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : "missing",
        widgetId: widgetId || "missing",
        templateId: templateId || "missing",
      },
      sendOtpTest,
      widgetTest,
      recommendations,
    };
  }
}

import { Request } from "express";
import { UAParser } from "ua-parser-js";
import { prisma } from "../utils/prisma";
import { LoginStatus } from "@prisma/client";

export interface RecordAttemptOptions {
  req: Request;
  email: string;
  userId?: string | null;
  status: LoginStatus;
  failureReason?: string;
  authMethod?: string;
  deviceId?: string;
}

export class LoginAuditService {
  /**
   * Extract real client IP address handling proxies, load balancers, and local loopbacks.
   */
  public static extractClientIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];
    let ip = "";

    if (typeof forwarded === "string") {
      ip = forwarded.split(",")[0].trim();
    } else if (Array.isArray(forwarded) && forwarded.length > 0) {
      ip = forwarded[0].trim();
    } else if (typeof req.headers["x-real-ip"] === "string") {
      ip = req.headers["x-real-ip"].trim();
    } else if (req.socket?.remoteAddress) {
      ip = req.socket.remoteAddress;
    } else if (req.ip) {
      ip = req.ip;
    }

    if (!ip) return "127.0.0.1";

    // Normalize IPv6 mapped IPv4 address (e.g., ::ffff:127.0.0.1 -> 127.0.0.1)
    if (ip.startsWith("::ffff:")) {
      ip = ip.substring(7);
    }
    if (ip === "::1") {
      ip = "127.0.0.1";
    }
    return ip;
  }

  /**
   * Parse user agent string into structured browser, OS, and device information.
   */
  public static parseUserAgent(uaString?: string) {
    const ua = uaString || "";
    const parser = new UAParser(ua);
    const browserResult = parser.getBrowser();
    const osResult = parser.getOS();
    const deviceResult = parser.getDevice();

    const browserName = browserResult.name || "Unknown Browser";
    const browserVersion = browserResult.version || null;

    const osName = osResult.name || "Unknown OS";
    const osVersion = osResult.version || null;

    let deviceType = "DESKTOP";
    if (deviceResult.type === "mobile") {
      deviceType = "MOBILE";
    } else if (deviceResult.type === "tablet") {
      deviceType = "TABLET";
    } else if (deviceResult.type === "smarttv" || deviceResult.type === "wearable" || deviceResult.type === "console") {
      deviceType = deviceResult.type.toUpperCase();
    } else if (/mobile|android|iphone|ipad|ipod/i.test(ua)) {
      deviceType = /tablet|ipad/i.test(ua) ? "TABLET" : "MOBILE";
    }

    let deviceModel = deviceResult.model || null;
    if (!deviceModel) {
      if (/iPhone/i.test(ua)) deviceModel = "iPhone";
      else if (/iPad/i.test(ua)) deviceModel = "iPad";
      else if (/Macintosh/i.test(ua)) deviceModel = "Macintosh";
      else if (/Windows/i.test(ua)) deviceModel = "PC (Windows)";
      else if (/Linux/i.test(ua)) deviceModel = "PC (Linux)";
      else if (/Android/i.test(ua)) deviceModel = "Android Device";
    }

    return {
      browser: browserName,
      browserVersion,
      os: osName,
      osVersion,
      deviceType,
      deviceModel,
    };
  }

  /**
   * Records a user authentication attempt (both successful and failed) for auditing and security monitoring.
   */
  public static async recordAttempt(options: RecordAttemptOptions) {
    const { req, email, userId, status, failureReason, authMethod = "PASSWORD" } = options;

    try {
      const ipAddress = this.extractClientIp(req);
      const userAgent = (req.headers["user-agent"] as string) || "Unknown User-Agent";
      const { browser, browserVersion, os, osVersion, deviceType, deviceModel } = this.parseUserAgent(userAgent);

      // Extract client device ID: header > body > fallback
      const deviceId =
        (req.headers["x-device-id"] as string) ||
        options.deviceId ||
        (req.body?.deviceId as string) ||
        `unknown-${ipAddress.replace(/[^a-zA-Z0-9]/g, "")}`;

      // Timezone and screen hints if supplied by modern client
      const timezone = (req.headers["x-client-timezone"] as string) || (req.body?.clientTimezone as string) || null;
      const screenResolution = (req.headers["x-client-screen"] as string) || (req.body?.clientScreen as string) || null;

      // Geolocation headers (Cloudflare, AWS CloudFront, etc.)
      const country = (req.headers["cf-ipcountry"] as string) || (req.headers["x-country-code"] as string) || (ipAddress === "127.0.0.1" ? "Localhost" : null);
      const city = (req.headers["cf-ipcity"] as string) || null;

      // Detect suspicious activity: >= 4 failed attempts in last 15 minutes from same IP or for same email
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      const recentFails = await prisma.userLoginHistory.count({
        where: {
          OR: [{ ipAddress }, { email: email.toLowerCase().trim() }],
          status: "FAILED",
          createdAt: { gte: fifteenMinsAgo },
        },
      });

      const isSuspicious = status === "FAILED" && recentFails >= 3;

      return await prisma.userLoginHistory.create({
        data: {
          userId: userId || null,
          email: email.toLowerCase().trim(),
          status,
          failureReason: failureReason || null,
          authMethod,
          ipAddress,
          deviceId,
          userAgent,
          browser,
          browserVersion,
          os,
          osVersion,
          deviceType,
          deviceModel,
          timezone,
          screenResolution,
          country,
          city,
          isSuspicious,
        },
      });
    } catch (err: any) {
      // Do not block authentication flow if logging throws, but log warning
      console.error("[LoginAuditService] Failed to record login attempt:", err.message);
      return null;
    }
  }

  /**
   * Retrieve login history for a specific user (used in User Profile).
   */
  public static async getUserLoginHistory(
    userId: string,
    currentDeviceId?: string,
    page = 1,
    limit = 20
  ) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.userLoginHistory.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.userLoginHistory.count({ where: { userId } }),
    ]);

    const formatted = items.map((item) => ({
      ...item,
      isCurrentDevice: Boolean(currentDeviceId && item.deviceId === currentDeviceId),
    }));

    return {
      items: formatted,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieve security audit history for Admin Portal with rich filtering and security KPIs.
   */
  public static async getAdminLoginHistory(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: LoginStatus;
    userId?: string;
    isSuspicious?: boolean;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.userId) {
      where.userId = params.userId;
    }

    if (params.isSuspicious !== undefined) {
      where.isSuspicious = params.isSuspicious;
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { ipAddress: { contains: q, mode: "insensitive" } },
        { deviceId: { contains: q, mode: "insensitive" } },
        { browser: { contains: q, mode: "insensitive" } },
        { os: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.userLoginHistory.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              createdAt: true,
              kyc: { select: { status: true } },
              liveTradingAccount: { select: { status: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.userLoginHistory.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get high-level security stats for admin dashboard.
   */
  public static async getAdminSecurityStats() {
    const now = new Date();
    const past24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const past7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      total24h,
      success24h,
      failed24h,
      total7d,
      suspiciousCount,
      uniqueDevices,
      uniqueIps,
    ] = await Promise.all([
      prisma.userLoginHistory.count({ where: { createdAt: { gte: past24Hours } } }),
      prisma.userLoginHistory.count({ where: { createdAt: { gte: past24Hours }, status: "SUCCESS" } }),
      prisma.userLoginHistory.count({ where: { createdAt: { gte: past24Hours }, status: "FAILED" } }),
      prisma.userLoginHistory.count({ where: { createdAt: { gte: past7Days } } }),
      prisma.userLoginHistory.count({ where: { isSuspicious: true } }),
      prisma.userLoginHistory.groupBy({ by: ["deviceId"], _count: { _all: true } }),
      prisma.userLoginHistory.groupBy({ by: ["ipAddress"], _count: { _all: true } }),
    ]);

    return {
      total24h,
      success24h,
      failed24h,
      failureRate24h: total24h > 0 ? ((failed24h / total24h) * 100).toFixed(1) : "0.0",
      total7d,
      suspiciousCount,
      uniqueDevicesCount: uniqueDevices.length,
      uniqueIpsCount: uniqueIps.length,
    };
  }

  /**
   * Get in-depth user security footprint (devices, IPs, recent activity, failure history).
   */
  public static async getUserSecurityOverview(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        wallet: { select: { cashBalance: true } },
        kyc: { select: { status: true, panVerified: true } },
        liveTradingAccount: { select: { status: true } },
      },
    });

    const [recentLogins, devices, ips, totalLogins, failedAttempts] = await Promise.all([
      prisma.userLoginHistory.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.userLoginHistory.groupBy({
        by: ["deviceId", "deviceType", "browser", "os"],
        where: { userId },
        _count: { _all: true },
        _max: { createdAt: true },
        _min: { createdAt: true },
      }),
      prisma.userLoginHistory.groupBy({
        by: ["ipAddress", "country", "city"],
        where: { userId },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.userLoginHistory.count({ where: { userId } }),
      prisma.userLoginHistory.count({ where: { userId, status: "FAILED" } }),
    ]);

    return {
      user,
      totalLogins,
      failedAttempts,
      devices: devices.map((d) => ({
        deviceId: d.deviceId,
        deviceType: d.deviceType,
        browser: d.browser,
        os: d.os,
        loginCount: d._count._all,
        firstSeen: d._min.createdAt,
        lastSeen: d._max.createdAt,
      })),
      ips: ips.map((ip) => ({
        ipAddress: ip.ipAddress,
        country: ip.country,
        city: ip.city,
        count: ip._count._all,
        lastSeen: ip._max.createdAt,
      })),
      recentLogins,
    };
  }
}

/**
 * Device fingerprinting & client telemetry utility for security auditing
 */

const DEVICE_ID_KEY = "paper_trading_device_id";

/**
 * Retrieve existing persistent device ID or generate a cryptographically strong UUID.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") {
    return "server-env";
  }

  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        deviceId = crypto.randomUUID();
      } else {
        // Fallback for older environments
        deviceId = "dev_" + Math.random().toString(36).substring(2, 15) + "_" + Date.now();
      }
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return "dev_fallback_" + Date.now();
  }
}

/**
 * Collect non-sensitive client security hints for modern audit tracking.
 */
export function getClientDeviceHints() {
  if (typeof window === "undefined") {
    return {
      deviceId: "server-env",
      clientTimezone: "UTC",
      clientScreen: "unknown",
    };
  }

  let clientTimezone = "UTC";
  try {
    clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    // fallback
  }

  const clientScreen = typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : "unknown";

  return {
    deviceId: getOrCreateDeviceId(),
    clientTimezone,
    clientScreen,
  };
}

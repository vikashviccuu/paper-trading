/**
 * Indian Market Hours Utility (NSE / BSE / NFO / MCX)
 * Standard Market Times in Indian Standard Time (IST = UTC + 05:30):
 * - NSE / BSE / NFO: Monday to Friday, 09:15 AM to 03:30 PM IST
 * - MCX (Commodities): Monday to Friday, 09:00 AM to 11:30 PM IST
 * - Weekends (Saturday & Sunday): CLOSED
 */

export interface MarketStatus {
  isOpen: boolean;
  reason?: string;
  exchange: string;
  marketOpenTime: string;
  marketCloseTime: string;
  currentIstTime: string;
  isWeekend: boolean;
}

export function getIndianTime(date = new Date()): {
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  hours: number;
  minutes: number;
  seconds: number;
  timeString: string;
  istDate: Date;
} {
  // Compute IST (UTC + 5 hours 30 minutes)
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60 * 1000;
  const istDate = new Date(utcMs + istOffsetMs);

  const dayOfWeek = istDate.getDay();
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const seconds = istDate.getSeconds();
  const timeString = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return { dayOfWeek, hours, minutes, seconds, timeString, istDate };
}

export function isMarketOpen(exchange: string = "NSE"): {
  isOpen: boolean;
  reason?: string;
  marketOpenTime: string;
  marketCloseTime: string;
  currentIstTime: string;
} {
  const currentEnv = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
  const isTestingEnv = ["local", "development", "dev", "qc", "uat", "staging"].includes(currentEnv);

  // Allow after-hours trading for testing in local, dev, qc, uat unless explicitly enforced
  if (process.env.ALLOW_AFTER_HOURS_TRADING === "true" || (isTestingEnv && process.env.ENFORCE_MARKET_HOURS !== "true")) {
    return {
      isOpen: true,
      marketOpenTime: "09:15",
      marketCloseTime: "15:30",
      currentIstTime: getIndianTime().timeString,
    };
  }

  const { dayOfWeek, hours, minutes, timeString } = getIndianTime();
  const ex = (exchange || "NSE").toUpperCase();

  // Saturday (6) or Sunday (0)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    const dayName = dayOfWeek === 0 ? "Sunday" : "Saturday";
    return {
      isOpen: false,
      reason: `Markets are closed on weekends (${dayName}). Trading resumes Monday at 09:15 AM IST. (Current IST: ${timeString})`,
      marketOpenTime: ex === "MCX" ? "09:00" : "09:15",
      marketCloseTime: ex === "MCX" ? "23:30" : "15:30",
      currentIstTime: timeString,
    };
  }

  const currentMinutes = hours * 60 + minutes;

  if (ex === "MCX") {
    const openMinutes = 9 * 60; // 09:00 AM
    const closeMinutes = 23 * 60 + 30; // 11:30 PM
    if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
      return {
        isOpen: false,
        reason: `MCX commodity market is closed. Active trading hours: Monday to Friday, 09:00 AM to 11:30 PM IST. (Current IST: ${timeString})`,
        marketOpenTime: "09:00",
        marketCloseTime: "23:30",
        currentIstTime: timeString,
      };
    }
    return {
      isOpen: true,
      marketOpenTime: "09:00",
      marketCloseTime: "23:30",
      currentIstTime: timeString,
    };
  }

  // NSE / BSE / NFO / BFO
  const openMinutes = 9 * 60 + 15; // 09:15 AM
  const closeMinutes = 15 * 60 + 30; // 03:30 PM

  if (currentMinutes < openMinutes) {
    return {
      isOpen: false,
      reason: `Market is closed (Pre-market). Regular trading begins at 09:15 AM IST. (Current IST: ${timeString})`,
      marketOpenTime: "09:15",
      marketCloseTime: "15:30",
      currentIstTime: timeString,
    };
  }

  if (currentMinutes >= closeMinutes) {
    return {
      isOpen: false,
      reason: `Market is closed for the day. Trading hours are Monday to Friday, 09:15 AM to 03:30 PM IST. (Current IST: ${timeString})`,
      marketOpenTime: "09:15",
      marketCloseTime: "15:30",
      currentIstTime: timeString,
    };
  }

  return {
    isOpen: true,
    marketOpenTime: "09:15",
    marketCloseTime: "15:30",
    currentIstTime: timeString,
  };
}

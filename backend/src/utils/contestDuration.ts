export type ContestDurationType = "WEEKLY" | "MONTHLY" | "HALF_YEARLY" | "YEARLY" | "CUSTOM";

/** Sets a date's time-of-day (in server-local time) to the given "HH:MM". */
export function pinToTimeOfDay(date: Date, hhmm: string): Date {
  const [hh, mm] = hhmm.split(":").map(Number);
  const d = new Date(date);
  d.setHours(hh, mm, 0, 0);
  return d;
}

/**
 * For preset durations, computes the contest's endDate from its startDate so
 * the last day always closes at market-close time, not some arbitrary hour -
 * "weekly" means start date + 7 days, ending at market close on that day.
 * CUSTOM contests are exempt - the caller supplies endDate directly.
 */
export function computeContestEndDate(
  startDate: Date,
  durationType: ContestDurationType,
  marketCloseTime: string
): Date {
  const end = new Date(startDate);
  switch (durationType) {
    case "WEEKLY":
      end.setDate(end.getDate() + 7);
      break;
    case "MONTHLY":
      end.setMonth(end.getMonth() + 1);
      break;
    case "HALF_YEARLY":
      end.setMonth(end.getMonth() + 6);
      break;
    case "YEARLY":
      end.setFullYear(end.getFullYear() + 1);
      break;
    case "CUSTOM":
      throw new Error("computeContestEndDate should not be called for CUSTOM duration - endDate must be supplied directly");
  }
  return pinToTimeOfDay(end, marketCloseTime);
}

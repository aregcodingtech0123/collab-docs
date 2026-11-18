// "5 minutes ago"-style formatting for the document list. Pure; `now` is injectable for tests.

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

type DateInput = Date | string | number;

/** e.g. "just now", "5 minutes ago", "3 hours ago", "yesterday", "2 weeks ago", "Oct 3, 2026". */
export function formatRelativeTime(date: DateInput, now: DateInput = new Date()): string {
  const then = new Date(date).getTime();
  const current = new Date(now).getTime();
  if (Number.isNaN(then) || Number.isNaN(current)) return "";

  const diff = Math.round((then - current) / 1000); // negative = in the past
  const abs = Math.abs(diff);
  const sign = diff < 0 ? -1 : 1;

  if (abs < 45) return "just now"; // also covers small clock skew into the "future"
  if (abs < 45 * MINUTE) return rtf.format(sign * Math.max(1, Math.round(abs / MINUTE)), "minute");
  if (abs < 22 * HOUR) return rtf.format(sign * Math.max(1, Math.round(abs / HOUR)), "hour");
  if (abs < 7 * DAY) return rtf.format(sign * Math.max(1, Math.round(abs / DAY)), "day");
  if (abs < 30 * DAY) return rtf.format(sign * Math.max(1, Math.round(abs / WEEK)), "week");
  return dateFormat.format(then);
}

/** Exact time for tooltips, always in UTC so server and client agree. */
export function formatAbsoluteTime(date: DateInput): string {
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? "" : `${dateTimeFormat.format(t)} UTC`;
}

const RTF = new Intl.RelativeTimeFormat("en", { numeric: "always" });

const UNITS: { ms: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { ms: 365 * 86400e3, unit: "year" },
  { ms: 30 * 86400e3, unit: "month" },
  { ms: 7 * 86400e3, unit: "week" },
  { ms: 86400e3, unit: "day" },
  { ms: 3600e3, unit: "hour" },
  { ms: 60e3, unit: "minute" },
];

/** "4 months ago", "2 days ago", "just now" — for the lightbox date line. */
export function relativeDate(epochMs: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - epochMs);
  for (const { ms, unit } of UNITS) {
    if (diff >= ms) return RTF.format(-Math.floor(diff / ms), unit);
  }
  return "just now";
}

/** Exact date for the hover title attribute, e.g. "June 12, 2026 at 7:40 PM". */
export function exactDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });
}

/**
 * Fixture timestamps are relative to "now" so the demo always has a plausible
 * upcoming week no matter when you run it.
 */

export function daysFromNow(days: number, hour = 23, minute = 59): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

export function daysAgo(days: number, hour = 9, minute = 0): string {
  return daysFromNow(-days, hour, minute);
}

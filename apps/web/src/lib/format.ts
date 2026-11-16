const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** A month is 30 days and a year 365 — close enough for "how long ago". */
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const relativeTimeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
// No `timeZone` option: the viewer's zone applies.
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** "just now", "5 minutes ago", "3 months ago" — how long before `now` the moment `iso` was. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const age = now.getTime() - new Date(iso).getTime();
  // A negative age means the viewer's clock is behind the server's.
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return relativeTimeFormat.format(-Math.floor(age / MINUTE), 'minute');
  if (age < DAY) return relativeTimeFormat.format(-Math.floor(age / HOUR), 'hour');
  if (age < MONTH) return relativeTimeFormat.format(-Math.floor(age / DAY), 'day');
  if (age < YEAR) return relativeTimeFormat.format(-Math.floor(age / MONTH), 'month');
  return relativeTimeFormat.format(-Math.floor(age / YEAR), 'year');
}

/** "15 Nov 2026, 10:00" in the viewer's time zone. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** "8.2 kg", or "—" when there is no weight. */
export function formatWeight(weightKg: number | null): string {
  return weightKg === null ? '—' : `${weightKg} kg`;
}

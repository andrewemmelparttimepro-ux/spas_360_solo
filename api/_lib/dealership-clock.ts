// Ari has no clock of her own. Every staff request gets this line appended so
// "today", "this week", and follow-up dates are anchored to the dealership's
// local time, not to whatever the model assumes. Leaf module (no imports) so
// tests can load it directly under node --experimental-strip-types.
export const DEALERSHIP_TIMEZONE = 'America/Chicago';

export function dealershipClock(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEALERSHIP_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  const stamp = `${part('weekday')}, ${part('month')} ${part('day')}, ${part('year')}, ${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
  return `Current dealership date and time: ${stamp} (${DEALERSHIP_TIMEZONE}).`;
}

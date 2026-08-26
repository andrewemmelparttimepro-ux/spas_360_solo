const DEALERSHIP_TIME_ZONE = 'America/Chicago';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const dealershipDate = new Intl.DateTimeFormat('en-US', {
  timeZone: DEALERSHIP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function calendarDayNumber(value: Date): number | null {
  if (Number.isNaN(value.getTime())) return null;

  const parts = dealershipDate.formatToParts(value);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  if (!year || !month || !day) return null;

  return Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY;
}

/** Calendar days since the item was added, measured in dealership-local time. */
export function inventoryAgeInDays(createdAt: string, now: Date = new Date()): number | null {
  const createdDay = calendarDayNumber(new Date(createdAt));
  const currentDay = calendarDayNumber(now);
  if (createdDay === null || currentDay === null) return null;
  return Math.max(0, currentDay - createdDay);
}

export function inventoryAgeLabel(createdAt: string, now: Date = new Date()): string {
  const days = inventoryAgeInDays(createdAt, now);
  if (days === null) return '—';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

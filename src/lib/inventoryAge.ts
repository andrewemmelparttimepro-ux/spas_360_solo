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

function calendarDayNumberFromString(value: string): number | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year
      || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day
    ) return null;
    return parsed.getTime() / MILLISECONDS_PER_DAY;
  }

  return calendarDayNumber(new Date(value));
}

/** Calendar days since the effective inventory start date, measured in dealership-local time. */
export function inventoryAgeInDays(startedAt: string, now: Date = new Date()): number | null {
  const createdDay = calendarDayNumberFromString(startedAt);
  const currentDay = calendarDayNumber(now);
  if (createdDay === null || currentDay === null) return null;
  return Math.max(0, currentDay - createdDay);
}

export function inventoryAgeLabel(startedAt: string, now: Date = new Date()): string {
  const days = inventoryAgeInDays(startedAt, now);
  if (days === null) return '—';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Prefer the explicit received date, falling back to when the inventory row was entered. */
export function inventoryAgeLabelForItem(
  dateReceived: string | null | undefined,
  createdAt: string,
  now: Date = new Date(),
): string {
  return inventoryAgeLabel(dateReceived?.trim() || createdAt, now);
}

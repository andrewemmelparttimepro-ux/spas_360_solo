const DEAL_CREATED_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatDealCreated(createdAt: string | null | undefined): string {
  if (!createdAt) return '—';
  const created = new Date(createdAt);
  return Number.isNaN(created.getTime()) ? '—' : DEAL_CREATED_FORMATTER.format(created);
}

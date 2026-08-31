import type { SuggestionStatus, UserRole } from '../types/database.ts';

export const SUGGESTION_MAX_LENGTH = 2000;

export const SUGGESTION_STATUS: Record<SuggestionStatus, { label: string; tone: string }> = {
  pending: { label: 'Pending review', tone: 'bg-amber-500/10 text-amber-300 border-amber-500/25' },
  reviewed: { label: 'Reviewed', tone: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' },
  declined: { label: 'Not planned', tone: 'bg-ink-800 text-ink-300 border-ink-700' },
};

export function canReviewSuggestions(role: UserRole | null | undefined): boolean {
  return role === 'owner_manager';
}

export function normalizeSuggestionBody(value: string): string {
  return value.trim().slice(0, SUGGESTION_MAX_LENGTH);
}

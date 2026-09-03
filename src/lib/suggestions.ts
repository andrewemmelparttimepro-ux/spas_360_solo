import type { SuggestionStatus, UserRole } from '../types/database.ts';

export const SUGGESTION_MAX_LENGTH = 2000;

export const SUGGESTION_STATUS: Record<SuggestionStatus, { label: string; tone: string }> = {
  pending: { label: 'Pending review', tone: 'bg-amber-500/10 text-amber-300 border-amber-500/25' },
  reviewed: { label: 'Reviewed', tone: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' },
  declined: { label: 'Not planned', tone: 'bg-ink-800 text-ink-300 border-ink-700' },
  promoted: { label: 'Being built', tone: 'bg-brand-500/10 text-brand-300 border-brand-500/25' },
};

export function canReviewSuggestions(role: UserRole | null | undefined): boolean {
  return role === 'owner_manager';
}

/**
 * Promotion is the one bridge between the Suggestion Box and the Fix-It Feed,
 * and it is a human click by an owner who is also a Fix-It member. The owner
 * becomes the card's author; the agents never see the suggestions table.
 */
export function canPromoteSuggestion(role: UserRole | null | undefined, canUseFixIt: boolean): boolean {
  return canReviewSuggestions(role) && canUseFixIt;
}

export function normalizeSuggestionBody(value: string): string {
  return value.trim().slice(0, SUGGESTION_MAX_LENGTH);
}

export function fixItPostBodyForSuggestion(authorName: string, body: string): string {
  const clean = normalizeSuggestionBody(body);
  return `Suggestion from ${authorName || 'a team member'} (via the Suggestion Box):\n\n${clean}`;
}

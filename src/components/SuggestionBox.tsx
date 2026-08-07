import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Inbox, Loader2, MessageSquarePlus, Send, X, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import {
  canReviewSuggestions,
  normalizeSuggestionBody,
  SUGGESTION_MAX_LENGTH,
  SUGGESTION_STATUS,
} from '@/lib/suggestions';
import type { Suggestion, SuggestionStatus } from '@/types/database';
import { cn } from '@/lib/utils';

interface SuggestionRow extends Suggestion {
  author: { first_name: string; last_name: string } | null;
}

interface SuggestionBoxProps {
  open: boolean;
  onClose: () => void;
}

const reviewActions: { status: SuggestionStatus; label: string; icon: typeof Clock3 }[] = [
  { status: 'pending', label: 'Pending', icon: Clock3 },
  { status: 'reviewed', label: 'Reviewed', icon: CheckCircle2 },
  { status: 'declined', label: 'Not planned', icon: XCircle },
];

export default function SuggestionBox({ open, onClose }: SuggestionBoxProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [body, setBody] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<SuggestionStatus | 'all'>('all');
  const isManager = canReviewSuggestions(profile?.role);

  const loadSuggestions = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('suggestions')
      .select(`
        id, org_id, body, created_by, status, reviewed_by, reviewed_at, created_at, updated_at,
        author:profiles!suggestions_created_by_fkey(first_name, last_name)
      `)
      .order('created_at', { ascending: false });

    setLoading(false);
    if (error) {
      toast('Suggestions could not be loaded. Please try again.', 'error');
      return;
    }
    setSuggestions((data ?? []) as unknown as SuggestionRow[]);
  }, [profile, toast]);

  useEffect(() => {
    if (!open) return;
    void loadSuggestions();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [loadSuggestions, onClose, open]);

  const visibleSuggestions = useMemo(
    () => filter === 'all' ? suggestions : suggestions.filter(suggestion => suggestion.status === filter),
    [filter, suggestions],
  );

  async function submitSuggestion(event: React.FormEvent) {
    event.preventDefault();
    if (!profile || submitting) return;
    const cleanBody = normalizeSuggestionBody(body);
    if (!cleanBody) {
      toast('Add a comment before submitting.', 'warning');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('suggestions').insert({
      org_id: profile.org_id,
      body: cleanBody,
      created_by: profile.id,
    });
    setSubmitting(false);

    if (error) {
      toast('Your suggestion could not be submitted. Please try again.', 'error');
      return;
    }

    setBody('');
    toast('Suggestion submitted for review.');
    await loadSuggestions();
  }

  async function updateStatus(id: string, status: SuggestionStatus) {
    if (!profile || !isManager || updatingId) return;
    setUpdatingId(id);
    const reviewed = status !== 'pending';
    const reviewedAt = reviewed ? new Date().toISOString() : null;
    const { error } = await supabase
      .from('suggestions')
      .update({
        status,
        reviewed_by: reviewed ? profile.id : null,
        reviewed_at: reviewedAt,
      })
      .eq('id', id)
      .select('id')
      .single();
    setUpdatingId(null);

    if (error) {
      toast('That review status could not be saved.', 'error');
      return;
    }

    setSuggestions(current => current.map(suggestion => (
      suggestion.id === id
        ? {
          ...suggestion,
          status,
          reviewed_by: reviewed ? profile.id : null,
          reviewed_at: reviewedAt,
          updated_at: new Date().toISOString(),
        }
        : suggestion
    )));
    toast(`Suggestion marked ${SUGGESTION_STATUS[status].label.toLowerCase()}.`);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggestion-box-title"
        className="flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-ink-700 bg-ink-900 shadow-2xl sm:h-auto sm:max-h-[88dvh] sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-700 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
              <MessageSquarePlus className="h-5 w-5" />
            </span>
            <div>
              <h2 id="suggestion-box-title" className="text-lg font-bold text-ink-100">Suggestion Box</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-400 sm:text-sm">
                Share an improvement for Brandon and the management team to review.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Suggestion Box"
            className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto">
          <form onSubmit={submitSuggestion} className="border-b border-ink-700 bg-ink-850/60 p-4 sm:p-6">
            <label htmlFor="suggestion-body" className="mb-2 block text-sm font-semibold text-ink-200">
              What change would help?
            </label>
            <textarea
              id="suggestion-body"
              value={body}
              onChange={event => setBody(event.target.value)}
              maxLength={SUGGESTION_MAX_LENGTH}
              rows={4}
              autoFocus
              placeholder="Describe the change you would like to see…"
              className="w-full resize-y rounded-xl border border-ink-700 bg-ink-900 px-3 py-3 text-sm text-ink-100 placeholder:text-ink-500 focus:border-brand-500 focus:outline-none"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-ink-500">{body.length}/{SUGGESTION_MAX_LENGTH}</span>
              <button
                type="submit"
                disabled={submitting || !body.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit suggestion
              </button>
            </div>
          </form>

          <div className="p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-ink-100">{isManager ? 'Team suggestions' : 'My suggestions'}</h3>
                <p className="text-xs text-ink-500">
                  {isManager ? 'Review suggestions from people in your organization.' : 'Track what you have shared.'}
                </p>
              </div>
              {isManager && (
                <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-ink-850 p-1" aria-label="Filter suggestions">
                  {(['all', 'pending', 'reviewed', 'declined'] as const).map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value)}
                      className={cn(
                        'whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium capitalize text-ink-400 hover:text-ink-100',
                        filter === value && 'bg-ink-800 text-ink-100 shadow-sm',
                      )}
                    >
                      {value === 'all' ? 'All' : SUGGESTION_STATUS[value].label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-12 text-ink-500"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : visibleSuggestions.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-ink-700 px-4 py-10 text-center">
                <Inbox className="mb-3 h-8 w-8 text-ink-500" />
                <p className="text-sm font-medium text-ink-300">No suggestions here yet</p>
                <p className="mt-1 text-xs text-ink-500">New comments will appear here after they are submitted.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleSuggestions.map(suggestion => {
                  const status = SUGGESTION_STATUS[suggestion.status];
                  const authorName = suggestion.author
                    ? `${suggestion.author.first_name} ${suggestion.author.last_name}`
                    : 'Team member';
                  return (
                    <article key={suggestion.id} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-xs text-ink-500">
                          {isManager && <span className="font-medium text-ink-300">{authorName} · </span>}
                          {formatDistanceToNow(new Date(suggestion.created_at), { addSuffix: true })}
                        </div>
                        <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold', status.tone)}>
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-200">{suggestion.body}</p>

                      {isManager && (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-700 pt-3" aria-label="Review status">
                          {reviewActions.map(action => {
                            const Icon = action.icon;
                            const selected = suggestion.status === action.status;
                            return (
                              <button
                                key={action.status}
                                type="button"
                                disabled={selected || updatingId === suggestion.id}
                                onClick={() => void updateStatus(suggestion.id, action.status)}
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-medium text-ink-400 hover:bg-ink-800 hover:text-ink-100 disabled:cursor-default',
                                  selected && 'border-brand-500/40 bg-brand-500/10 text-brand-300',
                                )}
                              >
                                {updatingId === suggestion.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Icon className="h-3.5 w-3.5" />}
                                {action.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

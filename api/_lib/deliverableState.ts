/** Text responses are never evidence of sending, review or a completed artifact. */
export function textDeliverableState(request: string, answer: string): { kind: 'email' | 'sms' | 'document'; status: 'needs_input' | 'draft' } | null {
  const asked = /\b(draft|write|compose|prepare|create|make)\b/i.test(request);
  if (!asked) return null;
  const kind = /\bemail\b/i.test(request) ? 'email' : /\b(sms|text message)\b/i.test(request) ? 'sms' : /\b(document|proposal|brief|one.pager)\b/i.test(request) ? 'document' : null;
  if (!kind) return null;
  if (/I'm here to help you sell and serve|out of scope|cannot help with that/i.test(answer)) return null;
  const clarification = /(?:which|what|who(?:se)?)\s+(?:customer|client|recipient|name|email|deal|product)|(?:need|provide|confirm)\s+(?:the\s+)?(?:customer|recipient|details|email address)|\[CONFIRM:/i.test(answer);
  // A question without a concrete draft is retained as awaiting input. Even a
  // concrete body is only a draft until a human reviews it.
  const concreteBody = /(?:^|\n)Subject:|(?:^|\n)(?:Hi|Dear|Hello)\s+\S/i.test(answer);
  return { kind, status: clarification || (answer.trim().endsWith('?') && !concreteBody) ? 'needs_input' : 'draft' };
}

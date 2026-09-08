export type EmailPayload = { from: string; to: string[]; subject: string; html: string; text: string; tags: { name: string; value: string }[] };
export async function submitMorningEmail(apiKey: string, payload: EmailPayload, idempotencyKey: string, request: typeof fetch = fetch): Promise<{ id: string } | { error: string }> {
  try {
    const response = await request('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => null) as { id?: string; message?: string } | null;
    return response.ok && data?.id ? { id: data.id } : { error: data?.message ?? `Provider HTTP ${response.status}` };
  } catch { return { error: 'Provider outcome unknown after connection failure; retry uses the same payload and key within its receipt window.' }; }
}

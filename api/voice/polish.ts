import type { VercelRequest, VercelResponse } from '@vercel/node';

const envValue = (value: string | undefined) => (value || '').trim();
const ARI_FORWARD_SECRET = envValue(process.env.ARI_FORWARD_SECRET);
const SUPABASE_URL = envValue(process.env.VITE_SUPABASE_URL);
const SUPABASE_ANON = envValue(process.env.VITE_SUPABASE_ANON_KEY);
const META_API_KEY = envValue(process.env.MODEL_API_KEY || process.env.META_MODEL_API_KEY);
const META_MODEL = envValue(process.env.META_MODEL) || 'muse-spark-1.1';
const META_BASE_URL = (envValue(process.env.META_BASE_URL) || 'https://api.meta.ai/v1').replace(/\/$/, '');
const GLM_API_KEY = envValue(process.env.GLM_API_KEY || process.env.ZAI_API_KEY);
const GLM_MODEL = envValue(process.env.GLM_MODEL) || 'glm-5.2';
const GLM_BASE_URL = (envValue(process.env.GLM_BASE_URL) || 'https://api.z.ai/api/paas/v4').replace(/\/$/, '');

function header(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function constantTimeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function isAuthenticated(authHeader: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON || !authHeader) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: authHeader },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const isForwardFace = constantTimeEqual(header(req.headers['x-ari-forward-secret']), ARI_FORWARD_SECRET);
  if (!isForwardFace && !(await isAuthenticated(header(req.headers.authorization)))) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 4_000) : '';
  const context = typeof req.body?.context === 'string' ? req.body.context.trim().slice(0, 500) : '';
  if (!text) return res.status(400).json({ error: 'Dictation text is required' });

  // Never make dictation unusable because a cleanup model is unavailable.
  if (!META_API_KEY && !GLM_API_KEY) return res.status(200).json({ text, polished: false });

  const system = `You are a voice-dictation editor, not an assistant. Return only the user's cleaned text.
- Preserve the speaker's intent, tone, names, product terms, numbers, and requested action.
- Remove filler words, stutters, duplicated fragments, and transcription artifacts.
- When the speaker corrects themselves, keep the latest correction and remove the abandoned wording.
- Add natural punctuation and formatting. Do not add facts or infer a different request.
- Never answer the request, explain the edit, use quotation marks around it, or take an action.`;

  const polishWith = async (apiKey: string, baseUrl: string, model: string) => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Accept-Language': 'en-US,en',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `${context ? `Composer context: ${context}\n` : ''}Raw dictation:\n${text}` },
        ],
        temperature: 0.1,
        max_tokens: 700,
      }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const polished = body.choices?.[0]?.message?.content;
    return typeof polished === 'string' && polished.trim() ? polished.trim().slice(0, 4_000) : null;
  };

  try {
    // Spark stays first. GLM is a resilience fallback so dictation polish still works
    // when the experimental model endpoint is rotating credentials or unavailable.
    const polished = (META_API_KEY ? await polishWith(META_API_KEY, META_BASE_URL, META_MODEL) : null)
      ?? (GLM_API_KEY ? await polishWith(GLM_API_KEY, GLM_BASE_URL, GLM_MODEL) : null);
    if (!polished) return res.status(200).json({ text, polished: false });
    return res.status(200).json({ text: polished, polished: true });
  } catch {
    return res.status(200).json({ text, polished: false });
  }
}

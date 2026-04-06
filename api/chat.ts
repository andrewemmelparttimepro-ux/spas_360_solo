import type { VercelRequest, VercelResponse } from '@vercel/node';

// Provider-agnostic: supports Gemini (default) or OpenAI
const PROVIDER = process.env.AI_PROVIDER || 'gemini';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing authorization' });

  try {
    const { messages, tools } = req.body;

    if (PROVIDER === 'gemini') {
      return await handleGemini(messages, tools, res);
    } else {
      return await handleOpenAI(messages, tools, res);
    }
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}

// ─── Gemini ─────────────────────────────────────────────────
async function handleGemini(
  messages: { role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }[],
  tools: { type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }[],
  res: VercelResponse
) {
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  // Convert OpenAI message format → Gemini format
  const geminiContents = convertMessagesToGemini(messages);
  const geminiTools = tools?.length > 0 ? [{
    functionDeclarations: tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    })),
  }] : undefined;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: geminiContents,
        tools: geminiTools,
        systemInstruction: messages.find(m => m.role === 'system')
          ? { parts: [{ text: messages.find(m => m.role === 'system')!.content }] }
          : undefined,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    return res.status(response.status).json({ error: err });
  }

  const data = await response.json();

  // Convert Gemini response → OpenAI format (so frontend doesn't change)
  const candidate = data.candidates?.[0];
  if (!candidate) return res.status(500).json({ error: 'No response from Gemini' });

  const parts = candidate.content?.parts || [];
  const textParts = parts.filter((p: Record<string, unknown>) => p.text);
  const funcParts = parts.filter((p: Record<string, unknown>) => p.functionCall);

  const openAIFormat = {
    choices: [{
      message: {
        role: 'assistant',
        content: textParts.map((p: { text: string }) => p.text).join('\n') || null,
        tool_calls: funcParts.length > 0
          ? funcParts.map((p: { functionCall: { name: string; args: Record<string, unknown> } }, i: number) => ({
              id: `call_${Date.now()}_${i}`,
              type: 'function',
              function: {
                name: p.functionCall.name,
                arguments: JSON.stringify(p.functionCall.args),
              },
            }))
          : undefined,
      },
    }],
  };

  return res.status(200).json(openAIFormat);
}

function convertMessagesToGemini(messages: { role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }[]) {
  const contents: { role: string; parts: Record<string, unknown>[] }[] = [];

  // Build a map of tool_call_id → function name from assistant messages
  const toolCallNames: Record<string, string> = {};
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls as { id: string; function: { name: string; arguments: string } }[]) {
        toolCallNames[tc.id] = tc.function.name;
      }
    }
  }

  for (const msg of messages) {
    if (msg.role === 'system') continue; // Handled via systemInstruction

    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    } else if (msg.role === 'assistant') {
      const parts: Record<string, unknown>[] = [];
      if (msg.content) parts.push({ text: msg.content });
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls as { function: { name: string; arguments: string } }[]) {
          parts.push({
            functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments) },
          });
        }
      }
      if (parts.length > 0) contents.push({ role: 'model', parts });
    } else if (msg.role === 'tool') {
      // Use the actual function name from the corresponding tool_call_id
      const funcName = msg.tool_call_id ? toolCallNames[msg.tool_call_id] : undefined;
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: funcName || 'tool_result', response: { result: msg.content } } }],
      });
    }
  }

  return contents;
}

// ─── OpenAI (fallback) ──────────────────────────────────────
async function handleOpenAI(
  messages: { role: string; content: string }[],
  tools: unknown[],
  res: VercelResponse
) {
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      tools: tools?.length > 0 ? tools : undefined,
      tool_choice: tools?.length > 0 ? 'auto' : undefined,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return res.status(response.status).json({ error: err });
  }

  const data = await response.json();
  return res.status(200).json(data);
}
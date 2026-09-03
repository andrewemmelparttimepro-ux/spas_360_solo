import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { dealershipClock } from '../api/_lib/dealership-clock.ts';

const repoFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe('Ari intelligence route', () => {
  it('runs on xAI Grok only, defaulting to grok-4.6', async () => {
    const chat = await readFile(repoFile('api/chat.ts'), 'utf8');
    assert.match(chat, /https:\/\/api\.x\.ai\/v1/);
    assert.match(chat, /DEFAULT_XAI_MODEL = 'grok-4\.6'/);
    assert.match(chat, /process\.env\.XAI_API_KEY/);
    assert.match(chat, /process\.env\.XAI_MODEL/);
    assert.match(chat, /dealershipClock\(\)/);

    // No second road: every other provider, and the env-based selector, are gone.
    for (const forbidden of [
      /\bAI_PROVIDER\b/,
      /api\.anthropic\.com/,
      /generativelanguage\.googleapis\.com/,
      /api\.openai\.com/,
      /api\.z\.ai/,
      /api\.meta\.ai/,
      /THRAWN_GATEWAY/,
      /handleClaude/,
      /handleGemini/,
      /handleOpenAI\b/,
      /ANTHROPIC_API_KEY/,
      /GEMINI_API_KEY/,
      /OPENAI_API_KEY/,
      /GLM_API_KEY/,
      /\bMETA_MODEL\b/,
    ]) {
      assert.doesNotMatch(chat, forbidden, `api/chat.ts still references ${forbidden}`);
    }
  });

  it('keeps the kill switch, rails injection, and the 55s upstream ceiling', async () => {
    const chat = await readFile(repoFile('api/chat.ts'), 'utf8');
    assert.match(chat, /agentConfig\.enabled === false/);
    assert.match(chat, /AGENT_PAUSED_MESSAGE/);
    assert.match(chat, /m\.role !== 'system'/);
    assert.match(chat, /UPSTREAM_TIMEOUT_MS = 55_000/);
  });
});

describe('dealershipClock', () => {
  it('states the dealership local date and time in America/Chicago', () => {
    // 2026-09-03T15:42:00Z is 10:42 AM CDT
    const line = dealershipClock(new Date('2026-09-03T15:42:00Z'));
    assert.equal(
      line,
      'Current dealership date and time: Thursday, September 3, 2026, 10:42 AM (America/Chicago).',
    );
  });

  it('handles winter time and afternoon hours', () => {
    // 2026-01-15T21:05:00Z is 3:05 PM CST
    assert.equal(
      dealershipClock(new Date('2026-01-15T21:05:00Z')),
      'Current dealership date and time: Thursday, January 15, 2026, 3:05 PM (America/Chicago).',
    );
  });
});

# SPAS 360 — AI Agent Handoff Brief

> For the Google AI Studio agent to review before working on this codebase.

---

## What This Project Is

SPAS 360 is a full-stack CRM, service ops, and inventory management platform for a hot tub dealership with two locations (Minot and Bismarck, North Dakota). It's built on:

- **Frontend**: React + TypeScript + Vite (deployed on Vercel)
- **Backend**: Supabase (PostgreSQL + Auth + RLS + Realtime)
- **Styling**: Tailwind-style utility classes via Tailwind CSS
- **AI Agent**: Tier 3 tool-calling sales assistant (this is what you'll be working on)

## The AI Agent Architecture

### What's Built
A floating chat widget (`src/components/ChatWidget.tsx`) that persists in the bottom-right corner across all pages. It has two tabs:

1. **AI Assistant** — A tool-calling agent that helps salespeople sell
2. **Team Chat** — Employee-to-employee messaging

### How It Works
```
User types message → useAgentChat hook → POST /api/chat (Vercel serverless)
→ Gemini API with function declarations → Response with tool_calls
→ Frontend executes tools against Supabase → Second LLM call with results
→ Final response displayed
```

### Key Files
| File | Purpose |
|------|---------|
| `api/chat.ts` | Vercel serverless function — proxies Gemini/OpenAI calls, converts formats |
| `src/agent/system-prompt.ts` | Sales playbook, personality, rules, guardrails |
| `src/agent/tools.ts` | 9 tool definitions that query/mutate Supabase |
| `src/hooks/useAgentChat.ts` | Conversation state, thread management, tool execution loop |
| `src/components/ChatWidget.tsx` | Floating chat UI with tabs, history, quick-starts |

### Available Tools
| Tool | What It Does |
|------|-------------|
| `search_contacts` | Find customers by name/phone/email |
| `create_contact` | Add a new lead |
| `get_contact_details` | Full customer profile with deals, jobs, notes |
| `search_inventory` | Look up products by name/brand/SKU |
| `create_note` | Log a note on a contact/deal/job |
| `create_task` | Schedule a follow-up or reminder |
| `get_pipeline_summary` | Pipeline stats by stage |
| `get_todays_jobs` | Today's service schedule |
| `draft_followup_message` | Generate a personalized follow-up SMS |

### Database
- **Supabase Project**: `ldhzkdqznccfgpdvqyfk` (US East)
- **Agent Tables**: `agent_threads`, `agent_messages` (with RLS)
- **Main Tables**: 18 tables total — see `supabase/schema.sql`
- **Auth**: Supabase Auth with profile auto-creation trigger

## What You're Being Asked To Do

### Primary Goal
Make the AI Sales Assistant fully functional and demo-ready. Specifically:

1. **Verify the Gemini integration works end-to-end** — user sends message → tools execute → agent responds with context
2. **Test and refine tool calling** — make sure the agent correctly identifies when to use tools and chains them properly
3. **Polish the system prompt** — the sales playbook in `src/agent/system-prompt.ts` should produce natural, helpful responses that a hot tub salesperson would actually want to use
4. **Handle edge cases** — what happens when no contacts are found, when the user is vague, when tools return errors
5. **Demo polish** — make sure the chat widget looks and feels premium for a client demo

### Secondary Goals (if time permits)
- Add more tools (e.g., `create_deal`, `update_deal_stage`, `get_overdue_tasks`)
- Implement the team chat with real-time message sync between employees
- Add typing indicators, read receipts, or message timestamps
- Voice input support (Whisper/Deepgram)

## Environment Variables (Vercel)
```
VITE_SUPABASE_URL=https://ldhzkdqznccfgpdvqyfk.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG... (set)
GEMINI_API_KEY=AIzaSy... (set)
AI_PROVIDER=gemini (default in code)
```

## Brand Guidelines
- **Primary Blue**: `sky-400` / `sky-500` (#38BDF8 / #0EA5E9)
- **Dark backgrounds**: `slate-900` / `slate-950`
- **Logo**: `/public/logo.png` — water drop with five interlocking circles
- **Tone**: Professional but warm, North Dakota friendly

## Git Info
- **Repo**: `https://github.com/andrewemmelparttimepro-ux/spas_360_solo`
- **Branch**: `main`
- **Live URL**: `https://spas360solo.vercel.app`
- **Last commit**: AI Sales Assistant v0 with Gemini + tool calling

## Important Constraints
- All Supabase queries run with the user's auth token — RLS is enforced
- The agent should NEVER expose API keys or internal architecture to the user
- Confirmation is required before creating/modifying records (the system prompt says this)
- The agent is for EMPLOYEES, not customers — it should be a productivity tool, not a chatbot

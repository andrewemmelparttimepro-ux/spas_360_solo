# SPAS 360 — Agent Handoff

> Read this first. Last updated **2026-07-05** (commit `3f26b39`). This file supersedes the old
> April "Google AI Studio" handoff (deleted), which described the Gemini-era build pointed at a
> wrong database — trust nothing from it.

---

## 1. What this is

**SPAS 360** is a full-stack dealership operating system built for **Magic City Home Leisure**
(magiccityhomeleisure.com, 1910 S Broadway, Minot ND — Sundance / Master Spas / Finnleo / Covana dealer,
two stores: **Minot** and **Bismarck**). It replaces their stack of Jobber (service scheduling),
HubSpot (CRM), Podium (business texting), and an Excel inventory workbook — everything except
QuickBooks, which stays as the accounting source (sync is a future milestone).

- **Client contacts:** Brandon (GM — his voice-memo requirements transcript lives at
  `~/Documents/Claude/Projects/spas 360/Voice Memo Transcript - US-83 S.md`) and Matt (owner).
- **Builder:** Andrew Emmel (NDAI). **This build is stealth** — only Andrew + the AI agent know it exists.
  Do not reference it in client-visible channels.
- **Product thesis:** two sides — **Sales** and **Service** — with entirely different workflows but one
  shared dataset. The top nav is literally organized this way.

## 2. Where everything lives

| Thing | Location |
|---|---|
| Code (local) | `~/Desktop/antigravity/spas_360_solo` |
| GitHub | `https://github.com/andrewemmelparttimepro-ux/spas_360_solo` (branch `main`) |
| Live prod | `https://spas360solo.vercel.app` — **push to `main` auto-deploys production** |
| Vercel | project `spas_360_solo`, team `nd-ai` (`team_3svaJtFI5ngHwbDDVoL07grT`) |
| Supabase | **dedicated** project `spas-360`, ref **`kxyqgkimcdxvfkceoixs`**, us-east-1 ($10/mo) |
| Storage | Supabase bucket `job-photos` (public read, authenticated write) |
| Twilio | number **+1 701 929 9194** (trial account — see §8 blocked items) |
| Dev server | preview name `spas360`, port 3009, defined in `~/Desktop/.claude/launch.json` |
| Accounts | Andrew (andrew@ndai.pro) + Brandon (brandon_solem@hotmail.com) — both **owner_manager**, verified in DB |

**⚠ History lesson:** prod was once wrongly pointed at Supabase ref `ldhzkdqznccfgpdvqyfk` — that is the
**Hit Zero / Cheerful cheer-gym database** (it shares table *names* like profiles/messages/notifications
with different schemas). Never point SPAS at it. The dedicated project above is the only correct backend.

## 3. Stack & architecture

React 19 + TypeScript + Vite 6 + Tailwind v4 (CSS `@theme` tokens) + React Router 7 + Recharts +
`@hello-pangea/dnd` · Supabase (Postgres 17, Auth, RLS, Realtime, Storage) · Vercel serverless functions.

```
api/
  chat.ts          AI assistant proxy — provider-agnostic (gemini, glm, anthropic, openai handlers
                   built in; frontend always speaks OpenAI message shape). Switch via AI_PROVIDER env.
                   RAILS ARE ENFORCED HERE: system prompt injected server-side; any client-sent
                   system message is discarded — guardrails can't be stripped from the browser.
                   ESM runtime: api-relative imports need explicit .js extensions.
  _lib/rails.ts    THE TRANSFERABLE GUARDRAIL MODULE: buildRails(RailsConfig) → scope-lock preamble
                   (in-scope topics, friendly one-line redirect, no roleplay/identity swaps, no
                   internals disclosure, tool-grounding with [CONFIRM] placeholders). Dependency-
                   free — copy into any NDAI build with that app's config. SPAS360_RAILS lives here.
  _lib/system-prompt.ts  The soul: ND-friendly persona, full rec-retail floor knowledge, document
                   blueprints (1-Page Proposal, Special Offer, Trade-In, Follow-Up, Objection
                   Response Card), six-pattern objection playbook, commission-integrity rule.
  sms.ts           Outbound SMS: verifies caller's Supabase JWT, sends via Twilio REST from TWILIO_FROM.
  sms-inbound.ts   Twilio webhook: HMAC signature check → match contact by phone (or create Unknown
                   Lead) → file into sms thread → notify assigned + managers. Service-role writes.
src/
  index.css        DESIGN SYSTEM. Tailwind @theme tokens: `ink-*` dark neutrals (#0a0a0f page,
                   #111116 card, #2A2A32 border) + `brand-*` = Magic City Home Leisure blue
                   (#1075b8 / light #34a0ff / navy #002e56). Inter + JetBrains Mono. Modeled on
                   SandPro OMP's design language; accent swapped from SandPro orange to MCHL blue.
  App.tsx          Routes + RoleLanding (tech→/service, salesperson→/deals, managers→/dashboard).
  contexts/AuthContext.tsx   Auth + profile + locations + activeLocationId (global store filter).
                   Contains the DEV-ONLY preview harness (see §6).
  contexts/CustomerDragContext.tsx   CROSS-PAGE CUSTOMER DRAG. Pointer-based (not HTML5 DnD, so it
                   survives route changes and can't fight the kanban's dnd). Grab a customer card →
                   hover the Deals/Schedule pill (they glow violet) → 400ms dwell spring-loads the
                   page mac-dock-style → drop on a deal card (attach w/ confirm) or a stage column
                   (QuickDealModal). Drop straight ON a pill = quick-create intent (Deals →
                   QuickDealModal via location.state.customerDrop; Schedule → New Job modal
                   prefilled via {openNew, contactId}). Targets are declared with data-cdrop
                   attributes; pages register drop resolution via setDropHandler. Touch is
                   deliberately excluded (phones scroll) — cards carry explicit buttons instead.
  components/
    layout/Header.tsx     Topbar: brand, grouped nav pills (⌜CRM: Customers⌟ ⌜SALES: Deals·Inventory⌟
                          ⌜SERVICE: Schedule⌟), ⌘K search trigger, location pill, notification bell,
                          user menu. NAV_SECTIONS + NAV_TONE exported — single source of truth for
                          nav; the three pillars wear their colors (Customers = violet, Sales = brand
                          blue, Service = emerald), neutral items stay ink and go icon-only below xl
                          so all three groups always fit. Deals/Schedule pills are customer-drag drop
                          targets. Drawer mirrors the tones.
    layout/Sidebar.tsx    Mobile-only drawer (mirrors NAV_SECTIONS + Contacts + Settings).
    layout/AdminRail.tsx  Right-docked contacts panel, collapsed by default (localStorage
                          `spas360.adminRail`), hidden for technicians.
    NewCustomerWizard.tsx Guided chip-based flow: who (with phone dupe-detection) → source →
                          interest → priority (High=close in a week / Med=2–4wk / Low=nurture) →
                          MANDATORY follow-up. Creates contact + deal + task. Endowed-progress bar
                          opens at an honest 20% (follow-up pre-filled).
    SalesBoard.tsx        LIVE scoreboard above the kanban (open pipeline w/ idle-$ loss framing,
                          won this month, closing this week, hot leads). Mono numerals, pulsing dot.
    SearchPalette.tsx     ⌘K/Ctrl+K global search: contacts, deals, jobs, inventory.
    QuickCreate.tsx       Dashboard "+ New" chooser → wizard in place, or /service with the New
                          Job modal auto-opened (navigation state flags, consumed on arrival).
    InventoryEditor.tsx   Slide-over unit editor (create/edit): brand/category/store/status chips,
                          smart defaults, live margin readout, Mark Sold w/ customer link, two-step
                          manager-only delete. Settings has Team & Permissions (owner_manager only):
                          role + home-store per teammate — THIS is how new signups (e.g. Brandon)
                          get promoted from the default Salesperson role.
    StoreSwitcher.tsx     All/Minot/Bismarck segmented control on Inventory — drives GLOBAL
                          activeLocationId (header pill, Deals, Schedule follow).
    ChatWidget.tsx        Floating AI sales assistant + team chat.
    ui/WidgetBoundary.tsx Error boundary — non-critical widgets can never black-screen the app.
  pages/
    Dashboard.tsx    Manager KPIs, real closed-won revenue chart, Requires Attention feed
                     (overdue tasks + stagnant parts ≥14d with per-job links).
    Deals.tsx        Kanban (11 Brandon stages) + SalesBoard + wizard. Cards: priority edge,
                     interest tags, "No follow-up" red flag, "going cold" idle flag, IKEA
                     highlight pulse on newly created cards. DRAGGING TO CLOSED-WON fires the
                     sales→service bridge (see usePipeline.handleDealWon).
    Service.tsx      Jobber-familiar calendar: Brandon's color language (red=delivery,
                     orange=warranty, BLACK=parts not received, blue=service, green=ready,
                     strikethrough=done), drag-to-schedule (queue→day, day→day, chip→queue
                     unschedules), calendar-left/queue-right, "N visits" counts, legend chips =
                     working status filter. New Job modal: smart store default + auto-title
                     "{Last} – {Type}" that backs off when hand-edited.
    JobDetail.tsx    Tech field capture: time clock (Start/Stop, live ticker, time_entries) +
                     camera-first photos (rear camera, ≤1600px JPEG re-encode, type tags:
                     Proof of Delivery / Damage / Serial Number / Before / After).
    Inventory.tsx    Real MCHL inventory, StoreSwitcher, editable cells, struck-through MSRP
                     anchoring beside discounted sale prices.
    Communication.tsx  Team chat + customer SMS threads (real Twilio sends — see §8).
    Reports.tsx      Revenue by location, pipeline by stage, jobs by status, inventory aging.
    Customers.tsx    THE CRM PILLAR (route /customers; /contacts redirects). Card-first: every
                     customer is a card — lifecycle badge (Lead/Prospect/Customer/Past), tap-to-call,
                     open-pipeline $ + lifetime $ (mono), equipment owned, jobs in service,
                     commission owner, No-follow-up / going-quiet flags. Lifecycle filter chips
                     w/ counts, search, sort (recent/value/name). Cards drag to Deals/Schedule
                     (CustomerDragContext); per-card "New Deal" button is the touch path.
                     QuickDealModal.tsx = fast deal for a KNOWN customer (interest chips → wizard's
                     auto-title ritual, commission credited to assigned salesperson, MANDATORY
                     follow-up task) — used by card button, stage drops, pill drops, ContactDetail.
    ContactDetail / DealDetail / InventoryDetail / Settings / Login. ContactDetail now leads with
                     the 360° relationship strip (deals w/ stage, service jobs, equipment owned)
                     + New Deal button. Old table Contacts.tsx is deleted.
  hooks/           One hook per domain (usePipeline, useServiceJobs, useInventory, useContacts,
                   useCustomerCards (per-customer aggregates powering the card grid),
                   useConversations, useTeamChat, useAgentChat, useNotifications, useDashboard,
                   useReports, useTimeClock, useJobPhotos). All Supabase + realtime.
  agent/           AI assistant tool definitions (15: search/create contacts & deals,
                   list_open_deals, get_deal_details, tasks, notes, pipeline summary,
                   schedule_job, etc.). Prompt/rails moved to api/_lib/ (server-side).
supabase/          schema.sql (18 tables + RLS + triggers + seed) and applied migrations:
                   migration_agent.sql, migration_notifications.sql, migration_field_capture.sql,
                   migration_sms_realtime.sql. seed_demo.sql = staged demo data (NOT run).
```

## 4. Database (Supabase `kxyqgkimcdxvfkceoixs`)

- **21 public tables**: organizations, locations, profiles, contacts, properties, pipeline_stages,
  deals, jobs, job_assignments, parts, inventory_items, communication_threads, messages, tasks, notes,
  time_entries, notifications, audit_log, agent_threads, agent_messages, **job_photos**.
- **Fixed seed UUIDs** (hardcoded in seeds/imports): org `…0001`, Minot `…0010`, Bismarck `…0011`,
  stages `…0100`–`…010a` (11 stages, "No Contact Made" → "Closed - Won" → "Closed - Lost").
- **RLS everywhere**, org-scoped via `auth_org()` / `auth_role()` / `is_manager()` helper functions.
  First signup becomes owner_manager (`handle_new_user` trigger); later signups default salesperson.
- **Realtime publication** includes: contacts, agent_threads, agent_messages, notifications,
  communication_threads, messages.
- **Real inventory is loaded**: all 110 items from Brandon's "Tub and Cover Inventory" Excel
  (Minot + Used tabs) — serials as SKUs, `MC-####` generated where absent, sizes/covers/customer
  names/order refs preserved in `notes`, "Need To Order" rows = On Order + `NEEDS ORDERING` note.

## 5. The Sales → Service bridge (core business logic)

`usePipeline.handleDealWon` (fires when a deal is dragged into Closed-Won): creates a Delivery job
`"{deal title} – Delivery"` in the unscheduled queue (dupe-guarded per contact; location falls back
deal → user → org's first), promotes the contact to Customer, notifies service/owner managers, toasts
the salesperson. This is Brandon's "Wyant – Sundance – delivery" ritual, automated.

## 6. Dev workflow

- `npm run build` and `npm run lint` (= `tsc --noEmit`) — **both must stay green; they are the quality gate.**
- **UI preview harness:** `VITE_UI_PREVIEW=1` (already set in the `spas360` launch.json entry) stubs a
  fake session/profile in AuthContext so page chrome renders without signing in. `import.meta.env.DEV`-
  guarded — verified absent from prod bundles. RLS still blocks data reads, so pages show empty states.
- **Ship flow:** commit to `main` → push → Vercel auto-deploys prod (~20s). Verify with
  `vercel ls` + curl the live bundle for feature markers (content-hashed chunk names prove fresh code).
- **Known gotchas:**
  - `node_modules` has corrupted **three times** (dangling symlinks, then Finder-style "`name 2`"
    duplicate dirs in `@types` breaking tsc) — if `vite`/`tsc` breaks weirdly:
    `rm -rf node_modules package-lock.json && npm install`.
  - Supabase-js **reuses realtime channels by topic**; a second `.on()` after `subscribe()` THROWS and
    (without a boundary) black-screens the app. Every hook now uses per-instance channel suffixes —
    keep doing that for any new subscription.
  - A repo-wide class sweep once missed `.ts` files (only globbed `.tsx`) — statusColors shipped
    light-theme classes. Check both extensions when sweeping.
  - Vercel CLI cannot set Preview-scope env vars non-interactively; use the dashboard.

## 7. Vercel environment (Production)

Set: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (dedicated project), `AI_PROVIDER=glm`,
`GLM_API_KEY`, `GLM_MODEL=glm-5.2`, and `GLM_BASE_URL=https://api.z.ai/api/paas/v4`.
Documented in `.env.example`. Gemini, Anthropic, and OpenAI remain available fallback providers
through `AI_PROVIDER`.

## 8. Blocked on Andrew (in priority order)

1. **Texting activation** — add to Vercel prod env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_FROM=+17019299194`, `SUPABASE_SERVICE_ROLE_KEY`; redeploy; point the Twilio number's
   "A message comes in" webhook at `https://spas360solo.vercel.app/api/sms-inbound` (POST).
   Trial = verified numbers only; **A2P 10DLC registration + account upgrade** required before texting
   real customers (register MCHL as the brand).
2. **Bismarck inventory tab** — not yet imported (screenshots only covered Minot + Used).
3. **Brand backfill** — Oslo/Tokyo/Maximus + Hekla/Trend/Pro 6 items imported with brand NULL.
4. **Lock down open signup — NOW URGENT.** Brandon is in and real data is loaded; the public
   sign-up on the Login page auto-joins new users to the org as Salesperson (they'd see org data).
   Disable public signups (Supabase Auth settings or invite-only flow) before the URL spreads.
   (`migration_inventory_delete.sql` is now APPLIED; Brandon's owner_manager role verified in DB.)

## 9. Next milestones (agreed roadmap)

QuickBooks sync (customers/estimates one-way first) → PWA install for techs (manifest + SW) →
server-side reminders (pg_cron writes notifications for stagnant parts/overdue tasks) → role
permission enforcement beyond landing pages → run `seed_demo.sql` only if a demo dataset is wanted
(real inventory already loaded — may be unnecessary).

## 10. The SPAS 360 Bible

`docs/SPAS360-Bible.pdf` is the single source of truth for operators AND builders — usage guide
for the crew plus §17 "The Style Guide — Design Law" (tokens, component language, UX doctrine)
for anyone building on the app. Regenerate with `python3 scripts/build-bible.py` whenever
features or design law change materially; bump the version string; re-commit both. This handoff
stays the deep engineering companion the Bible points to.

## 11. Working conventions (hold these)

- **Reliability first.** No decorative dead controls, no fake data, fail loudly. If a chart has no
  data, show an empty state — never random numbers.
- **Jobber familiarity is a feature** — the crew is transitioning from Jobber/HubSpot/Podium/Excel;
  keep Brandon's color language and drag-to-schedule muscle memory intact.
- Design tokens only (`ink-*`, `brand-*`) — never raw Tailwind palette colors for surfaces/accents.
- Every page must work at 375px; techs live on phones.
- UX psychology principles applied deliberately (smart defaults, honest endowed progress, IKEA
  highlight, loss framing, MSRP anchoring) — extend them, don't fake them (no dishonest progress,
  no defaulting the wizard's lead-source chip: source data quality > one saved tap).

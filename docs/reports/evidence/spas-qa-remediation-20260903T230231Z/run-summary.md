# SPAS 360 QA remediation — 2026-09-03 evening

## Intake

- Gmail report: `SPAS 360 QA — evening Wed 2 — 54 findings (1/9/31)`
- Sender: `andrew@ndai.pro`
- Received: 2026-09-02 17:24 America/Chicago
- Gmail message/thread key: `FMfcgzQhWLJGxRQmHsrjkshXVVTlxsWR`
- Report window: Wednesday hourly checks from about 09:38 through 16:43 America/Chicago.
- The prior automation ledger did not contain this message, so it was treated as the newest unprocessed report.

## Authority and release identity

- Production: `https://spas360solo.vercel.app`
- Supabase project: `kxyqgkimcdxvfkceoixs` (`spas-360`, `ACTIVE_HEALTHY`, `us-east-1`)
- Starting `main` / `origin/main`: `47f17e7ac0287c06006b7ee9b9c9e8cdbe095f1e`
- Released code commit: `2d0195c6813350535a3bc800b5e981285c1008e3`
- Production deployment: `dpl_8u1Ba7zQwfXRmd37G8ByFLZzKD6L` (`READY`)
- Production asset after release: `assets/index-Cvx437px.js`

## Overlap handling

A fresh Fix-It release owner appeared during intake at `/Users/andrewemmel/.codex/automations/spas-360-fix-it-feed-agent-closure/run.lock.d/owner.json`. Its keeper PID later disappeared, but an active linked-Supabase Fix-It query was still observed, so the run remained read-only and did not claim or replace that owner. After both the lock and related process cleared, `origin/main` was refreshed and matched local `HEAD` before the bounded release. The other automation's lock, state, browser resources, and Fix-It records were never touched.

## Production findings

### Reproduced

- `P360-09`, `P360-18`, `P360-02-03`: Inventory and Reports disagree. Inventory showed 99 In Stock / 35 Sold / 33 On Order with 169 All, while Reports showed 101 In Stock / 35 Sold / 33 On Order and 12 of 101 in-stock units valued.
- `P360-20260902-04`, `P360-02-04`, `P360-44`: visible Inventory rows all displayed 15 days despite different products, statuses, and received-date circumstances. The UI calculation is dealership-local and prefers `date_received`; the uniform imported dates require data-source review rather than invented replacement dates.
- `P360-01`, `P360-31`: the Dashboard's value was an overdue ordered-parts count, not inventory units on order. It displayed 0 while Inventory contained 33 On Order units.
- `P360-35`: the Reports period selector scopes closed revenue only; pipeline, jobs, and inventory are current totals. The previous UI did not disclose that scope.
- `P360-08`, `P360-16`: six open deals still have no expected close date. Reports now surfaces this honestly; historical dates were not guessed or backfilled.
- `P360-21`, `P360-23`: Faith Anderson's owned Nova 7 still shows the inventory status `In Stock` alongside an open In Discussion deal. This remains a semantic/business-state issue.

### Not reproduced in the bounded current pass

- `P360-27`, `P360-38`: signed-in Dashboard → Inventory → Reports → Customers → Faith → Deals navigation completed without the error boundary. The report also recorded clean Wednesday runs, so this remains an intermittent monitor item.
- `P360-20260902-10`, `P360-20260902-07`: Faith's detail, deal, equipment, and contacts hydrated correctly on direct navigation and reload; no false zero/empty state was observed.
- `P360-13`: the current Deals board reported 0 overdue sales tasks, and Closed-Won deals were not present in the active-deal metrics. The older closed-won-overdue symptom was not reproduced.
- Current report snapshots differed from the email: Dashboard revenue was $14,000, unscheduled jobs were 6, and the admin feed count was 88.

### Still queued / requires a separate decision or deeper lane

- Reconcile `inventory_items.status`, stock availability rules, removed rows, and deal assignments so Inventory and Reports use one documented count definition.
- Determine the authoritative received dates for the uniform-age inventory rows; no dates were fabricated.
- Decide how owned equipment should describe inventory availability after attachment to a customer/open deal.
- Supply or approve historical expected-close dates for six open deals; no destructive or synthetic data cleanup was performed.
- Continue the remaining report clusters (Tioga geography, stage-history age, Schedule/store counts, Documents search stability, Citadel freshness/classification, media/PDF recovery, and remaining responsive/keyboard polish) in future bounded runs.

## Shipped remediation

- Dashboard `Parts On Order` was renamed `Overdue Parts` and now links to the Parts/Knowledge destination that owns the underlying metric.
- Reports now labels the selector `Closed revenue period` and visibly states that only closed revenue is period-filtered; pipeline, jobs, and inventory are current totals.
- Quick Actions now describes Customers as `Customer directory`, matching the list-first interface.

No Supabase records, schemas, storage objects, Gmail labels, Fix-It posts, Fix-It comments, notifications, or Fix-It statuses were created or changed by this remediation.

## Verification

- `npm run lint` — passed.
- `npm run build` — passed.
- `node --experimental-strip-types --test tests/dashboardPeriods.test.ts tests/brandon-ui-spec.test.mjs` — 16/16 passed.
- Canonical Vercel deployment `dpl_8u1Ba7zQwfXRmd37G8ByFLZzKD6L` reached `READY`.
- Fresh signed-in production tab showed `OVERDUE PARTS 0` linking to `/knowledge`.
- Fresh signed-in Reports showed `Closed revenue period` and the visible period-scope explanation.
- Fresh signed-in Quick Actions showed `Go to Customers — Customer directory`.
- Agent-created Chrome tabs `672746171`, `672746172`, and `672746173` were closed; the final browser inventory contained none of them and the Codex in-app browser had zero tabs.

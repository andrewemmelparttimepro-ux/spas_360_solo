# Approved SPAS 360 remediation

Andrew approved all 29 findings on September 8, 2026 and explicitly required safe updates for active users. The original report and evidence remain in `SPAS 360 OFFICIAL/output` and `audit/full-review-2026-09-08`.

## Release rules

- Never force-refresh a working tab. Preserve previous hashed assets and backward-compatible API/database contracts.
- Prompt for updates; let staff finish edits. Never replay a write automatically after an ambiguous failure.
- Validate an old tab across a release before production promotion. Keep a tested rollback deployment.
- Make additive migrations first, then compatible application releases. Preserve existing records and unrelated worktrees.
- Every finding stays open until its behavioral acceptance is evidenced. Code or passing unit tests alone do not close it.
- Source-data reconciliation, employee permissions, workflow enrollment and physical-device proof require their respective real inputs. Do not invent data or change roles to pass tests.
- Do not create Fix-It posts or send customer/staff acceptance messages without explicit authorization.

## Ledger

F01 in progress: compatible assets, safe update notification, draft protection, old-tab test.

Safety batch implemented: 63 checksum-verified prior assets restored during each build; cache MIME validation; optional update prompt; no automatic reload; customer/deal/job session drafts; bounded profile/session load and explicit retry. Isolated browser test kept an old tab open across a server switch, traversed Customers/Deals/Service/Inventory, fetched every retained script, refused an update with a form open, and recovered a customer draft after reload. No browser page errors. All remote traffic was mocked. Service-worker cache behavior is separately exercised with five behavioral tests. Live at `dpl_7wWeRMj21jVRsV9SWZHchx4CVkft`, source `7f46fd8e7d157834bc8c2a40615730cea9592675`, promoted September 8 at approximately 15:52 UTC. A signed-in old tab crossed promotion and opened Deals and Schedule; a fresh signed-in session loaded Manager Dashboard. No new app_error_events were recorded after 15:50 UTC through the 15:55:26 UTC check. This is a bounded observation, not a guarantee of zero future errors.

F02-F29 pending. Complete register: the approved 2026-09-08 report. Each implementation batch will record source SHA, migration, tests, deployment identity, live acceptance and remaining decisions here.

## Baseline

Production deployment `dpl_487a3kRWLsJwMSduD7KZZNKdWwcV`, release `8a28434dcccab102c21f45fae2c697682f927918`, confirmed September 8. Web worktree starts from that release. Native dirty source is preserved separately before integration.

## Data and oversight batch

F02: bounded retry queue and deduplicated page events, stable session/release metadata. F05/F06: missing-amount metadata and recorded-sales labels. F08: scoped, atomic checklist generation. F14/F15: shared owner-only overview and authorized Ari oversight tool. F18/F19/F25: truthful enrollment, personal-scope and inventory-age language. F23: responsive revenue values. These are implemented; full acceptance remains open where it needs business records, devices or broader role proof.

Migrations 20260908160000 / 161000 / 162000 applied at 16:08:45 UTC after ten transactional rehearsal checks passed and rolled back. No existing business records were backfilled. Web check suite: 399 checks; one old literal-label expectation updated and its suite rerun. Typecheck and build pass. Native owner overview and server-filter work compile; installation and live acceptance pending.

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

Safety batch implemented: 63 checksum-verified prior assets restored during each build; cache MIME validation; optional update prompt; no automatic reload; customer/deal/job session drafts; bounded profile/session load and explicit retry. Isolated browser test kept an old tab open across a server switch, traversed Customers/Deals/Service/Inventory, fetched every retained script, refused an update with a form open, and recovered a customer draft after reload. No browser page errors. All remote traffic was mocked. Service-worker cache behavior is separately exercised with five behavioral tests. Live rollout still pending.

F02-F29 pending. Complete register: the approved 2026-09-08 report. Each implementation batch will record source SHA, migration, tests, deployment identity, live acceptance and remaining decisions here.

## Baseline

Production deployment `dpl_487a3kRWLsJwMSduD7KZZNKdWwcV`, release `8a28434dcccab102c21f45fae2c697682f927918`, confirmed September 8. Web worktree starts from that release. Native dirty source is preserved separately before integration.

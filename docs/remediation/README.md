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

F02-F29 tracked individually below; no blanket completion claim. Complete register: the approved 2026-09-08 report. Each implementation batch will record source SHA, migration, tests, deployment identity, live acceptance and remaining decisions here.

## Baseline

Production deployment `dpl_487a3kRWLsJwMSduD7KZZNKdWwcV`, release `8a28434dcccab102c21f45fae2c697682f927918`, confirmed September 8. Web worktree starts from that release. Native dirty source is preserved separately before integration.

## Data and oversight batch

F02: bounded retry queue and deduplicated page events, stable session/release metadata. F05/F06: missing-amount metadata and recorded-sales labels. F08: scoped, atomic checklist generation. F14/F15: shared owner-only overview and authorized Ari oversight tool. F18/F19/F25: truthful enrollment, personal-scope and inventory-age language. F23: responsive revenue values. These are implemented; full acceptance remains open where it needs business records, devices or broader role proof.

Migrations 20260908160000 / 161000 / 162000 applied at 16:08:45 UTC after ten transactional rehearsal checks passed and rolled back. No existing business records were backfilled. Web check suite: 399 checks; one old literal-label expectation updated and its suite rerun. Typecheck and build pass. Native owner overview and server-filter work compile; installation and live acceptance pending.

Oversight release `c07a4001733ddfaa20f7622f8e1db292c284199c` is live at deployment `dpl_Hq6qCgE8mYubnGY81XWbvKUqfinX`. All 113 older assets matched SHA-256 on the staged production deployment. Signed-in web overview showed 45 review items, 7/7 latest human sign-ins within 7 days, one person with registered push, and 18 unverified knowledge documents. Suggestion deep-link opened the feed. Old tab navigated Customers after promotion. At 16:17:39 UTC: two new web page events, zero app errors since 16:15 UTC. Owners Corner was initially categorized as /other; next release corrects the route map.

## Conversation and delivery batch

F16: ordinary conversations remain in Threads; requested text starts as needs_input or draft, never proof of sending. Legacy text displays as an unreviewed snapshot. F19: narration cache checks source hash and 15-minute freshness and rejects shared personal references. F20: atomic email claims, frozen payload, stable Resend key, bounded retries and read-only provider receipt checks. Keys expire after 24h per https://resend.com/docs/dashboard/emails/idempotency-keys; ambiguous automatic retries stop at 22h. Existing recipient policy is displayed and preserved. No acceptance emails were sent. F21: configuration read failures are visible and key presence is explicitly distinct from model reachability.

Migrations 20260908163000 and 164000 applied at 16:22:20 UTC after five rollback checks passed. Four new behavior tests pass; full web suite 403/403 and typecheck pass.

Native source `4836333eaaac9fc3cdec27f0c3dc74cc888145cc`, version 1.4.0 build 6, signed and installed with original bundle preserved. Five native tests pass. Live native acceptance is waiting for Andrew to handle the macOS Keychain access prompt.


## Service and staff handoff batch

Conversation release 4f72541cef1724c0e2304936061783b67c5d669f is live at dpl_D8xyHEYH8oRG5BB1L1DkA2aJRVmf. All 164 retained assets matched checksums. Provider receipt reconciliation returned HTTP 401 for all ten historical provider IDs; delivery remains unverified. Provider dashboard authentication is unavailable in the audit browser. This does not establish whether sending is affected.

Migrations 170000/171000/171500/172000 applied at 16:42:38 UTC. Equipment is recorded per customer and linked to individual jobs; collection changes use staff requests and atomic manager decisions; feedback supports owner resolution notes; service exceptions record responsible person, reason, next action and review date. Real authenticated-role rollback tests proved owner-ledger isolation, permitted staff requests, denied direct staff job changes, atomic manager review, and cross-customer equipment rejection. Activity now distinguishes authenticated and effective actors and reported client channel; historical rows remain unchanged.

F07 correction: successful historical cron runs were empty runs, not proof of recovery. An eligible overdue fixture reproduced the guard failure. The applied narrow server transition allows only escalated_at marking; row locks make notification and escalation atomic. Four rollback checks proved one eligible escalation, no duplicates, and denied staff execution. No fixture notifications were committed.

Integrated Fix-It intake and revenue changes supplied by the separately authorized Fix-It owner. Migration 173000 applied at 16:46:23 UTC: optional expected close date; retained atomic customer/deal/task behavior; explicit America/Chicago 09:00 follow-up. Authenticated salesperson rollback verified null close date and one correctly timed task. Canonical main reconciliation and deployed UI acceptance remain release gates.


## Active-tab and Customers release

Service/handoff release b45b7f1744855f0ba3de6ef481afd6050367fdff passed 411 checks and all 213 retained assets. The signed-in original 8a28434 tab remained usable across the release. The optional update UI was corrected in 03315d9 to use an inline blocked-form message rather than browser confirmation dialogs.

Customers release 7c9c7f687bf1897dcdb7a5c72fad9988fd18018e is live at dpl_FTYWjEk1Ux2hoDERfdJ5RCXcoEfo (17:26:44 UTC build). All 314 retained assets passed checksum and byte checks before promotion. Customers now renders 50 or 100 matching rows while searching the complete loaded list. Failed reads retain the last complete snapshot; background refresh no longer unmounts open intake. A real standard-wizard submission exposed 09:00 UTC instead of Central; corrected with summer/winter tests. The independent Fix-It owner is completing final signed-in acceptance and owns all its fixtures/proofs. It reported 30 focused tests passing in Pacific/Honolulu.

Native installed-app acceptance at 17:29 UTC: the owner overview loaded 45 items; selecting Matt in Activity loaded exactly 5 of 5 matching records in the 7-day view. Evidence: native-matt-activity.png/txt. Keychain access is no longer blocking this installed build. Broader native file/voice/permission/reconnect acceptance remains open.

## Interrupted command release (staged next)

F28: caller-scoped operation IDs, leases, frozen reads/model results and transactional database receipts. Web keeps one pending command per user in session storage; native keeps one per user locally; SMS derives identity from provider MessageSid and supports an explicit same-operation RETRY. Business mutations continue under the caller's existing RLS. Unsupported mutation shapes fail before writing. Read/model retries reuse saved steps; uploaded files reuse a deterministic path. No automatic repeat of business commands.

Migration 20260908180000 applied at 17:30:30 UTC after 10 authenticated-role transactional rollback checks passed: concurrent runner exclusion, lost-reply reuse, payload mismatch denial, completed-result replay, staff job denial, note/thread/message receipts, and cross-user isolation. No test tasks, messages or notifications were committed. The shared-runtime test reproduced a task committed before a lost response and proved the retry returns its original ID with one effect. SMS request identity was tested with a mocked transport, not a real text.

F29 adds account/thread sequence guards, bounded reads and stale-data warnings to Ari conversations. F21 reports caller-scoped latest/last-completed commands separately from configuration and displays native per-lane last-success times. These are not active provider probes. Web suite 418/419 initially passed; one remaining source-contract test expected exact whitespace in Customers. Its whitespace-tolerant correction passed 9/9; full final gates are retained separately. Native status/retry source passes five tests and awaits its next signed release.

## Outstanding acceptance and business decisions

F01 route/device coverage; F02 each-role navigation proof; F03 four-channel attribution; F04 empty/reconnect cases; F05 source reconciliation and future-close guard; F06 assignment history and workbook definitions; F07 missed-interval reconciliation/health alerts; F08 cross-org/concurrent checklist fixture; F09 four owner decisions; F10 collection-responsibility decision; F11 multi-equipment edit/history proof; F12 explicit work phases/dormant review; F13 service hold confirmation/dispatch review; F14 overview deep-link coverage; F15 actual owner Ari questions; F16 requested-output journeys; F17 alert delivery/seen/expiry and physical devices; F18 workflow enrollment; F19 multi-viewer scope; F20 provider authentication/delivery events; F21 injected-lane failures; F22 latest signed build and full native journeys; F23 small-screen/200-percent review; F24 real role/phone/accessibility matrix; F25 source mapping; F26 document ownership/freshness/evaluations; F27 schema typing/advisor cleanup; F28 installed-client interruption proof; F29 team/other data-hook recovery. Each remains open until its own evidence exists.


## Production rebuild incident and release correction

At 17:33:01 UTC one recorded dynamic import failed at Job Detail, source 7c9c7f6. Live inspection reproduced the cause: automatic Git deployment dpl_EPdHpdRGBx2HG22zKbc66MzYG9QD rebuilt the same SHA with JobDetail-Ch-0FbV_.js, while a previously opened manual-build tab requested JobDetail-DovqJev7.js. That exact path returned HTML. The earlier asset checks only covered the candidate, so pushing main after promotion reopened an asset gap. This was a release-process failure, not a zero-error rollout.

Correction: retain exact assets from both manual and automatic builds, disable main's automatic Git deployment with git.deploymentEnabled.main=false, and release only a frozen production candidate after checksum/behavior checks. Git source is still fast-forwarded, but must not replace the checked deployment. Preview branches retain their default behavior. Official configuration reference: https://vercel.com/docs/project-configuration/git-configuration . Verify the canonical alias remains on the checked build after the main push. Browser failures cached by the old module loader may still require the safe optional update action; drafts must remain protected.

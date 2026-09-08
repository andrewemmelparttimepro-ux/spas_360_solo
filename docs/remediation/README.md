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

## Gated production release confirmed

Live source fda23b9fc4da8b55e95582f3fef160c9e44a033b, deployment dpl_BHVGC7x6CgDw5Y3ZqY3EFsEAuFVP, built 17:42:42.193 UTC. All 414 retained assets passed before promotion. Both previously conflicting Job Detail paths now return exact JavaScript bytes. Canonical alias stayed on this deployment after the main push; main automatic deployment is disabled. Earlier b45 and 033 automatic builds were traversed separately; all of their assets were already retained. Capture now verifies immutable deployment build time as well as source SHA before using the production alias.

At 17:55:46 UTC there were zero error fingerprints with last_seen_at after 17:47 UTC. This follows the recorded 17:33 import incident and does not erase it. Live owner Ari command 56316906-cb9d-4111-b0cc-d67bc46f5f33 completed at 17:52:13 UTC with client_channel=web and zero business-write receipts. It identified missing amounts, feedback, dispatch, alert readiness and historical cron failures; browser console errors were empty. Its service-hold interpretation required the correction below.

Native 1.4.1 build7, source7091887367cdb1e7f12aaa67c47ece54b6efdcf4, is signed and installed. The prior bundle is preserved in /Applications/.SPAS360-rollback-20260908T124850-81858.app. Code-signing designated requirements match the original certificate/identifier. Nevertheless the new launch is waiting inside SecItemCopyMatching; only Andrew may approve its macOS Keychain prompt. Installation is proven; this version's hydrated UI acceptance is not yet proven.

## Sale review, appointment classification and draft scope

Migrations 20260908190000 and 20260908191000 applied at 18:06:20 UTC after 12 authenticated-role checks passed and rolled back. New closes require an amount (explicit $0 is valid) or an owner-stamped missing-amount exception. New closing credit is retained on reassignment, while old credit remains unknown. Assignment changes are append-only to clients. The reviewed close RPC includes price/exception, inventory and open-follow-up purpose in one transaction. Lead reviews record a next step or dormant reason and review date; future review dates suppress stale-lead reminders until due.

Correction to F13 and the earlier owner-overview acceptance: the only current Pending Confirm row is an internal To Do, not a customer service appointment. The owner queue now excludes To Do from appointment holds but keeps unfinished dispatch work visible. The native filter is prepared for its next release. Past timed customer appointments require a new time before confirmation; same-day all-day appointments remain valid. Tests positively distinguished a real appointment from a To Do before either was updated.

Web UI prepared: sale amount/exception and purpose choices at close; deliberate lead review and assignment history; pre-sale/post-sale/review-needed labels and filters; equipment edit/retire/restore with update-version conflict protection and retained job history. Deal background reads preserve open forms and stale data on failure. Draft hook now resets correctly when customer/account scope changes.

420 web checks pass, typecheck and build pass. Local React browser test proved customer/account draft isolation, reload recovery and continued typing with restricted storage. Mocked old-tab rollout covered 464 retained assets, refused update during intake, retained the draft after reload, and had no page errors. Retained asset manifest now includes 464 assets for the next candidate. No sale amounts, equipment facts, lead dispositions or staff permissions were invented or backfilled.

Still open beyond the matrix above: legacy @Ari note/team mention tools use a separate headless loop and need the same operation/retry treatment; current stable-operation proof covers Command web/native/SMS server paths. Physical native/SMS interruption acceptance remains unproven.

## Communication recovery prepared

Sale/equipment release 5732c8a22d61fb25ae6d1df2df570ef198fbc094 is live at dpl_RfZAQZmsa44b1wMTokPT2aXYPwTA. All 464 retained assets matched before promotion; the canonical alias remained identical after main was fast-forwarded. A fresh signed-in owner screen at 18:32 UTC showed 44 review items and the corrected internal-To-Do classification. Older audit-tab CDP actions timed out; this is a limitation of those acceptance controls, not proof of a new production navigation error.

Migration 20260908193000 applied at 18:28:39 UTC after seven authenticated-role rollback checks: team membership restriction, stable message receipt, payload mismatch denial, one saved message, one recipient notice, and participant-owned activity timestamp. No test messages or notifications were committed. The team composer retains an unconfirmed draft; retries reuse the message identity. Bounded reads preserve dated messages and expose a retry warning. Per-thread/account drafts survive reload.

Legacy note/team Ari mentions now use /api/agent/run and its transactional tool receipts. Final note/team response is saved by that same operation; clients no longer archive or insert a second result. Team source membership is checked separately; background thread text is untrusted context. An isolated browser proved same-operation recovery after a lost reply/reload, fresh identities for completed intentional repeats and account isolation. The team browser test passed draft retention, receipt reuse and stale-read warnings. Its first failure was a missing abortSignal method in the mock transport, corrected before rerunning; this was not a reproduced production defect.

Notes now retain failed drafts, use stable note IDs to reconcile ambiguous inserts, and keep the last successful note list on failed reads. Owner Today defaults to compact and offers an accessible expand control; isolated commit 75d4ed5 was shared with the active Fix-It owner, which exclusively owns the three new Brandon cards and their validation/closure. This task makes no Fix-It mutations.

Typecheck previously exhausted its default heap because allowJs included the generated retained-asset archive after a build. tsconfig now excludes generated public/dist/.vercel output and node_modules while retaining application/API/test sources. The corrected typecheck passes. The next manifest retains 515 assets; the mocked old-tab/draft gate passed all 515 with no page errors. Physical native/SMS interruption, provider receipts, knowledge verification and the outstanding acceptance matrix remain open.


## Knowledge, receipts, schema and recovery batch

Current production before this candidate: bb1584a956f3e02578f34605cd20af83a5fc836d, dpl_EhcJRKu7D1Cjs7N1vU8zJAaNNbvG, build 18:59:13.725 UTC. All 570 retained assets matched. Canonical deployment remained identical after the main push. The independent Fix-It owner completed its own four cards and signed-in desktop/mobile acceptance; its final census had seven active cards, all agent_done, and no open/in-progress cards. This task did not author or change those records.

Database migrations 195000/200000 applied at 18:54:35 UTC; 202000/203000 at 19:25:09 UTC; 204000 at 19:34:14 UTC. Retained transaction/role fixtures prove knowledge review guards, the consolidated policy scopes, push outcome parsing and expiry cleanup, caller-owned read stamps, owner-only delivery reads, email event deduplication/out-of-order handling, and scheduler failure persistence across a running retry. The latter clears only with a newer successful run. Four controlled note inserts prove server channel attribution; real owner/sales/service snapshots pass the runtime decoders. Fixtures rolled back and produced no persistent messages or notifications. Sequential manual/cron checklist reuse passed; genuinely simultaneous separate-session acceptance remains unproven.

Push receipts distinguish registration, queueing, service acceptance, partial/failed/unknown delivery and the recipient's in-app read action. They do not claim lock-screen delivery or completed work. Missing provider responses time out to unknown without automatic resend. The owner follow-up threshold filters a bounded review ledger and sends no reminders. Email has signed raw-body event ingestion, idempotent/out-of-order database records and an optional separate read credential. Provider dashboard access/signing-secret setup and actual device receipt acceptance remain open. No real email/text acceptance message was sent.

The live-schema generated client has 4,811 lines and is now used by createClient<Database>. Runtime JSON snapshots are validated. CustomerCombobox is extracted at its behavior boundary; keyboard search/selection/Escape pass. Knowledge answers withhold unverified/expired/future/overdue sources, and exact manufacturer/model/year/component matching prevents unsupported part fitment. All 18 source reviews remain unstamped; see knowledge-source-handoff.md for the concrete review list. No sale amounts, inventory costs, warranty facts, dispatch assignments or attendance policy were invented.

An auth.profile AbortError occurred once at 19:15:47 UTC on an old fda23b9 tab. It was handled by the recovery UI; a crash was not established. The new auth changes defer reads out of the SDK auth callback lock, retry transient reads once, reject stale initial-session results, and retain expired-session drafts only for the same account. Explicit sign-out clears drafts. The isolated browser confirms these behaviors with no page errors. Manual task saves retain an operation identity and original relative due time across a lost reply/reload; the mocked committed-before-reply case leaves one task. Knowledge, alert receipts, inventory and customer detail reads retain their last snapshot with a warning and bounded retry. Account/store changes clear prior scoped data.

The escalation incident review found two tasks that became overdue in the failure interval and completed without an escalation stamp. Their current completed state calls for no stale notification; see escalation-incident-review.md. Continued successful cron rows alone do not prove the earlier eligible-work defect was harmless.

Native 1.4.2 build 8 (74ddb3f) was observed hydrated at 19:50 UTC with 44 owner review items and 7/7 recent latest sign-ins. Signed 1.4.3 build 9 (4676dc6) adds a 12-point minimum for functional text, eight default owner issues with Show all, and persistent scheduler-failure warnings. Eight native checks pass. Installation and subsequent hydrated acceptance are recorded separately. Full physical phone, voice, permission, file and interrupted-native/SMS journeys remain distinct acceptance gates.


## Server packaging incident and repair

At 20:00:45 UTC, the owner-question replay on 283e994 returned HTTP 500 before the handler ran. Vercel logs identified ERR_MODULE_NOT_FOUND for src/lib/partFitment.ts imported by compiled toolFactory.js. Local TypeScript tests and the web build did not exercise that packaged server entrypoint. The shared helpers now ship as directly importable JavaScript with checked JSDoc types, so native Node tests and Vercel resolve the same file. A new candidate gate cold-starts six API entrypoints without authentication/business mutations and requires a valid 401/405 handler response. The new manifest retains all 673 assets, including the short-lived 283e994 build. This was a second observed release incident; do not describe the rollout as error-free. Resume the owner's saved operation after server acceptance rather than inventing a new command.

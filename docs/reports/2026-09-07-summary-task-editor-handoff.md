# Daily Summary task details handoff

Human request: Fix-It `cc6d28ce-eaf0-4fd4-ae91-b7e7c0ee563b`.

Must-Dos, including overdue text, open the exact current task by UUID. The dialog displays the full title, description, assignment, due time, priority, status, notes, proof requirement/photo, linked business records, dates, reminders, and retained overdue history. It uses the existing modal focus/keyboard behavior. X, Escape, backdrop, and Close use one save operation. Failed saves keep the dialog and draft, with explicit discard available; unchanged closes never call the RPC. Successful saves refresh Daily Summary. Notification links open the exact task on Dashboard, which remains reachable by technicians.

Permissions retain existing organization, ordinary task, and delegated sender/owner boundaries. A delegated assignee can complete/annotate but cannot change the definition. Completed overdue follow-ups are read-only permanent history, including for owners. Dates use the existing local datetime helper, with the browser timezone labeled. Unchanged dates retain seconds and timestamp precision.

## Database migration

`20260907163000_summary_task_editor.sql` adds only `id` to each Must-Do in the exact live `owner_morning_summary` definition. A byte comparison verified no other function-body change. The separate email summary function is untouched.

The new `update_summary_task(uuid, timestamptz, jsonb)` uses invoker rights, existing RLS/triggers, an allowed patch-field list, a row lock, and an expected updated_at check. It modifies only supported fields. A no-op returns before UPDATE, audit, and notification. Matching retries after a lost successful response also return without a second notice. A stale differing patch raises 40001. Existing delegated proof rules and immutable history remain active, with explicit RPC proof checks as well.

Every actual edit sends one assignee notice, including an assignee's own edit to match the request. The delegated reassignment trigger already sends the new assignee a notice, so this path omits its extra notice in that case. Existing completion-to-sender notices remain. Task edits and notification inserts commit or roll back together.

Rollback: revert the UI commit before removing the RPC; drop public.update_summary_task(uuid,timestamptz,jsonb), then restore owner_morning_summary from the root's exact captured pre-migration function bytes. No table/column, policy, existing trigger, or data backfill is introduced. Migration was drafted only in this lane; root owns its application.

## Verification and root acceptance

Local lint, production build, and staff regression suite passed. New behavioral tests cover precise unchanged values, current completed status, draft validation, permissions, immutable history, unchanged close, repeated close coalescing, save failure/draft retention, and successful retry. Build retains the existing large-chunk advisory.

Root should run all database mutation assertions inside one BEGIN/ROLLBACK after inspecting notification push triggers. The captured push trigger queues requests transactionally; no test should commit notifications, tasks, or queue rows.

- As owner, load the exact existing ordinary task and version; empty patch and title=current return changed=false, with unchanged task/notification counts.
- Change description: changed=true, one task_updated for the assignee; repeat identical patch with original version: changed=false and no extra notice.
- Change description again with original stale version: 40001; task and notifications unchanged.
- Invalid priority: constraint failure; no persisted edit or notice.
- As delegated recipient, title/proof_required changes deny; valid notes edit permits one assignee notice.
- Completing a proof-required task without a photo denies; completing with existing proof preserves sender notice plus one assignee notice.
- Reassignment to a noncreator produces only the existing delegated assignee notice.
- Unrelated ordinary salesperson, unauthorized delegated manager, cross-org task ID, and anonymous callers deny.
- An immutable completed-overdue follow-up remains viewable and rejects direct edits.
- A notification failure must roll back the task update.

Live signed-in rendered acceptance remains with root: overdue link, ordinary/delegated/history views, permitted edit fields, X/Escape/backdrop save, no-op close, stale/failure draft retention, summary refresh, recipient notification, and exact notification deep-link. No browser was opened or used in this lane.

browser_cleanup: {"bindings":[],"opened":0,"claimed":0,"closed":0,"finalize_result":"not_applicable_no_browser_bindings","remaining_agent_tabs":0,"remaining_agent_windows":0}

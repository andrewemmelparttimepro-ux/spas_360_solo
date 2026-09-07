import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSummaryTaskCloser, summaryTaskDraft, summaryTaskPatch, summaryTaskPermissions } from '../src/lib/summaryTaskEditor.ts';
import type { Task, Profile } from '../src/types/database.ts';

const task = {
  id: 'task-a', org_id: 'org-a', assigned_to: 'assignee', created_by: 'sender', task_type: 'Sales Follow-Up',
  title: 'Follow up on Randy Brunelle', description: 'Discuss details', due_at: '2026-09-06T10:11:12.123456Z',
  priority: 'High', status: 'Completed', assignee_notes: null, proof_required: false, updated_at: '2026-09-07T10:11:12.123456Z',
} as Task;
const viewer = (id: string, role: Profile['role'], org_id = 'org-a') => ({ id, role, org_id });

describe('Daily Summary task editor', () => {
  it('does not turn a historical completed task back into an incomplete task or truncate due seconds on opening', () => {
    assert.equal(summaryTaskDraft(task).status, 'Completed');
    assert.deepEqual(summaryTaskPatch(task, summaryTaskDraft(task)), {});
    assert.deepEqual(summaryTaskPatch(task, { ...summaryTaskDraft(task), title: 'Changed' }), { title: 'Changed' });
  });
  it('rejects an empty title or missing required due date, and permits undated delegated tasks', () => {
    assert.throws(() => summaryTaskPatch(task, { ...summaryTaskDraft(task), title: '   ' }), /title/);
    assert.throws(() => summaryTaskPatch(task, { ...summaryTaskDraft(task), due_at: '' }), /due date/);
    assert.deepEqual(summaryTaskPatch({ ...task, task_type: 'Delegated' }, { ...summaryTaskDraft(task), due_at: '' }), { due_at: null });
  });
  it('avoids no-op whitespace writes and restricts the patch to changed fields', () => {
    assert.deepEqual(summaryTaskPatch(task, { ...summaryTaskDraft(task), title: `  ${task.title}  `, description: ` ${task.description} ` }), {});
    assert.deepEqual(summaryTaskPatch(task, { ...summaryTaskDraft(task), assignee_notes: ' Called today ' }), { assignee_notes: 'Called today' });
  });
  it('retains org, technician, assignee, manager, and delegated sender permissions', () => {
    assert.equal(summaryTaskPermissions(task, viewer('assignee', 'salesperson')).definition, true);
    assert.equal(summaryTaskPermissions(task, viewer('other', 'salesperson')).definition, false);
    assert.equal(summaryTaskPermissions(task, viewer('other', 'service_manager')).definition, true);
    assert.equal(summaryTaskPermissions(task, viewer('assignee', 'technician')).definition, false);
    assert.equal(summaryTaskPermissions(task, viewer('assignee', 'owner_manager', 'org-b')).definition, false);
    const delegated = { ...task, task_type: 'Delegated' };
    assert.deepEqual(summaryTaskPermissions(delegated, viewer('assignee', 'technician')), { definition: false, completion: true, notes: true, reassign: false });
    assert.equal(summaryTaskPermissions(delegated, viewer('sender', 'salesperson')).definition, true);
    assert.equal(summaryTaskPermissions(delegated, viewer('other', 'service_manager')).definition, false);
  });
  it('preserves completed overdue follow-ups as view-only permanent history, even for owners', () => {
    assert.deepEqual(summaryTaskPermissions({ ...task, was_overdue_at_completion: true }, viewer('owner', 'owner_manager')),
      { definition: false, completion: false, notes: false, reassign: false });
  });
  it('unchanged close never calls save', async () => {
    let saves = 0; let closes = 0;
    await createSummaryTaskCloser()(task, summaryTaskDraft(task), async () => { saves++; }, () => { closes++; });
    assert.equal(saves, 0); assert.equal(closes, 1);
  });
  it('waits for successful save and coalesces repeated close gestures', async () => {
    let saves = 0; let closes = 0; let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const closer = createSummaryTaskCloser();
    const draft = { ...summaryTaskDraft(task), title: 'Updated' };
    const save = async () => { saves++; await gate; };
    const close = () => { closes++; };
    const first = closer(task, draft, save, close);
    const second = closer(task, draft, save, close);
    assert.equal(first, second);
    await Promise.resolve();
    assert.equal(saves, 1); assert.equal(closes, 0);
    finish(); await first;
    assert.equal(closes, 1);
  });
  it('failed save preserves the draft and editor; a subsequent close can retry', async () => {
    let closes = 0; const draft = { ...summaryTaskDraft(task), title: 'My unsaved work' };
    const closer = createSummaryTaskCloser();
    await assert.rejects(closer(task, draft, async () => { throw new Error('Conflict'); }, () => { closes++; }), /Conflict/);
    assert.equal(closes, 0); assert.equal(draft.title, 'My unsaved work');
    await closer(task, draft, async patch => { assert.equal(patch.title, 'My unsaved work'); }, () => { closes++; });
    assert.equal(closes, 1);
  });
});

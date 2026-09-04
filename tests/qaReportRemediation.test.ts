import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { filterKnowledgeDocuments } from '../src/lib/knowledgeDocuments.ts';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('empty-query library filters mixed types without changing rows or source order', () => {
  const rows = [{ id: 1, doc_type: 'owner_manual' }, { id: 2, doc_type: 'warranty' }, { id: 3, doc_type: 'warranty' }];
  const before = JSON.stringify(rows);
  assert.deepEqual(filterKnowledgeDocuments(rows, 'warranty'), [rows[1], rows[2]]);
  assert.deepEqual(filterKnowledgeDocuments(rows, 'all'), rows);
  assert.deepEqual(filterKnowledgeDocuments(rows, 'technical_bulletin'), []);
  assert.equal(JSON.stringify(rows), before);
});

test('library rendering and count both consume the filtered documents', () => {
  const s = source('src/pages/Knowledge.tsx');
  assert.match(s, /filterKnowledgeDocuments\(documents, type\)/);
  assert.match(s, /for \(const document of visibleDocuments\)/);
  assert.match(s, /\{visibleDocuments.length\} active source/);
  assert.match(s, /aria-label="Document type"/);
});

function modalHarness(active = true) {
  const listeners = new Map<string, Function>();
  const effects: Function[] = [];
  let focused: any;
  const opener = { focus: () => { focused = opener; } };
  const first = { hasAttribute: () => false, offsetParent: {}, focus: () => { focused = first; } };
  const last = { hasAttribute: () => false, offsetParent: {}, focus: () => { focused = last; } };
  const node = { querySelectorAll: () => [first, last], contains: (el: unknown) => el === first || el === last };
  const doc = {
    get activeElement() { return focused; },
    addEventListener: (key: string, fn: Function) => listeners.set(key, fn),
    removeEventListener: (key: string) => listeners.delete(key),
  };
  focused = opener;
  const exports: any = {};
  const js = ts.transpileModule(source('src/hooks/useModal.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  let refs = 0;
  vm.runInNewContext(js, { exports, document: doc, require: () => ({
    useRef: (value: unknown) => ({ current: refs++ === 0 ? node : value }),
    useEffect: (fn: Function) => effects.push(fn),
  }) });
  let closes = 0;
  exports.useModal(() => { closes++; }, active);
  const cleanup = effects[0]();
  return { first, last, opener, focused: () => focused, closes: () => closes, listeners, cleanup,
    press(key: string, shiftKey = false) {
      let prevented = false;
      listeners.get('keydown')?.({ key, shiftKey, stopPropagation() {}, preventDefault() { prevented = true; } });
      return prevented;
    },
  };
}

test('Quick Actions uses the shared modal focus and dismissal contract', () => {
  const s = source('src/components/SearchPalette.tsx');
  assert.match(s, /useModal\(onClose\)/);
  assert.match(s, /ref=\{dialogRef\} \{\.\.\.dialogProps\}/);
  assert.match(s, /if \(e.target !== inputRef.current\) return/);
});

test('Shift-Tab stays inside the palette and Escape returns focus to its opener', () => {
  const h = modalHarness();
  assert.equal(h.focused(), h.first);
  assert.equal(h.press('Tab', true), true);
  assert.equal(h.focused(), h.last);
  assert.equal(h.press('Tab'), true);
  assert.equal(h.focused(), h.first);
  h.press('Escape');
  assert.equal(h.closes(), 1);
  h.cleanup();
  assert.equal(h.focused(), h.opener);
  assert.equal(h.listeners.size, 0);
});

test('an inactive modal does not consume Escape', () => {
  const h = modalHarness(false);
  h.press('Escape');
  assert.equal(h.closes(), 0);
  assert.equal(h.listeners.size, 0);
});

for (const kind of ['store', 'account', 'notifications']) {
  test(`${kind} popover Escape dismisses without activating an item and restores focus`, () => {
    const effects: Function[] = [];
    const listeners = new Map<string, Function>();
    const changes: [number, unknown][] = [];
    const focused: number[] = [];
    let state = 0;
    let ref = 0;
    const openIndex = kind === 'store' ? 0 : kind === 'account' ? 1 : 2;
    const react = {
      useState: (initial: unknown) => {
        const index = state++;
        return [index === openIndex || (index >= 3 && typeof initial === 'function' ? false : index >= 3 ? initial : false),
          (value: unknown) => changes.push([index, value])];
      },
      useRef: () => {
        const index = ref++;
        return { current: { querySelector: () => ({ focus: () => focused.push(index) }) } };
      },
      useEffect: (fn: Function) => effects.push(fn),
    };
    const exports: any = {};
    const noop = () => {};
    const imports: Record<string, unknown> = {
      react,
      'react/jsx-runtime': { jsx: noop, jsxs: noop },
      'react-router-dom': { useNavigate: () => noop, useLocation: () => ({ search: '' }) },
      '@/contexts/AuthContext': { useAuth: () => ({ locations: [], profile: { role: 'owner_manager' } }) },
      '@/hooks/useNotifications': { useNotifications: () => ({ items: [], unreadCount: 0 }) },
      '@/contexts/CustomerDragContext': { useCustomerDrag: () => ({}) },
      '@/lib/push': { pushSupported: () => false },
      '@/lib/serviceTechAccess': { isServiceTechnician: () => false },
      '@/lib/utils': { cn: noop },
    };
    const js = ts.transpileModule(source('src/components/layout/Header.tsx'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInNewContext(js, { exports, URLSearchParams,
      document: { addEventListener: (key: string, fn: Function) => listeners.set(key, fn), removeEventListener: (key: string) => listeners.delete(key) },
      window: { addEventListener: noop, removeEventListener: noop },
      require: (name: string) => imports[name] ?? {},
    });
    exports.default({});
    const cleanups = effects.map(fn => fn());
    let prevented = false;
    listeners.get('keydown')?.({ key: 'Escape', defaultPrevented: false, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.deepEqual(changes, [[0, false], [1, false], [2, false]]);
    assert.deepEqual(focused, [openIndex]);
    cleanups.forEach(fn => fn?.());
    assert.equal(listeners.size, 0);
  });
}

test('legacy routes reach their intended destinations inside the existing role guard', () => {
  const s = source('src/App.tsx');
  for (const [from, to] of [['schedule', 'service'], ['inbox', 'communication']]) {
    assert.ok(s.includes(`<Route path="${from}" element={<Navigate to="/${to}" replace />} />`));
  }
});

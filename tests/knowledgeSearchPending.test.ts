import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Drive the real Documents component with deferred RPCs and its 250ms timer.
function harness() {
  const slots: any[] = [];
  let cursor = 0;
  const effects: Function[] = [];
  const timers = new Map<number, Function>();
  let timerId = 0;
  const requests: { resolve: Function; query: string }[] = [];
  const profile = { id: 'owner', org_id: 'org' };
  let params = new URLSearchParams();
  const setParams = (update: Function) => { params = update(params); };
  const same = (a: any[], b: any[]) => a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next: any) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useRef(initial: any) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn: Function, deps: any[]) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn: Function, deps: any[]) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn: Function, deps: any[]) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const old = slots[i];
        slots[i] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const chain: any = { then: (fn: Function) => Promise.resolve({ data: [], error: null }).then(fn as any) };
  for (const name of ['select', 'eq', 'order', 'abortSignal']) chain[name] = () => chain;
  const exports: any = {};
  const jsx = (type: any, props: any) => ({ type, props });
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/pages/Knowledge.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, URLSearchParams, AbortSignal,
    window: { setTimeout(fn: Function) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id: number) { timers.delete(id); } },
    require(name: string) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-router-dom') return { useSearchParams: () => [params, setParams] };
      if (name === '@/contexts/AuthContext') return { useAuth: () => ({ profile, session: null }) };
      if (name === '@/lib/supabase') return { supabase: {
        from: () => chain,
        rpc: (_name: string, args: any) => ({ abortSignal: () => new Promise(resolve => requests.push({ resolve, query: args.p_query })) }),
      } };
      if (name === '@/lib/knowledgeDocuments') return { filterKnowledgeDocuments: (docs: any[]) => docs, knowledgeSearchTitle: (row: any) => row.title };
      if (name === '@/lib/knowledgeFreshness') return { knowledgeFreshness: () => ({ label: 'Not verified' }) };
      if (name === '@/lib/utils') return { cn: () => '' };
      return {};
    },
  });
  const render = () => {
    cursor = 0;
    const tree = exports.default({ pageTitle: 'Documents' });
    while (effects.length) effects.shift()!();
    return tree;
  };
  const nodes = (tree: any): any[] => !tree || typeof tree !== 'object' ? []
    : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  const text = (tree: any): string => tree == null || typeof tree === 'boolean' ? ''
    : Array.isArray(tree) ? tree.map(text).join(' ') : typeof tree === 'object' ? text(tree.props?.children) : String(tree);
  return {
    text: () => text(render()),
    input(value: string) { nodes(render()).find(n => n.props?.['aria-label'] === 'Search documents').props.onChange({ target: { value } }); return text(render()); },
    type(value: string) { nodes(render()).find(n => n.props?.['aria-label'] === 'Document type').props.onChange({ target: { value } }); return text(render()); },
    timers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    requests,
  };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('Documents shows pending before debounce and genuine empty only after the current search settles', async () => {
  const h = harness();
  assert.doesNotMatch(h.input('Covana'), /No matching source found|0 source matches/);
  assert.match(h.text(), /Searching/);
  h.timers();
  h.requests[0].resolve({ data: [], error: null }); await flush();
  assert.match(h.text(), /No matching source found/);
});

test('a previous empty reply during debounce cannot claim the new query or type has no matches', async () => {
  const h = harness();
  h.input('missing'); h.timers();
  h.input('Covana');
  h.requests[0].resolve({ data: [], error: null }); await flush();
  assert.doesNotMatch(h.text(), /No matching source found|0 source matches/);
  h.timers(); h.requests[1].resolve({ data: [], error: null }); await flush();
  assert.match(h.text(), /No matching source found/);
  assert.doesNotMatch(h.type('warranty'), /No matching source found|0 source matches/);
});

test('settled matches render, then hide when the search changes; failures do not show the empty-state message', async () => {
  const h = harness();
  h.input('Covana'); h.timers();
  h.requests[0].resolve({ data: [{ chunk_id: 'chunk', document_id: 'doc', title: 'Covana test manual', doc_type: 'owner_manual', content: 'Matched reference', access_scope: 'staff' }], error: null });
  await flush();
  assert.match(h.text(), /1 source match.*Covana test manual/);
  assert.doesNotMatch(h.input('Sundance'), /Covana test manual|No matching source found/);
  h.timers(); h.requests[1].resolve({ data: null, error: { message: 'Search temporarily unavailable' } });
  await flush();
  assert.match(h.text(), /Search temporarily unavailable/);
  assert.doesNotMatch(h.text(), /No matching source found/);
  assert.match(h.input(''), /Indexed source library/);
});

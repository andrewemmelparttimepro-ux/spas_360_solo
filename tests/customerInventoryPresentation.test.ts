import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { customerInventoryLabel } from '../src/lib/customerInventory.ts';

function render(state: any) {
  const exports: any = {};
  const jsx = (type: any, props: any) => ({ type, props });
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/JobCustomerInventory.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name: string) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-router-dom') return { Link: 'link' };
    if (name === '@/hooks/useCustomerInventory') return { useCustomerInventory: () => state };
    if (name === '@/lib/customerInventory') return { customerInventoryLabel };
    return {};
  } });
  const tree = exports.default({ customerId: 'customer' });
  const nodes = (v: any): any[] => !v || typeof v !== 'object' ? [] : Array.isArray(v) ? v.flatMap(nodes) : [v, ...nodes(v.props?.children)];
  const text = (v: any): string => v == null || typeof v === 'boolean' ? '' : Array.isArray(v) ? v.map(text).join(' ') : typeof v === 'object' ? text(v.props?.children) : String(v);
  return { nodes: nodes(tree), text: text(tree) };
}
const item = { id: 'unit-1', brand: 'Sundance', model: 'Nova 7', product: 'Spa', color_finish: null, sku: '101049590 "Wells Fargo"' };
test('linked units have a keyboard-accessible inventory destination and clean serial without asserting ownership', () => {
  const view = render({ items: [item], loading: false, error: null });
  assert.match(view.text, /Customer inventory/);
  assert.match(view.text, /101049590/);
  assert.doesNotMatch(view.text, /Owned|Wells Fargo|No inventory/);
  assert.equal(view.nodes.find(n => n.type === 'link')?.props.to, '/inventory/unit-1');
});
test('loading and failed reads never present cached units as current inventory or claim empty', () => {
  for (const state of [{ loading: true, error: null }, { loading: false, error: 'Customer inventory could not load.' }]) {
    const view = render({ items: [item], ...state });
    assert.doesNotMatch(view.text, /101049590|No inventory|\(1\)/);
    assert.equal(view.nodes.filter(n => n.type === 'link').length, 0);
  }
});
test('failed inventory read offers retry; successful empty remains explicit', () => {
  let calls = 0;
  const view = render({ items: [], loading: false, error: 'Customer inventory could not load.', refresh: () => calls++ });
  view.nodes.find(n => n.type === 'button').props.onClick();
  assert.equal(calls, 1);
  assert.match(render({ items: [], loading: false, error: null }).text, /No inventory attached/);
});

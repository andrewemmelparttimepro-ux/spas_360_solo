import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real provider's event/promise ordering with controlled hooks and
// timers. No credentials, browser storage, or production writes are involved.
function harness() {
  const state: any[] = [], refs: any[] = [], effects: Function[] = [];
  const timers = new Map<number, { fn: Function; delay: number }>();
  let stateCursor = 0, refCursor = 0, mounted = false, timerId = 0;
  let callback: Function, resolveSession: Function;
  let profileReads = 0, draftClears = 0;
  const pendingSession = new Promise(resolve => { resolveSession = resolve; });
  const supabase = {
    auth: {
      getSession: () => pendingSession,
      onAuthStateChange(fn: Function) {
        callback = fn;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    from(table: string) {
      profileReads++;
      let userId: string;
      const query: any = {
        select() { return query; },
        eq(_key: string, value: string) { userId = value; return query; },
        abortSignal() { return query; },
        single() { return query; },
        order() { return query; },
        then(resolve: Function) {
          return Promise.resolve({ data: table === 'profiles'
            ? { id: userId, role: 'owner_manager', location_id: null }
            : [], error: null }).then(resolve as any);
        },
      };
      return query;
    },
  };
  const exports: any = {};
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8')
    .replaceAll('import.meta.env', '({ DEV: false })');
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(js, {
    exports, AbortSignal, navigator: { onLine: true },
    setTimeout(fn: Function, delay: number) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id: number) { timers.delete(id); },
    require(name: string) {
      if (name === 'react') return {
        createContext: () => ({ Provider: 'Provider' }),
        useState(initial: any) {
          const index = stateCursor++;
          if (!mounted) state[index] = initial;
          return [state[index], (next: any) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
        },
        useRef(initial: any) {
          const index = refCursor++;
          if (!mounted) refs[index] = { current: initial };
          return refs[index];
        },
        useCallback: (fn: Function) => fn,
        useEffect: (fn: Function) => { if (!mounted) effects.push(fn); },
      };
      if (name === 'react/jsx-runtime') return { jsx: (_type: any, props: any) => props };
      if (name === '@/lib/supabase') return { supabase };
      if (name === '@/lib/errorTelemetry') return { captureError() {} };
      if (name === '@/hooks/useDraftState') return { clearDrafts() { draftClears++; } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const render = () => {
    stateCursor = 0; refCursor = 0;
    return exports.AuthProvider({ children: null }).value;
  };
  render(); mounted = true;
  const cleanup = effects[0]();
  return {
    state: render, cleanup,
    emit: (event: string, session: any) => callback(event, session),
    resolve: (session: any) => resolveSession({ data: { session }, error: null }),
    runTimers(delay: number) {
      for (const [id, timer] of [...timers]) if (timer.delay === delay) {
        timers.delete(id); timer.fn();
      }
    },
    reads: () => profileReads,
    draftClears: () => draftClears,
  };
}

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('initial no-session event before getSession settles opens sign-in instead of hanging', async () => {
  const h = harness();
  h.emit('INITIAL_SESSION', null);
  h.resolve(null); await flush();
  h.runTimers(15_000);
  assert.equal(h.state().isLoading, false);
  assert.equal(h.state().session, null);
  assert.equal(h.state().authError, null);
  assert.equal(h.reads(), 0);
  h.cleanup();
});

test('getSession settling before the no-session event also opens sign-in', async () => {
  const h = harness();
  h.resolve(null); await flush();
  h.emit('INITIAL_SESSION', null);
  assert.equal(h.state().isLoading, false);
  assert.equal(h.state().session, null);
  h.cleanup();
});

test('signed-out event supersedes a pending authenticated session without erasing drafts', async () => {
  const h = harness();
  h.emit('SIGNED_OUT', null);
  h.resolve({ user: { id: 'stale-user' } }); await flush();
  assert.equal(h.state().isLoading, false);
  assert.equal(h.state().session, null);
  assert.equal(h.state().profile, null);
  assert.equal(h.reads(), 0);
  assert.equal(h.draftClears(), 0);
  h.cleanup();
});

test('authenticated event retains profile hydration despite an older null session result', async () => {
  const h = harness();
  h.emit('INITIAL_SESSION', { user: { id: 'current-user' } });
  h.resolve(null); await flush();
  assert.equal(h.state().isLoading, true);
  h.runTimers(0); await flush();
  assert.equal(h.state().profile.id, 'current-user');
  assert.equal(h.state().isLoading, false);
  h.cleanup();
});

test('sign-out during pending profile hydration cannot restore the old user', async () => {
  const h = harness();
  h.emit('SIGNED_IN', { user: { id: 'old-user' } });
  h.runTimers(0);
  h.emit('SIGNED_OUT', null); await flush();
  assert.equal(h.state().isLoading, false);
  assert.equal(h.state().profile, null);
  assert.equal(h.state().session, null);
  h.cleanup();
});

test('no auth event or session response still exposes the existing bounded retry error', () => {
  const h = harness();
  h.runTimers(15_000);
  assert.equal(h.state().isLoading, false);
  assert.match(h.state().authError, /taking longer than expected/);
  h.cleanup();
});

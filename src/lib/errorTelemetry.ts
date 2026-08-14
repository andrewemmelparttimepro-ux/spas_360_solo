import { supabase } from '@/lib/supabase';
import { scrubTelemetryValue } from '@/lib/telemetryPrivacy';

type ErrorContext = Record<string, string | number | boolean | null | undefined>;

const recent = new Map<string, number>();
let installed = false;
let reporting = false;
let originalConsoleError: typeof console.error | null = null;

function errorParts(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      message: scrubTelemetryValue(`${error.name}: ${error.message || 'Unknown error'}`, 500),
      stack: error.stack ? scrubTelemetryValue(error.stack, 4000) : null,
    };
  }
  if (typeof error === 'string') return { message: scrubTelemetryValue(error, 500), stack: null };
  return { message: 'Unknown client error', stack: null };
}

function hash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `client:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export function captureError(error: unknown, source = 'client', context: ErrorContext = {}): void {
  if (reporting) return;
  const { message, stack } = errorParts(error);
  const fingerprint = hash(`${source}|${message}|${stack?.split('\n').slice(0, 3).join('\n') ?? ''}`);
  const now = Date.now();
  if (now - (recent.get(fingerprint) ?? 0) < 30_000) return;
  recent.set(fingerprint, now);
  if (recent.size > 100) {
    for (const [key, at] of recent) if (now - at > 300_000) recent.delete(key);
  }

  const metadata = Object.fromEntries(
    Object.entries(context)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value) || value === null)
      .slice(0, 12)
      .map(([key, value]) => [scrubTelemetryValue(key, 40), typeof value === 'string' ? scrubTelemetryValue(value, 160) : value])
  );

  reporting = true;
  void Promise.resolve(supabase.rpc('record_app_error', {
    p_fingerprint: fingerprint,
    p_source: scrubTelemetryValue(source, 80),
    p_message: message,
    p_stack: stack,
    p_route: scrubTelemetryValue(`${window.location.pathname}${window.location.hash}`, 240),
    p_release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || import.meta.env.VITE_APP_VERSION || null,
    p_metadata: metadata,
  })).then(() => undefined).catch(() => undefined).finally(() => { reporting = false; });
}

export function installErrorTelemetry(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    captureError(event.error ?? event.message, 'window.error', {
      file: event.filename ? event.filename.split('/').pop() : null,
      line: event.lineno,
      column: event.colno,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    captureError(event.reason, 'unhandledrejection');
  });

  originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalConsoleError?.(...args);
    const primary = args.find(arg => arg instanceof Error) ?? args.find(arg => typeof arg === 'string');
    if (primary) captureError(primary, 'console.error');
  };
}

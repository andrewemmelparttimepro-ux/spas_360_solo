import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from '@/lib/errorTelemetry';

interface Props { children: ReactNode }
interface State { failed: boolean }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, 'react.root', { component_stack: info.componentStack?.slice(0, 160) });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="min-h-screen bg-ink-950 text-ink-100 flex items-center justify-center p-6">
        <section className="max-w-md w-full rounded-2xl border border-ink-700 bg-ink-900 p-7 text-center shadow-2xl">
          <img src="/logo-mark.png" alt="" className="h-14 mx-auto mb-5" />
          <h1 className="text-xl font-bold">SPAS 360 hit an unexpected snag</h1>
          <p className="mt-2 text-sm text-ink-400">
            The diagnostic was recorded for the team. Reload to recover without re-entering anything.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Reload SPAS 360
          </button>
        </section>
      </main>
    );
  }
}

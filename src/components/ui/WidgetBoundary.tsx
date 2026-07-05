import { Component, type ReactNode } from 'react';

/**
 * Contains failures of non-critical UI (e.g. the floating chat widget) so they
 * can never unmount the whole app. Renders nothing on error and logs once.
 */
export default class WidgetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[WidgetBoundary] contained widget crash:', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

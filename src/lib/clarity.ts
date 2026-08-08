type ClarityWindow = Window & {
  clarity?: (...args: unknown[]) => void;
};

const clarityProjectId = import.meta.env.VITE_CLARITY_PROJECT_ID?.trim();

export function trackClarityEvent(name: string) {
  if (!import.meta.env.PROD || typeof window === 'undefined') return;
  const safeName = String(name || '').replace(/\s+/g, '_').trim().slice(0, 80);
  if (!safeName) return;
  const clarityWindow = window as ClarityWindow;
  if (typeof clarityWindow.clarity === 'function') clarityWindow.clarity('event', safeName);
}

export function installClarity() {
  if (!import.meta.env.PROD || !clarityProjectId || typeof window === 'undefined') {
    return;
  }

  const clarityWindow = window as ClarityWindow;

  if (clarityWindow.clarity || document.querySelector(`script[src="https://www.clarity.ms/tag/${clarityProjectId}"]`)) {
    return;
  }

  clarityWindow.clarity = (...args: unknown[]) => {
    const clarityQueue = (clarityWindow.clarity as unknown as {q?: unknown[][]}).q ?? [];
    clarityQueue.push(args);
    (clarityWindow.clarity as unknown as {q: unknown[][]}).q = clarityQueue;
  };

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${clarityProjectId}`;

  const firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode?.insertBefore(script, firstScript);
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Analytics} from '@vercel/analytics/react';
import {SpeedInsights} from '@vercel/speed-insights/react';
import App from './App.tsx';
import './index.css';
import {installClarity} from './lib/clarity';
import {installErrorTelemetry} from './lib/errorTelemetry';
import AppErrorBoundary from './components/ui/AppErrorBoundary';

installClarity();
installErrorTelemetry();

// PWA: register the service worker (prod only — HMR and a SW don't mix)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW registration failed:', err));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
);

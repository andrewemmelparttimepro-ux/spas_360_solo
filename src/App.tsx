import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import AppLayout from './components/layout/AppLayout';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Deals = lazy(() => import('./pages/Deals'));
const Service = lazy(() => import('./pages/Service'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Communication = lazy(() => import('./pages/Communication'));
const Reports = lazy(() => import('./pages/Reports'));
const Contacts = lazy(() => import('./pages/Contacts'));
const ContactDetail = lazy(() => import('./pages/ContactDetail'));
const DealDetail = lazy(() => import('./pages/DealDetail'));
const JobDetail = lazy(() => import('./pages/JobDetail'));
const InventoryDetail = lazy(() => import('./pages/InventoryDetail'));
const Settings = lazy(() => import('./pages/Settings'));

function PageLoader() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, []);

  if (timedOut) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-500 gap-3">
        <p className="text-lg font-medium">Taking longer than expected...</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-brand-500 text-white text-sm rounded-lg hover:bg-brand-600">
          Reload Page
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );
}

function AuthGate() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-ink-950">
        <div className="text-center">
          <img src="/logo-mark.png" alt="" className="h-16 mx-auto mb-5 brand-breathe drop-shadow-[0_0_20px_rgba(52,160,255,0.25)]" />
          <div className="w-8 h-8 border-[3px] border-ink-700 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-medium tracking-[0.25em] uppercase text-ink-500">Loading SPAS 360</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Login />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="contacts/:id" element={<ContactDetail />} />
          <Route path="deals" element={<Deals />} />
          <Route path="deals/:id" element={<DealDetail />} />
          <Route path="crm" element={<Navigate to="/deals" replace />} />
          <Route path="crm/:id" element={<DealDetail />} />
          <Route path="service" element={<Service />} />
          <Route path="service/:id" element={<JobDetail />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="inventory/:id" element={<InventoryDetail />} />
          <Route path="communication" element={<Communication />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <AuthGate />
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

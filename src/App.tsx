import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import AppLayout from './components/layout/AppLayout';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CRM = lazy(() => import('./pages/CRM'));
const Service = lazy(() => import('./pages/Service'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Communication = lazy(() => import('./pages/Communication'));
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
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
        <p className="text-lg font-medium">Taking longer than expected...</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600">
          Reload Page
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
    </div>
  );
}

function AuthGate() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">Loading SPAS 360...</p>
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
          <Route path="crm" element={<CRM />} />
          <Route path="crm/:id" element={<DealDetail />} />
          <Route path="service" element={<Service />} />
          <Route path="service/:id" element={<JobDetail />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="inventory/:id" element={<InventoryDetail />} />
          <Route path="communication" element={<Communication />} />
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
import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import AppLayout from './components/layout/AppLayout';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CRM = lazy(() => import('./pages/CRM'));
const Service = lazy(() => import('./pages/Service'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Communication = lazy(() => import('./pages/Communication'));
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
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
        <p className="text-lg font-medium">Taking longer than expected...</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600">
          Reload Page
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
    </div>
  );
}

function AuthGate() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">Loading SPAS 360...</p>
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
          <Route path="crm" element={<CRM />} />
          <Route path="crm/:id" element={<DealDetail />} />
          <Route path="service" element={<Service />} />
          <Route path="service/:id" element={<JobDetail />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="inventory/:id" element={<InventoryDetail />} />
          <Route path="communication" element={<Communication />} />
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
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CRM = lazy(() => import('./pages/CRM'));
const Service = lazy(() => import('./pages/Service'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Communication = lazy(() => import('./pages/Communication'));
const Contacts = lazy(() => import('./pages/Contacts'));
const ContactDetail = lazy(() => import('./pages/ContactDetail'));
const DealDetail = lazy(() => import('./pages/DealDetail'));
const JobDetail = lazy(() => import('./pages/JobDetail'));
const InventoryDetail = lazy(() => import('./pages/InventoryDetail'));
const Settings = lazy(() => import('./pages/Settings'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
    </div>
  );
}

function AuthGate() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">Loading SPAS 360...</p>
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
          <Route path="crm" element={<CRM />} />
          <Route path="crm/:id" element={<DealDetail />} />
          <Route path="service" element={<Service />} />
          <Route path="service/:id" element={<JobDetail />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="inventory/:id" element={<InventoryDetail />} />
          <Route path="communication" element={<Communication />} />
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
      <Router>
        <AuthGate />
      </Router>
    </AuthProvider>
  );
}

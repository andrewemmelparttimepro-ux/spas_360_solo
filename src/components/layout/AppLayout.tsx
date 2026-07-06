import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import AdminRail from './AdminRail';
import ChatWidget from '../ChatWidget';
import WidgetBoundary from '../ui/WidgetBoundary';

/** OMP-style shell: dark topbar with grouped nav pills; contacts admin rail on the right; mobile gets a drawer. */
export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-ink-950 text-ink-100 font-sans">
      <Header onMenuClick={() => setDrawerOpen(true)} />
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 sm:p-5">
          <Outlet />
        </main>
        <WidgetBoundary>
          <AdminRail />
        </WidgetBoundary>
      </div>
      <WidgetBoundary>
        <ChatWidget />
      </WidgetBoundary>
    </div>
  );
}

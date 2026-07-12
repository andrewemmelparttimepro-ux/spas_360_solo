import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { resyncPush } from '@/lib/push';
import Sidebar from './Sidebar';
import Header from './Header';
import AdminRail from './AdminRail';
import ChatWidget from '../ChatWidget';
import WidgetBoundary from '../ui/WidgetBoundary';
import { CustomerDragProvider } from '@/contexts/CustomerDragContext';
import ActivityTracker from '../ActivityTracker';

/** OMP-style shell: dark topbar with grouped nav pills; contacts admin rail on the right; mobile gets a drawer.
 *  CustomerDragProvider wraps the whole shell so a customer card can be dragged
 *  from any page onto the Deals/Schedule pills in the topbar. */
export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Keep this device's push subscription fresh + owned by the signed-in user
  useEffect(() => { resyncPush(); }, []);

  return (
    <CustomerDragProvider>
      <ActivityTracker />
      {/* 100dvh (not vh): the shell tracks the real visible viewport on mobile, so
          bottom-anchored composers aren't stranded when browser chrome/keyboard moves */}
      <div className="flex flex-col h-[100dvh] bg-ink-950 text-ink-100 font-sans">
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
    </CustomerDragProvider>
  );
}

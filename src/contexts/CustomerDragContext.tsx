import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

// ─── Cross-page customer drag ────────────────────────────────────────────────
// Pointer-based (not HTML5 DnD) so a drag survives route changes: grab a
// customer card, hover the Deals pill in the top bar → the app spring-loads
// onto the pipeline (mac dock style), then drop on a deal card to attach the
// customer or on a stage column to start a new deal. Touch is excluded on
// purpose — phones scroll; they get explicit buttons instead.

export interface DragCustomer {
  id: string;
  first_name: string;
  last_name: string;
  customer_type: string;
  phone: string;
}

export type CustomerDropTarget =
  | { kind: 'deal'; dealId: string }
  | { kind: 'stage'; stageId: string };

type DropHandler = (target: CustomerDropTarget, customer: DragCustomer) => void;

interface CustomerDragValue {
  /** The customer currently being dragged, or null. */
  dragging: DragCustomer | null;
  /** Hovered drop target as a key: 'deal:<id>' | 'stage:<id>' | 'nav:<path>'. */
  activeTarget: string | null;
  /** Call from a card's onPointerDown; drag begins after an 8px move. */
  armDrag: (customer: DragCustomer, e: ReactPointerEvent) => void;
  /** Pages with in-page targets (Deals) register how drops resolve. */
  setDropHandler: (fn: DropHandler | null) => void;
}

const Ctx = createContext<CustomerDragValue | null>(null);

export function useCustomerDrag(): CustomerDragValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCustomerDrag must be used within CustomerDragProvider');
  return v;
}

const NAV_DWELL_MS = 400; // hover a nav pill this long → spring-load the page
const DRAG_THRESHOLD = 8; // px of movement before a press becomes a drag

const TYPE_BADGE: Record<string, string> = {
  Lead: 'bg-amber-500/15 text-amber-300',
  Prospect: 'bg-brand-500/15 text-brand-300',
  Customer: 'bg-emerald-500/15 text-emerald-300',
  'Past Customer': 'bg-ink-950 text-ink-300',
};

export function CustomerDragProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [dragging, setDragging] = useState<DragCustomer | null>(null);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);

  const pendingRef = useRef<{ customer: DragCustomer; x: number; y: number } | null>(null);
  const draggingRef = useRef<DragCustomer | null>(null);
  const activeTargetRef = useRef<string | null>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const ghostRef = useRef<HTMLDivElement>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropHandlerRef = useRef<DropHandler | null>(null);
  const navigateRef = useRef(navigate);
  const pathRef = useRef(location.pathname);
  navigateRef.current = navigate;
  pathRef.current = location.pathname;

  const setDropHandler = useCallback((fn: DropHandler | null) => {
    dropHandlerRef.current = fn;
  }, []);

  const positionGhost = useCallback((x: number, y: number) => {
    if (ghostRef.current) {
      ghostRef.current.style.transform = `translate3d(${x + 14}px, ${y + 10}px, 0)`;
    }
  }, []);

  const clearDwell = useCallback(() => {
    if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
  }, []);

  const updateTarget = useCallback((key: string | null) => {
    if (key === activeTargetRef.current) return;
    activeTargetRef.current = key;
    setActiveTarget(key);
    clearDwell();
    // Spring-load: linger on a nav pill and the app takes you there, drag intact
    if (key?.startsWith('nav:')) {
      const path = key.slice(4);
      if (path !== pathRef.current) {
        dwellTimerRef.current = setTimeout(() => navigateRef.current(path), NAV_DWELL_MS);
      }
    }
  }, [clearDwell]);

  const cleanup = useCallback(() => {
    pendingRef.current = null;
    draggingRef.current = null;
    setDragging(null);
    updateTarget(null);
    clearDwell();
    if (scrollTimerRef.current) { clearInterval(scrollTimerRef.current); scrollTimerRef.current = null; }
    document.body.classList.remove('cdrag-active');
  }, [updateTarget, clearDwell]);

  const hitTest = useCallback((x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cdrop]');
    if (!el) return null;
    const kind = el.dataset.cdrop;
    if (kind === 'deal' && el.dataset.cdropDeal) return `deal:${el.dataset.cdropDeal}`;
    if (kind === 'stage' && el.dataset.cdropStage) return `stage:${el.dataset.cdropStage}`;
    if (kind === 'nav' && el.dataset.cdropNav) return `nav:${el.dataset.cdropNav}`;
    return null;
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      const pending = pendingRef.current;
      if (pending && !draggingRef.current) {
        const dist = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
        if (dist >= DRAG_THRESHOLD) {
          draggingRef.current = pending.customer;
          setDragging(pending.customer);
          document.body.classList.add('cdrag-active');
          positionGhost(e.clientX, e.clientY);
          // Nudge the kanban sideways when the ghost hugs an edge
          scrollTimerRef.current = setInterval(() => {
            const container = document.querySelector<HTMLElement>('[data-cdrop-scroll]');
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const { x, y } = lastPosRef.current;
            if (y < rect.top || y > rect.bottom) return;
            if (x < rect.left + 90) container.scrollLeft -= 16;
            else if (x > rect.right - 90) container.scrollLeft += 16;
          }, 24);
        }
        return;
      }
      if (draggingRef.current) {
        positionGhost(e.clientX, e.clientY);
        updateTarget(hitTest(e.clientX, e.clientY));
      }
    }

    function onUp(e: PointerEvent) {
      const wasDragging = draggingRef.current;
      const target = activeTargetRef.current;
      if (wasDragging) {
        // Swallow the click that follows a real drag so cards don't navigate
        const suppress = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener('click', suppress, true);
        setTimeout(() => window.removeEventListener('click', suppress, true), 0);

        if (target?.startsWith('deal:')) {
          dropHandlerRef.current?.({ kind: 'deal', dealId: target.slice(5) }, wasDragging);
        } else if (target?.startsWith('stage:')) {
          dropHandlerRef.current?.({ kind: 'stage', stageId: target.slice(6) }, wasDragging);
        } else if (target?.startsWith('nav:')) {
          // Dropping straight onto a pill = quick-create intent for that side
          const path = target.slice(4);
          if (path === '/service') {
            navigateRef.current('/service', { state: { openNew: true, contactId: wasDragging.id } });
          } else if (path === '/deals') {
            navigateRef.current('/deals', { state: { customerDrop: wasDragging.id } });
          } else {
            navigateRef.current(path);
          }
        }
      }
      void e;
      cleanup();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && draggingRef.current) cleanup();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [cleanup, hitTest, positionGhost, updateTarget]);

  const armDrag = useCallback((customer: DragCustomer, e: ReactPointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0) return; // phones scroll, mice drag
    pendingRef.current = { customer, x: e.clientX, y: e.clientY };
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onDeals = location.pathname === '/deals';
  const hint = onDeals
    ? 'Drop on a deal to attach — or on a stage column to start a new deal'
    : 'Drag onto Deals in the top bar to open the pipeline · drop on Schedule to book a job';

  return (
    <Ctx.Provider value={{ dragging, activeTarget, armDrag, setDropHandler }}>
      {children}
      {dragging && (
        <>
          {/* Ghost card riding the pointer */}
          <div ref={ghostRef} className="fixed left-0 top-0 z-[200] pointer-events-none will-change-transform">
            <div className="w-52 -rotate-2 bg-ink-850 border border-violet-500/50 rounded-xl shadow-2xl shadow-violet-500/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-100 truncate">{dragging.first_name} {dragging.last_name}</p>
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0', TYPE_BADGE[dragging.customer_type] ?? 'bg-ink-950 text-ink-300')}>
                  {dragging.customer_type}
                </span>
              </div>
              <p className="text-xs text-ink-400 mt-1">{dragging.phone}</p>
            </div>
          </div>
          {/* What-can-I-do-with-this hint */}
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
            <div className="px-4 py-2 rounded-full bg-ink-850/95 border border-violet-500/40 shadow-xl text-[12px] font-medium text-violet-200 whitespace-nowrap">
              {hint}
            </div>
          </div>
        </>
      )}
    </Ctx.Provider>
  );
}

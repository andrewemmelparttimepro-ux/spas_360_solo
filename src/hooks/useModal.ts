import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * One behavior contract for every modal in the app:
 * - Escape closes it
 * - Tab cycles inside it (background stays untabbable)
 * - focus starts inside and returns to the opener on close
 * - `dialogProps` carries the dialog semantics for screen readers
 *
 * Usage:
 *   const { dialogRef, dialogProps } = useModal(onClose);
 *   <div ref={dialogRef} {...dialogProps} className="...modal panel...">
 */
export function useModal(onClose: () => void, active = true) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Modals define onClose inline every render — keep the effect stable
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Some modal components stay mounted and render null until they have a
    // subject — the key handling must never run while nothing is shown.
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const focusables = () =>
      node
        ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            el => !el.hasAttribute('disabled') && el.offsetParent !== null,
          )
        : [];

    // Land focus inside — the first field if there is one, else the panel itself
    const first = focusables()[0];
    (first ?? node)?.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && node) {
        const els = focusables();
        if (els.length === 0) { e.preventDefault(); return; }
        const active = document.activeElement as HTMLElement;
        const idx = els.indexOf(active);
        if (e.shiftKey && (idx <= 0 || !node.contains(active))) {
          e.preventDefault();
          els[els.length - 1].focus();
        } else if (!e.shiftKey && (idx === els.length - 1 || !node.contains(active))) {
          e.preventDefault();
          els[0].focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      opener?.focus?.({ preventScroll: true });
    };
  }, [active]);

  return {
    dialogRef,
    dialogProps: { role: 'dialog', 'aria-modal': true, tabIndex: -1 } as const,
  };
}

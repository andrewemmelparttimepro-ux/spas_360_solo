import { useEffect, useRef } from 'react';

/**
 * Headless dialog behavior for modals written inline in a page's JSX
 * (where a hook can't be called conditionally): Escape closes, and focus
 * returns to the opener on unmount. Drop it as the first child of the modal.
 * Component modals get the full focus trap via useModal instead.
 */
export default function DialogKeys({ onClose }: { onClose: () => void }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  return null;
}

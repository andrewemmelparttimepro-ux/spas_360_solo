// Realtime hygiene: a drag or an Ari action lands as a burst of row events, and
// every open client used to run its full fetch once per event. Coalescing the
// burst into one trailing refetch keeps the board live without the stampede.

export interface DebouncedFn {
  (): void;
  cancel: () => void;
}

export function debounceRefetch(fn: () => void, ms = 400): DebouncedFn {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(); }, ms);
  };
  wrapped.cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  return wrapped;
}

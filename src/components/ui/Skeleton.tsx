import { cn } from '@/lib/utils';

/** Pulse placeholder block — pages sketch their real layout while data loads
 *  instead of showing a spinner void. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-ink-800/70', className)} />;
}

/** Ghost of a customer/deal-style card. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-ink-900 rounded-xl border border-ink-700 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('h-3', i % 2 ? 'w-5/6' : 'w-full')} />
      ))}
    </div>
  );
}

/** Full-page skeleton grids per surface. */
export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
      {Array.from({ length: count }, (_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

export function BoardSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div className="flex space-x-4 h-full items-start overflow-hidden">
      {Array.from({ length: columns }, (_, i) => (
        <div key={i} className="w-72 flex-shrink-0 bg-ink-950/60 rounded-xl border border-ink-700 p-3 space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <CardSkeleton rows={2} />
          {i % 2 === 0 && <CardSkeleton rows={1} />}
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-ink-900 rounded-xl border border-ink-700 p-5 space-y-2.5">
          <Skeleton className="h-2.5 w-1/2" />
          <Skeleton className="h-7 w-2/3" />
        </div>
      ))}
    </div>
  );
}

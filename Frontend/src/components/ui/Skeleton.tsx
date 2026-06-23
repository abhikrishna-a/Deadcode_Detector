export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-white/[0.03] ${className}`} />
  );
}

export function CardSkeleton() {
  return (
    <div className="p-5 rounded-3xl glass-card space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="w-6 h-4" />
      <Skeleton className="h-3 flex-1" />
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-5 w-12 rounded-full" />
    </div>
  );
}

export function KanbanSkeleton() {
  return (
    <div className="flex gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex-1 space-y-2">
          <Skeleton className="h-8 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

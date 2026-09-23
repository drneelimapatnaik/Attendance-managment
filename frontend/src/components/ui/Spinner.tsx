/** Indeterminate loading spinner and skeleton placeholder. */
import { cn } from '@/lib/cn';

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-container', className)} />;
}

/** Full-area loader used as the Suspense fallback for lazy routes. */
export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-primary">
      <Spinner size={28} />
    </div>
  );
}

import { AppShell } from "./AppShell";

interface PageSkeletonProps {
  title: string;
  description?: string;
  cards?: number;
}

/**
 * Instant shell rendered by each route's loading.tsx while the server
 * component resolves. Keeps the sidebar and page header visible so
 * navigation never flashes an empty screen.
 */
export function PageSkeleton({ title, description, cards = 3 }: PageSkeletonProps) {
  return (
    <AppShell title={title} description={description}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter" aria-busy="true">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="surface rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="skeleton h-11 w-11 rounded-lg" />
              <div className="skeleton h-6 w-20 rounded-full" />
            </div>
            <div className="space-y-2">
              <div className="skeleton h-4 w-24 rounded" />
              <div className="skeleton h-3 w-32 rounded" />
            </div>
            <div className="skeleton h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </AppShell>
  );
}

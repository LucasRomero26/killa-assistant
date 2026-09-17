"use client";

import { SWRConfig } from "swr";

/**
 * App-wide SWR defaults. Every request goes through /api/proxy to a remote
 * backend, so avoid refetch storms: no refetch on window focus, and dedupe
 * identical keys requested within a few seconds of each other.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 5000,
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}

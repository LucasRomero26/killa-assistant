"use client";

import { SWRConfig } from "swr";

/**
 * App-wide SWR defaults: no refetch on window focus, and dedupe identical
 * keys requested within a few seconds of each other.
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

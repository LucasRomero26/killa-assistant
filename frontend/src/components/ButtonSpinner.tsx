import { Loader2 } from "lucide-react";

/** Spinner for buttons while a request is in flight; inherits the text color. */
export function ButtonSpinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin shrink-0" aria-hidden="true" />;
}

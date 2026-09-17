import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return (
    <PageSkeleton
      title="AI APIs"
      description="Bring your own keys. They are encrypted with AES-256-GCM and only decrypted at inference time."
      cards={2}
    />
  );
}

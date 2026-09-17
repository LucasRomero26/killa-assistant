import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return (
    <PageSkeleton
      title="Behavior"
      description="Shape how the assistant talks and what it does with your notes."
      cards={2}
    />
  );
}

import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return (
    <PageSkeleton
      title="Connections"
      description="Link Telegram and grant Google access so the assistant can manage your calendar and files."
      cards={3}
    />
  );
}

import { Card } from "@/components/ui/card";
import { PageSkeleton, HeaderSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="aspect-square p-0" />
        ))}
      </div>
    </PageSkeleton>
  );
}

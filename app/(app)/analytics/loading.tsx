import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton, HeaderSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton width="max-w-5xl">
      <HeaderSkeleton />
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="gap-1 p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-16" />
          </Card>
        ))}
      </div>
      <Card className="mt-4 h-56 p-5" />
    </PageSkeleton>
  );
}

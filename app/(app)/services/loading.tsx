import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton, HeaderSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton sub={false} action />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="flex-row items-center gap-4 p-4">
            <Skeleton className="size-14 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-8 rounded-lg" />
          </Card>
        ))}
      </div>
    </PageSkeleton>
  );
}

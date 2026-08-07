import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton, HeaderSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton width="max-w-5xl">
      <HeaderSkeleton />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="gap-0 overflow-hidden p-0">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-20" />
            </div>
          </Card>
        ))}
      </div>
    </PageSkeleton>
  );
}

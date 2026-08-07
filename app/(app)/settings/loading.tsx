import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton width="max-w-3xl">
      <Skeleton className="h-6 w-28" />
      <Skeleton className="mt-5 h-9 w-full rounded-lg" />
      <Card className="mt-5 gap-4 p-5">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-9 w-24 self-start rounded-lg" />
      </Card>
    </PageSkeleton>
  );
}

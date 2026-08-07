import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-6 w-52" />
      <div className="mt-5 space-y-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Card key={i} className="gap-3 p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </Card>
        ))}
      </div>
    </PageSkeleton>
  );
}

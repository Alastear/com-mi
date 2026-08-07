import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton, PageSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton width="max-w-3xl">
      <Skeleton className="h-6 w-36" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      <div className="mt-6">
        <ListSkeleton rows={3} />
      </div>
    </PageSkeleton>
  );
}

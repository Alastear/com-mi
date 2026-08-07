import { ListSkeleton, PageSkeleton, HeaderSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <div className="mt-6">
        <ListSkeleton rows={5} />
      </div>
    </PageSkeleton>
  );
}

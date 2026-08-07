import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton width="max-w-5xl">
      <Skeleton className="h-4 w-28" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>

      {/* สองคอลัมน์เหมือนหน้าจริง: เธรดข้อความซ้าย · สรุปออเดอร์ขวา 340px */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-6">
          <Card className="gap-4 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className={i % 2 ? "h-4 w-2/3" : "h-4 w-4/5"} />
                </div>
              </div>
            ))}
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="h-48 p-5" />
          <Card className="h-32 p-5" />
        </div>
      </div>
    </PageSkeleton>
  );
}

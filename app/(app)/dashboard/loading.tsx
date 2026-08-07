import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton width="max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-52" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* เช็กลิสต์ตั้งร้าน — ก้อนที่สูงที่สุดบนหน้านี้ ต้องกันที่ไว้ให้ครบ */}
      <Card className="mt-6 gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-4 w-10" />
        </div>
        <Skeleton className="h-1.5 w-full" />
        <div className="space-y-1">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-start gap-3 p-2.5">
              <Skeleton className="mt-0.5 size-5 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="h-24" />
        ))}
      </div>
    </PageSkeleton>
  );
}

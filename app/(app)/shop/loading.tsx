import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton width="max-w-3xl">
      {/* แบนเนอร์กับรูปโปรไฟล์ที่ทับขึ้นมา — ส่วนที่ขยับแล้วเห็นชัดที่สุดของหน้านี้ */}
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="-mt-10 ml-5">
        <Skeleton className="size-20 rounded-full border-4 border-background" />
      </div>
      <div className="mt-5 space-y-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="gap-3 p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </Card>
        ))}
      </div>
    </PageSkeleton>
  );
}

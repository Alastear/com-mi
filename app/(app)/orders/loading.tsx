import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { BOARD_COLUMNS } from "@/lib/types";

export default function Loading() {
  return (
    <PageSkeleton width="max-w-[1400px]">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-32" />
        {/* ปุ่มสลับบอร์ด/รายการ */}
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      {/*
       * เลื่อนแนวนอน คอลัมน์กว้าง 268px ตายตัว — ลอกมาจาก order-board.tsx ตรง ๆ
       * ถ้าใช้ grid แทน พอข้อมูลมาถึงบอร์ดจริงจะกระโดดจากกริดไปเป็นแถวเลื่อน
       */}
      <div className="no-scrollbar mt-5 flex gap-3 overflow-x-auto pb-4">
        {BOARD_COLUMNS.map((status, i) => (
          <div
            key={status}
            className="flex w-[268px] shrink-0 flex-col rounded-xl border bg-card/40"
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="size-5 rounded-full" />
            </div>
            <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
              {Array.from({ length: i === 0 ? 2 : 1 }, (_, j) => (
                <Card key={j} className="gap-2 p-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}

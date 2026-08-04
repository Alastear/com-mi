import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton ของหน้าร้าน — หน้าตาต้องใกล้เคียงของจริง ไม่งั้นตอนเนื้อหาเข้ามาเลย์เอาต์จะกระโดด
 *
 * ⚠️ ตั้งใจ **ไม่** ทำเป็น `app/(public)/[handle]/loading.tsx`
 *
 * `loading.tsx` สร้าง Suspense boundary ครอบทั้ง segment *และ segment ลูกทั้งหมด*
 * ทำให้ Next เริ่ม stream response ทันที → header 200 ถูกส่งออกไปก่อนที่ page
 * จะได้เรียก `notFound()` ผลคือ handle ที่ไม่มีอยู่จริงคืน **200 พร้อมเนื้อหาหน้า 404**
 * (soft-404) ซึ่ง Google จะ index หน้าที่ไม่มีอยู่ — ร้ายแรงสำหรับโปรดักต์ที่โตด้วยการแชร์ลิงก์
 *
 * วิธีที่ถูก: ครอบเฉพาะ "ส่วนที่ดึงข้อมูล" ด้วย <Suspense> ในตัวหน้าเอง
 * ซึ่งตรงกับแผน PPR อยู่แล้ว — static shell มาก่อน แล้ว dynamic island ค่อย stream ตาม
 * (docs/01-architecture.md §2)
 *
 *   <Suspense fallback={<CreatorMenuSkeleton />}>
 *     <CreatorMenu handle={handle} />
 *   </Suspense>
 */
export function CreatorPageSkeleton() {
  return (
    <div className="pb-20">
      <Skeleton className="h-40 w-full rounded-none sm:h-56 lg:h-64" />

      <div className="mx-auto w-full max-w-5xl px-4">
        <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
          <Skeleton className="size-24 rounded-full sm:size-28" />
          <div className="flex-1 space-y-2 pb-1">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        <Skeleton className="mt-4 h-5 w-80 max-w-full" />
        <Skeleton className="mt-4 h-5 w-64 max-w-full" />

        <CreatorMenuSkeleton />
      </div>
    </div>
  );
}

export function CreatorMenuSkeleton() {
  return (
    <>
      <Skeleton className="mt-10 h-6 w-40" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border">
            <Skeleton className="aspect-[1/1.25] w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

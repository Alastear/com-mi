import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * โครงกระดูกสำหรับหน้าใน backoffice
 *
 * มีไว้เพื่อให้ `loading.tsx` ของแต่ละหน้าเขียนสั้น ๆ แต่ยัง **ตรงกับหน้าจริง**
 * จุดสำคัญไม่ใช่ "มีอะไรกะพริบ ๆ ระหว่างรอ" แต่คือความกว้างของคอนเทนเนอร์
 * กับความสูงของหัวเรื่องต้องเท่าของจริง ไม่งั้นพอข้อมูลมาถึงหน้าจะกระตุกทั้งหน้า
 * ซึ่งรู้สึกแย่กว่ารอเฉย ๆ ด้วยซ้ำ
 *
 * ค่า max-w ของแต่ละหน้าจึงต้องคัดลอกมาจากหน้านั้นตรง ๆ — ถ้าแก้หน้าไหน
 * ต้องแก้ loading ของหน้านั้นตาม
 *
 * ⚠️ ที่นี่ใช้ `loading.tsx` ได้ แต่ **หน้าร้านสาธารณะใช้ไม่ได้**
 * `loading.tsx` เปิด stream ทันที header 200 จึงออกไปก่อนที่หน้าจะเรียก `notFound()`
 * ได้ ผลคือ soft-404 — ยอมได้กับหน้าหลังบ้านที่ต้องล็อกอินและไม่มีวันถูก index
 * แต่กับ /@handle คือ Google เก็บหน้าที่ไม่มีอยู่จริงเข้าดัชนี (ดู creator-page-skeleton.tsx)
 */
export function PageSkeleton({
  width = "max-w-4xl",
  children,
}: {
  width?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mx-auto w-full px-4 py-6 lg:py-8", width)}>{children}</div>;
}

/** หัวเรื่อง: บรรทัดใหญ่ + คำอธิบายใต้ชื่อ (ละคำอธิบายได้เมื่อหน้าจริงไม่มี) */
export function HeaderSkeleton({ sub = true, action = false }: { sub?: boolean; action?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        {sub ? <Skeleton className="h-4 w-64" /> : null}
      </div>
      {action ? <Skeleton className="h-9 w-32 rounded-lg" /> : null}
    </div>
  );
}

/** การ์ดเปล่าความสูงคงที่ — ใช้แทนบล็อกเนื้อหาที่ยังไม่รู้ว่าจะสูงเท่าไร */
export function CardSkeleton({ className }: { className?: string }) {
  return <Card className={cn("h-32", className)} />;
}

/** รายการแนวตั้งแบบมีรูปกลม + สองบรรทัด (ลูกค้า · ออเดอร์ · เมนู) */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 p-3.5">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </Card>
  );
}

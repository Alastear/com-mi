import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ดาวแบบอ่านอย่างเดียว — ไม่มี hook ใช้ได้ทั้ง server และ client component
 *
 * `label` ต้องมาจากผู้เรียก (ผ่านพจนานุกรม) — ดาวห้าดวงสำหรับโปรแกรมอ่านหน้าจอคือ
 * รูปห้ารูปที่ไม่มีความหมาย ต้องอ่านเป็น "4 จาก 5 ดาว" ทีเดียว
 */
export function Stars({
  rating,
  label,
  className,
}: {
  /** 1–5 จำนวนเต็ม — ค่าเฉลี่ยของร้านโชว์เป็นตัวเลข ไม่ใช่ดาวครึ่งดวง */
  rating: number;
  label: string;
  className?: string;
}) {
  return (
    <span role="img" aria-label={label} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn(
            "size-3.5",
            n <= rating ? "fill-warning text-warning" : "fill-transparent text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}

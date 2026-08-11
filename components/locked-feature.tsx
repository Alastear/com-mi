"use client";

import Link from "next/link";
import { Hammer, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDict } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * ครอบฟีเจอร์ที่ยังใช้ไม่ได้ — เบลอเนื้อหาไว้ข้างหลังแทนที่จะซ่อน
 *
 * เหตุผลอยู่ใน docs/03-plans-and-entitlements.md §4.3:
 * ผู้ใช้ต้อง "เห็นว่ามีอะไรให้ปลด" ไม่ใช่เจอหน้าว่าง
 * และนี่เป็นแค่ชั้น UI เท่านั้น — การบังคับจริงต้องอยู่ใน Server Action
 *
 * ⚠️ **`variant` ต้องตรงกับความจริง ไม่ใช่ตรงกับแผนการขาย**
 *
 * `"pro"` = ของมีอยู่จริง จ่ายแล้วได้ใช้ทันที
 * `"soon"` = **ยังไม่ได้สร้าง** จ่ายไปก็ไม่ได้อะไร ข้างหลังเป็นภาพตัวอย่าง ไม่ใช่ข้อมูลจริง
 *
 * ที่ต้องแยกเพราะเดิมทุกที่ขึ้นว่า "อยู่ในแพ็กเกจ Pro — อัปเกรดเลย" เหมือนกันหมด
 * ทั้งที่สามหน้า (ลูกค้า / สถิติ / ประมูล) ยังไม่มีของอยู่หลังกำแพงนั้นเลยสักหน้า
 * คนที่กดอัปเกรดเพราะอยากได้สถิติจะจ่ายเงินแล้วเจอกำแพงเดิม
 * ยิ่งช่วงเบต้าที่ยกให้ทุกคนเป็น Pro ฟรีอยู่แล้ว ปุ่ม "อัปเกรด" ยิ่งไม่มีความหมาย
 */
export function LockedFeature({
  children,
  title,
  description,
  className,
  variant = "pro",
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  variant?: "pro" | "soon";
}) {
  const t = useDict();
  const soon = variant === "soon";
  const Icon = soon ? Hammer : Lock;

  return (
    // ทั้งสองชั้นวางซ้อนกันในกริดช่องเดียวกัน ไม่ใช้ absolute
    // → ความสูงของกล่องคิดจากชั้นที่สูงกว่า ทำให้ overlay ไม่โดนตัดเมื่อเนื้อหาข้างหลังเตี้ย
    //   (ของเดิม overlay เป็น absolute จึงไม่มีความสูง ปุ่มอัปเกรดถูก overflow-hidden ตัดหาย
    //    เมื่อใช้กับการ์ดเตี้ย ๆ อย่าง Milestones ในหน้าออเดอร์)
    <div
      className={cn(
        // grid-cols-[minmax(0,1fr)] กันไม่ให้เนื้อหาที่เบลออยู่ข้างหลังดันความกว้างของแถวจนล้นจอ
        // (เจอที่หน้า analytics ความกว้าง 320px — กราฟข้างในกว้างกว่าคอนเทนเนอร์)
        "grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl border *:col-start-1 *:row-start-1",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none min-w-0 select-none overflow-hidden *:h-full blur-[5px] saturate-50 opacity-55"
      >
        {children}
      </div>

      <div className="grid place-items-center bg-background/55 p-6 backdrop-blur-[2px]">
        <div className="max-w-xs text-center">
          <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full border border-primary/30 bg-primary/10">
            <Icon className="size-4 text-primary" />
          </div>
          <p className="font-medium">{title ?? (soon ? t.locked.soonTitle : t.locked.title)}</p>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
          {/*
            ยังไม่มีของ = ไม่มีปุ่มให้กด ปุ่มที่พาไปหน้าราคาโดยที่จ่ายแล้วไม่ได้อะไร
            คือการขายของที่ยังไม่มี
          */}
          {soon ? (
            <p className="mt-3 text-xs text-muted-foreground">{t.locked.soonNote}</p>
          ) : (
            <Button asChild size="sm" className="mt-4">
              <Link href="/pricing">{t.locked.cta}</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** ป้าย "Pro" เล็ก ๆ สำหรับวางข้างเมนูหรือปุ่ม */
export function ProBadge({ className }: { className?: string }) {
  const t = useDict();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase",
        className,
      )}
    >
      <Lock className="size-2.5" />
      {t.plan.pro}
    </span>
  );
}

"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDict } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * ครอบฟีเจอร์ Pro — เบลอเนื้อหาจริงไว้ข้างหลังแทนที่จะซ่อน
 *
 * เหตุผลอยู่ใน docs/03-plans-and-entitlements.md §4.3:
 * ผู้ใช้ต้อง "เห็นว่ามีอะไรให้ปลด" ไม่ใช่เจอหน้าว่าง
 * และนี่เป็นแค่ชั้น UI เท่านั้น — การบังคับจริงต้องอยู่ใน Server Action
 */
export function LockedFeature({
  children,
  title,
  description,
  className,
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
}) {
  const t = useDict();

  return (
    // ทั้งสองชั้นวางซ้อนกันในกริดช่องเดียวกัน ไม่ใช้ absolute
    // → ความสูงของกล่องคิดจากชั้นที่สูงกว่า ทำให้ overlay ไม่โดนตัดเมื่อเนื้อหาข้างหลังเตี้ย
    //   (ของเดิม overlay เป็น absolute จึงไม่มีความสูง ปุ่มอัปเกรดถูก overflow-hidden ตัดหาย
    //    เมื่อใช้กับการ์ดเตี้ย ๆ อย่าง Milestones ในหน้าออเดอร์)
    <div className={cn("grid overflow-hidden rounded-xl border *:col-start-1 *:row-start-1", className)}>
      <div
        aria-hidden
        className="pointer-events-none select-none *:h-full blur-[5px] saturate-50 opacity-55"
      >
        {children}
      </div>

      <div className="grid place-items-center bg-background/55 p-6 backdrop-blur-[2px]">
        <div className="max-w-xs text-center">
          <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full border border-primary/30 bg-primary/10">
            <Lock className="size-4 text-primary" />
          </div>
          <p className="font-medium">{title ?? t.locked.title}</p>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
          <Button asChild size="sm" className="mt-4">
            <Link href="/pricing">{t.locked.cta}</Link>
          </Button>
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

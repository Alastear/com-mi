"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDict } from "@/lib/i18n/client";
import { allowedNext, type Actor } from "@/lib/orders/state-machine";
import { actionLabel, isPrimaryAction } from "@/lib/orders/labels";
import { transitionOrder } from "@/lib/orders/actions";
import type { OrderStatus } from "@/lib/types";

/**
 * ปุ่มบนแถบล่างของหน้าออเดอร์
 *
 * **ทุกปุ่มมาจาก `allowedNext(status, actor)` ไม่มีรายการที่เขียนตายไว้เลย**
 * ถ้า hardcode ไว้ วันที่แก้ state machine จะเหลือปุ่มที่กดแล้วเซิร์ฟเวอร์ปฏิเสธ
 * หรือหายไปทั้งที่ยังทำได้ — และผู้ใช้จะเจอปัญหาก่อนเราเสมอ
 *
 * `actor` ส่งมาจากฝั่ง server ที่ตรวจจาก session แล้ว ตรงนี้ใช้แค่วาดปุ่ม
 * ส่วนการตรวจสิทธิ์จริงอยู่ใน `transitionOrder` ซึ่งไม่เชื่อค่าจาก client เลย
 */
export function OrderActions({
  code,
  status,
  actor,
}: {
  code: string;
  status: OrderStatus;
  actor: Actor;
}) {
  const t = useDict();
  const router = useRouter();
  const [pending, start] = useTransition();

  const targets = allowedNext(status, actor);
  if (targets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.orderAction.noActions}</p>;
  }

  function move(to: OrderStatus) {
    start(async () => {
      const res = await transitionOrder({ code, to });
      if (res.ok) {
        toast.success(t.orderStatus[to]);
        router.refresh();
      } else {
        toast.error(
          res.error === "stale"
            ? t.order.moveStale
            : res.error === "wrong_actor" || res.error === "not_allowed"
              ? t.order.moveNotAllowed
              : t.error.title,
        );
      }
    });
  }

  // ปุ่มหลักไว้ขวาสุดเพื่อให้อยู่ใกล้นิ้วโป้งบนมือถือ ส่วนปุ่มทำลายอยู่ซ้ายและไม่เด่น
  const destructive = targets.filter((to) => !isPrimaryAction(to));
  const primary = targets.filter(isPrimaryAction);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {destructive.map((to) => (
        <Button
          key={to}
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => move(to)}
          className="text-muted-foreground hover:text-destructive"
        >
          {actionLabel(t, to, actor)}
        </Button>
      ))}

      <div className="ml-auto flex flex-wrap gap-2">
        {primary.map((to, i) => (
          <Button
            key={to}
            // ปุ่มเด่นได้ใบเดียว ไม่งั้นไม่มีใครรู้ว่าปกติควรกดอันไหน
            variant={i === primary.length - 1 ? "default" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() => move(to)}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {actionLabel(t, to, actor)}
          </Button>
        ))}
      </div>
    </div>
  );
}

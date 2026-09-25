"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/format";
import { allowedNext, type Actor } from "@/lib/orders/state-machine";
import { actionLabel, isPrimaryAction } from "@/lib/orders/labels";
import { needsMoneyConfirm, type MoneyMoved } from "@/lib/orders/cancel";
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
 *
 * ยกเลิกออเดอร์ที่มีเงินเกี่ยวข้อง (`money` ไม่ใช่ null) ต้องผ่าน dialog ก่อนเสมอ
 * บอกยอดที่จ่ายแล้ว และบอกตรง ๆ ว่าแพลตฟอร์มไม่ได้ถือเงิน คืนเงินให้ไม่ได้
 * — เดิมกดครั้งเดียวยกเลิกทันที ทั้งที่เงินอยู่ในบัญชีครีเอเตอร์ไปแล้ว
 * ⚠️ dialog เป็นแค่การเตือน ไม่ใช่ด่าน — server ไม่ได้บังคับให้ต้องผ่าน dialog
 */
export function OrderActions({
  code,
  status,
  actor,
  money = null,
  currency = "THB",
}: {
  code: string;
  status: OrderStatus;
  actor: Actor;
  /** เงินที่ขยับไปแล้ว — มาจาก `moneyMoved()` ฝั่ง server */
  money?: MoneyMoved | null;
  currency?: string;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  // ปลายทางที่รอให้กดยืนยันใน dialog — null = dialog ปิด
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);

  const targets = allowedNext(status, actor);
  if (targets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.orderAction.noActions}</p>;
  }

  function move(to: OrderStatus) {
    start(async () => {
      const res = await transitionOrder({ code, to });
      // ปิด dialog ทั้งตอนสำเร็จและล้มเหลว — ล้มเหลวแล้ว toast บอกเหตุผลอยู่แล้ว
      // ค้าง dialog ไว้จะทำให้คนกดยืนยันซ้ำกับสถานะที่เปลี่ยนไปแล้ว
      setConfirming(null);
      if (res.ok) {
        toast.success(t.orderStatus[to]);
        router.refresh();
      } else {
        toast.error(
          res.error === "stale"
            ? t.order.moveStale
            : res.error === "deposit_unpaid"
              ? t.order.depositUnpaid
              : res.error === "not_fully_paid"
                ? t.order.notFullyPaid
                : res.error === "no_files"
                  ? t.order.moveNoFiles
                : res.error === "wrong_actor" || res.error === "not_allowed"
                  ? t.order.moveNotAllowed
                  : t.error.title,
        );
      }
    });
  }

  function press(to: OrderStatus) {
    if (needsMoneyConfirm(to, money)) setConfirming(to);
    else move(to);
  }

  // ปุ่มหลักไว้ขวาสุดเพื่อให้อยู่ใกล้นิ้วโป้งบนมือถือ ส่วนปุ่มทำลายอยู่ซ้ายและไม่เด่น
  const destructive = targets.filter((to) => !isPrimaryAction(to));
  const primary = targets.filter(isPrimaryAction);
  const fmt = (cents: number) => formatMoney(cents, currency, locale);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {destructive.map((to) => (
        <Button
          key={to}
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => press(to)}
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
            onClick={() => press(to)}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {actionLabel(t, to, actor)}
          </Button>
        ))}
      </div>

      {money ? (
        <Dialog
          open={confirming !== null}
          // ระหว่างส่งห้ามปิด — ปิดไปแล้วคนจะคิดว่ายกเลิกไม่สำเร็จแล้วกดใหม่
          onOpenChange={(open) => {
            if (!open && !pending) setConfirming(null);
          }}
        >
          <DialogContent showCloseButton={!pending}>
            <DialogHeader>
              <DialogTitle>{t.orderAction.cancelConfirmTitle}</DialogTitle>
              <DialogDescription className="font-medium text-foreground">
                {money.paidCents > 0
                  ? fill(t.orderAction.cancelPaid, { amount: fmt(money.paidCents) })
                  : t.orderAction.cancelNonePaid}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm leading-relaxed">
              {money.pendingCents > 0 ? (
                <p className="text-warning">
                  {fill(
                    actor === "creator"
                      ? t.orderAction.cancelPendingCreator
                      : t.orderAction.cancelPendingClient,
                    { amount: fmt(money.pendingCents) },
                  )}
                </p>
              ) : null}
              <p>{actor === "creator" ? t.payment.noRefundCreator : t.payment.noRefundClient}</p>
              <p className="text-muted-foreground">{t.orderAction.cancelHistoryKept}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={pending} onClick={() => setConfirming(null)}>
                {t.orderAction.cancelKeep}
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => (confirming ? move(confirming) : undefined)}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {t.orderAction.cancelConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

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
import { moneyAckFrom, needsMoneyConfirm, type MoneyMoved } from "@/lib/orders/cancel";
import { consumesRevision, revisionHint, revisionQuota } from "@/lib/orders/revisions";
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
 *
 * ปุ่มขอแก้ไขมีสิทธิ์ที่เหลือเขียนไว้ข้าง ๆ เสมอ (ลูกค้าต้องรู้ก่อนกดว่ากดแล้วนับ)
 * ใช้ครบแล้วเอาปุ่มออกแล้วบอกให้ไปคุยในแชทแทน — ด่านจริงอยู่ที่ `transitionOrder`
 */
export function OrderActions({
  code,
  status,
  version,
  actor,
  money = null,
  currency = "THB",
  revisions = null,
}: {
  code: string;
  status: OrderStatus;
  /** `orderVersion(order.updatedAt)` ตอนวาดหน้านี้ — ส่งคู่กับ `status` ให้ server จับแท็บค้าง */
  version: number;
  actor: Actor;
  /** เงินที่ขยับไปแล้ว — มาจาก `moneyMoved()` ฝั่ง server */
  money?: MoneyMoved | null;
  currency?: string;
  /** โควตารอบแก้ของออเดอร์ — ส่งมาเฉพาะฝั่งลูกค้า ซึ่งเป็นฝั่งเดียวที่กดขอแก้ได้ */
  revisions?: { used: number; allowed: number } | null;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  // ปลายทางที่รอให้กดยืนยันใน dialog — null = dialog ปิด
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);

  const next = allowedNext(status, actor);
  if (next.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.orderAction.noActions}</p>;
  }

  // ข้อความโควตาขึ้นเฉพาะตอนที่ปุ่มขอแก้ไขมีอยู่จริงในสถานะนี้ — สถานะอื่นไม่ต้องรก
  const revision =
    revisions && next.some((to) => consumesRevision(to, actor))
      ? revisionHint(t, revisionQuota(revisions.used, revisions.allowed))
      : null;
  // สิทธิ์หมด = ไม่มีปุ่มให้กดแล้วโดนปฏิเสธ — ข้อความข้างล่างอธิบายแทน
  const targets = revision?.blocked ? next.filter((to) => !consumesRevision(to, actor)) : next;

  function move(to: OrderStatus) {
    start(async () => {
      /**
       * ส่งสถานะและรุ่นที่หน้านี้วาดอยู่ไปด้วยเสมอ — server ปฏิเสธ (`stale`) ถ้าของจริงเปลี่ยนไปแล้ว
       * ไม่งั้นแท็บที่เปิดค้างจะกดขอแก้ไขกับรอบงานที่ลูกค้าไม่เคยเห็น แล้วเสียสิทธิ์ไปฟรี ๆ
       * (สถานะอย่างเดียวไม่พอ: in_review รอบใหม่ก็ชื่อ in_review — ดู `version` ใน transitionOrder)
       * ยกเลิกต้องบอก server ด้วยว่าเห็นเงินเท่าไร — ถ้าไม่ตรงของจริง server ปฏิเสธ (money_changed)
       */
      const res = await transitionOrder(
        to === "cancelled"
          ? { code, from: status, version, to, moneyAck: moneyAckFrom(money) }
          : { code, from: status, version, to },
      );
      // ปิด dialog ทั้งตอนสำเร็จและล้มเหลว — ล้มเหลวแล้ว toast บอกเหตุผลอยู่แล้ว
      // ค้าง dialog ไว้จะทำให้คนกดยืนยันซ้ำกับสถานะที่เปลี่ยนไปแล้ว
      setConfirming(null);
      if (res.ok) {
        toast.success(t.orderStatus[to]);
        router.refresh();
      } else {
        toast.error(
          res.error === "money_changed"
            ? t.order.moneyChanged
            : res.error === "stale"
            ? t.order.moveStale
            : res.error === "deposit_unpaid"
              ? t.order.depositUnpaid
              : res.error === "not_fully_paid"
                ? t.order.notFullyPaid
                : res.error === "no_files"
                  ? t.order.moveNoFiles
                : res.error === "revisions_exhausted"
                  ? t.order.revisionsExhausted
                : res.error === "wrong_actor" || res.error === "not_allowed"
                  ? t.order.moveNotAllowed
                  : t.error.title,
        );
        /**
         * ล้มเหลวแบบไหนก็แปลว่าหน้าจอถือของเก่าอยู่ — สถานะ เงิน หรือโควตาเปลี่ยนไปแล้ว
         * รีเฟรชเสมอ ไม่ใช่แค่บางแบบ: เดิม `stale`/`not_allowed` หลังกดยืนยันยกเลิกใน dialog
         * ปิด dialog แล้วทิ้งปุ่มเดิมไว้ คนกดซ้ำก็เจอ error เดิมซ้ำ ทั้งที่ของจริงไปไกลแล้ว
         */
        if (res.error !== "invalid") router.refresh();
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
          {actionLabel(t, to, actor, status)}
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
            {actionLabel(t, to, actor, status)}
          </Button>
        ))}
      </div>

      {revision ? (
        <p
          className={
            revision.blocked
              ? "w-full text-sm text-muted-foreground"
              : "w-full text-xs text-muted-foreground sm:text-right"
          }
        >
          {revision.text}
        </p>
      ) : null}

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

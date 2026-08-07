"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useLocale } from "@/lib/i18n/client";
import { formatMoney, formatRelative } from "@/lib/format";
import { confirmPayment, recordPayment } from "@/lib/payments/actions";

export type PaymentRow = {
  id: string;
  amountCents: number;
  method: string;
  paidAt: string;
  verified: boolean;
  note: string;
};

/**
 * แผงชำระเงินบนหน้าออเดอร์ — ฝั่งลูกค้ากับฝั่งครีเอเตอร์ใช้ตัวเดียวกัน
 *
 * ลูกค้าเห็น: ยอดที่ต้องจ่าย + ปุ่ม "แจ้งว่าโอนแล้ว"
 * ครีเอเตอร์เห็น: รายการที่ลูกค้าแจ้ง + ปุ่มยืนยันทีละรายการ
 *
 * ⚠️ ปุ่มของครีเอเตอร์ถามว่า **"เงินเข้าบัญชีจริงหรือยัง"** ไม่ใช่ "สลิปถูกไหม"
 * ต่างกันที่คำเดียวแต่เปลี่ยนสิ่งที่คนไปตรวจ — สลิปปลอมดูด้วยตาไม่ออกแล้ว
 * ส่วนยอดในแอปธนาคารของตัวเองปลอมไม่ได้ (docs/00 §5.2.1)
 */
export function PaymentPanel({
  code,
  viewer,
  totalCents,
  paidCents,
  depositCents,
  currency,
  payments,
  qr,
  hasPayout,
}: {
  code: string;
  viewer: "creator" | "client";
  totalCents: number;
  paidCents: number;
  depositCents: number;
  currency: string;
  payments: PaymentRow[];
  /** QR สร้างฝั่ง server ส่งมาเป็น element — ฝั่ง client ไม่เคยเห็นหมายเลขดิบ */
  qr?: React.ReactNode;
  /** ครีเอเตอร์ตั้งค่าหมายเลขรับเงินแล้วหรือยัง — ถ้ายัง ลูกค้าโอนไม่ได้เลย */
  hasPayout: boolean;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  const remaining = Math.max(0, totalCents - paidCents);
  // ยังไม่ถึงมัดจำ = ยอดที่ควรโอนรอบนี้คือมัดจำ ไม่ใช่ยอดเต็ม
  const dueNow = depositCents > 0 && paidCents < depositCents ? depositCents - paidCents : remaining;
  const dueIsDeposit = depositCents > 0 && paidCents < depositCents;

  function report() {
    start(async () => {
      const res = await recordPayment({
        code,
        amountCents: dueNow,
        method: "promptpay",
        proofMediaId: null,
        note: "",
      });
      if (res.ok) {
        toast.success(t.payment.awaitingConfirm);
        router.refresh();
      } else {
        toast.error(t.error.title);
      }
    });
  }

  function confirm(paymentId: string) {
    start(async () => {
      const res = await confirmPayment(code, paymentId);
      if (res.ok) {
        toast.success(t.payment.confirmed);
        router.refresh();
      } else {
        toast.error(t.error.title);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">
          {dueIsDeposit ? t.payment.depositDue : t.payment.amountDue}
        </span>
        <span className="tabular text-lg font-semibold">
          {formatMoney(dueNow, currency, locale)}
        </span>
      </div>

      {remaining === 0 ? (
        <Badge variant="secondary" className="gap-1.5">
          <CheckCircle2 className="size-3.5" />
          {t.order.fullyPaid}
        </Badge>
      ) : viewer === "client" ? (
        hasPayout ? (
          <>
            {qr}
            <Button onClick={report} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t.payment.iPaid}
            </Button>
          </>
        ) : (
          // ครีเอเตอร์ยังไม่ตั้งค่ารับเงิน — บอกลูกค้าตรง ๆ ดีกว่าโชว์ปุ่มที่กดแล้วงง
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            {t.payment.noPayouts}
          </p>
        )
      ) : null}

      {payments.length > 0 ? (
        <>
          <Separator />
          <p className="text-sm font-medium">{t.payment.history}</p>
          <ul className="space-y-2">
            {payments.map((p) => (
              <li key={p.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="tabular text-sm font-medium">
                    {formatMoney(p.amountCents, currency, locale)}
                  </span>
                  {p.verified ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="size-3" />
                      {t.payment.confirmed}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-warning">
                      <Clock className="size-3" />
                      {t.payment.awaitingConfirm}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.payment.recordedAt} {formatRelative(p.paidAt, locale)}
                </p>

                {viewer === "creator" && !p.verified ? (
                  <div className="mt-2.5">
                    {/*
                      คำอธิบายอยู่เหนือปุ่มเสมอ ไม่ใช่ tooltip — คนกดต้องอ่านก่อนกด
                      ไม่ใช่หลังจากสงสัยแล้วไปหาเอง
                    */}
                    <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                      {t.payment.confirmReceivedHint}
                    </p>
                    <Button size="sm" disabled={pending} onClick={() => confirm(p.id)}>
                      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                      {t.payment.confirmReceived}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : viewer === "creator" ? (
        <p className="text-sm text-muted-foreground">{t.payment.empty}</p>
      ) : null}

      {viewer === "creator" && !hasPayout ? (
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-sm">{t.payment.noPayoutsCreator}</p>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link href="/settings">{t.payment.setup}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

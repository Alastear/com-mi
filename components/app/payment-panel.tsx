"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/lib/i18n/client";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import { formatMoney, formatRelative } from "@/lib/format";
import { newId } from "@/lib/db/id";
import {
  confirmPayment,
  recordPayment,
  rejectPayment,
  voidPayment,
  type PaymentResult,
} from "@/lib/payments/actions";
import {
  dueNowCents,
  fitsUnderTotal,
  outstandingCents,
  parseBaht,
  toBahtInput,
  type PaymentState,
} from "@/lib/payments/money";
import { cn } from "@/lib/utils";

export type PaymentRow = {
  id: string;
  amountCents: number;
  method: string;
  paidAt: string;
  state: PaymentState;
  /** เหตุผลที่ครีเอเตอร์ให้ตอนตอบว่ายังไม่ได้รับ / ยกเลิกการยืนยัน — ว่างได้ */
  reason: string;
  note: string;
};

type Failure = Extract<PaymentResult, { ok: false }>["error"];

function errorText(t: Dictionary, error: Failure): string {
  switch (error) {
    case "pending_exists":
      return t.payment.errPending;
    case "approval_required":
      return t.payment.awaitingWorkApproval;
    case "over_outstanding":
      return t.payment.errOverOutstanding;
    case "over_total":
      return t.payment.errOverTotal;
    case "stale":
      return t.payment.errStale;
    case "rate_limited":
      return t.payment.errRateLimited;
    case "order_closed":
      return t.payment.errClosed;
    default:
      return t.error.title;
  }
}

/**
 * error ที่แปลว่า "ตัวเลขบนหน้าจอเก่าแล้ว" — อีกแท็บหรืออีกฝ่ายเปลี่ยนแถวเงินหรือยอดที่ยืนยันไปแล้ว
 *
 * `over_outstanding` / `over_total` อยู่ในนี้ด้วย: ยอดคงค้างบนหน้าจอคือเพดานของช่องกรอก
 * และเป็นตัวตัดสินว่าปุ่มยืนยันกดได้ไหม (`fits`) ถ้าไม่รีเฟรช ฟอร์มจะยังยอมให้กดยอดเดิม
 * แล้วได้ error เดิมซ้ำ
 *
 * `order_closed` ด้วย: อีกฝ่ายเพิ่งยกเลิกออเดอร์ หน้านี้ยังโชว์ปุ่มเงินของออเดอร์ที่เปิดอยู่
 * รีเฟรชแล้วแผงจะกลายเป็นประวัติแบบอ่านอย่างเดียวพร้อมบอกว่าออเดอร์จบแบบไหน
 */
const REFRESH_ON: ReadonlySet<Failure> = new Set<Failure>([
  "stale",
  "pending_exists",
  "approval_required",
  "over_outstanding",
  "over_total",
  "order_closed",
]);

/**
 * เรียก action แล้วจัดการผลแบบเดียวกันทุกปุ่ม — toast + รีเฟรชหน้า
 *
 * error ที่แปลว่า "หน้าจอเก่าแล้ว" (`REFRESH_ON`) รีเฟรชให้เลย ไม่งั้นคนจะกดปุ่มเดิมซ้ำ
 * แล้วเจอ error เดิมไปเรื่อย ๆ ทั้งที่ของจริงเปลี่ยนไปแล้ว
 */
function usePaymentAction() {
  const { t } = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(action: () => Promise<PaymentResult>, success: string, onOk?: () => void) {
    start(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        onOk?.();
        router.refresh();
      } else {
        toast.error(errorText(t, res.error));
        if (REFRESH_ON.has(res.error)) router.refresh();
      }
    });
  }

  return [pending, run] as const;
}

/**
 * แผงชำระเงินบนหน้าออเดอร์ — ฝั่งลูกค้ากับฝั่งครีเอเตอร์ใช้ตัวเดียวกัน
 *
 * ลูกค้าเห็น: ยอดที่ต้องจ่าย + QR + ช่องยอดที่โอนจริง + ปุ่ม "แจ้งว่าโอนแล้ว"
 *   ระหว่างมีรายการรอยืนยัน QR กับปุ่มหายไป เหลือแค่ "แจ้งโอน ฿X แล้ว รอยืนยัน"
 * ครีเอเตอร์เห็น: รายการที่ลูกค้าแจ้ง + ยืนยัน / ยังไม่ได้รับ / ยกเลิกการยืนยัน
 *   และบันทึกเงินที่ได้รับเองได้ — ยกเว้นระหว่างที่ลูกค้ามีรายการรอตอบ (ต้องตอบรายการนั้นก่อน)
 *
 * ⚠️ ปุ่มของครีเอเตอร์ถามว่า **"เงินเข้าบัญชีจริงหรือยัง"** ไม่ใช่ "สลิปถูกไหม"
 * ต่างกันที่คำเดียวแต่เปลี่ยนสิ่งที่คนไปตรวจ — สลิปปลอมดูด้วยตาไม่ออกแล้ว
 * ส่วนยอดในแอปธนาคารของตัวเองปลอมไม่ได้ (docs/00 §5.2.1)
 *
 * `closed` = ออเดอร์จบแล้ว (ดู `paymentMode()`): เหลือแค่ยอดที่ยืนยันแล้วกับรายการทั้งหมด
 * แบบอ่านอย่างเดียว ไม่มี QR ไม่มีฟอร์ม ไม่มีปุ่มยืนยัน/ปฏิเสธ/ยกเลิกการยืนยัน
 * รายการต้องยังอยู่ — หลังยกเลิกคือเวลาที่ทั้งสองฝั่งต้องใช้มันคุยเรื่องคืนเงิน
 *
 * ⚠️ ทุกอย่างที่ซ่อน/ปิดปุ่มที่นี่เป็นแค่ความสะดวก ด่านจริงอยู่ใน lib/payments/actions.ts
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
  channels = [],
  finalApproved = false,
  closed = false,
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
  channels?: Array<{ method: "promptpay" | "bank_transfer" | "true_wallet"; label: string; details: React.ReactNode }>;
  finalApproved?: boolean;
  /** ออเดอร์จบแล้ว — ประวัติอ่านอย่างเดียว ไม่มีปุ่มขยับเงิน */
  closed?: boolean;
}) {
  const { t, locale } = useLocale();
  const money = (cents: number) => formatMoney(cents, currency, locale);

  const order = { totalCents, amountPaidCents: paidCents, depositCents };
  const outstanding = outstandingCents(order);
  // ยังไม่ถึงมัดจำ = ยอดที่ควรโอนรอบนี้คือมัดจำ ไม่ใช่ยอดเต็ม
  const dueNow = dueNowCents(order);
  const dueIsDeposit = depositCents > 0 && paidCents < depositCents;
  // มีได้แถวเดียว — server ไม่รับแจ้งเพิ่มระหว่างที่ยังมีรายการรอตอบ
  const pendingReport = payments.find((p) => p.state === "pending");

  if (closed) {
    return (
      <div className="space-y-4">
        {/*
          ยอดที่ยืนยันแล้ว ไม่ใช่ "ยอดที่ต้องชำระ" — ออเดอร์ที่ปิดแล้วไม่มีใครต้องจ่ายอะไรอีก
          โชว์ยอดค้างบนออเดอร์ที่ยกเลิกแล้ว = ลูกค้าอ่านว่ายังติดเงินอยู่
        */}
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">{t.order.paid}</span>
          <span className="tabular text-lg font-semibold">{money(paidCents)}</span>
        </div>
        {payments.length > 0 ? (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium">{t.payment.history}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {t.payment.historyClosed}
              </p>
            </div>
            <ul className="space-y-2">
              {payments.map((p) => (
                <PaymentItem
                  key={p.id}
                  code={code}
                  row={p}
                  viewer={viewer}
                  fits={false}
                  money={money}
                  readOnly
                />
              ))}
            </ul>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">
          {dueIsDeposit ? t.payment.depositDue : t.payment.amountDue}
        </span>
        <span className="tabular text-lg font-semibold">{money(dueNow)}</span>
      </div>

      {outstanding === 0 ? (
        <Badge variant="secondary" className="gap-1.5">
          <CheckCircle2 className="size-3.5" />
          {t.order.fullyPaid}
        </Badge>
      ) : viewer === "client" ? (
        pendingReport ? (
          /*
            ระหว่างรอ ไม่มี QR และไม่มีปุ่มให้กดอีก — เดิมกดซ้ำได้เรื่อย ๆ แล้วครีเอเตอร์
            ที่ยืนยันทุกแถวจะปลดไฟล์ทั้งที่เงินเข้าจริงก้อนเดียว
          */
          <div className="rounded-lg border border-dashed p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Clock className="size-4 shrink-0 text-warning" />
              {fill(t.payment.reportedPending, { amount: money(pendingReport.amountCents) })}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t.payment.reportedPendingHint}
            </p>
          </div>
        ) : !dueIsDeposit && !finalApproved ? (
          <p className="rounded-lg border bg-muted/30 p-3 text-sm">{locale === "th" ? "กรุณาตรวจและยืนยันภาพตัวอย่างงานก่อนแจ้งชำระยอดสุดท้าย" : "Review and approve the preview before reporting the final payment."}</p>
        ) : hasPayout ? (
          <ReportForm
            code={code}
            qr={qr}
            dueNow={dueNow}
            outstanding={outstanding}
            money={money}
            channels={channels}
          />
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
              <PaymentItem
                key={p.id}
                code={code}
                row={p}
                viewer={viewer}
                // ยืนยันแถวนี้แล้วเกินราคางานไหม — server ปฏิเสธอยู่แล้ว แต่บอกก่อนกดดีกว่า
                fits={fitsUnderTotal(p.amountCents, paidCents, totalCents)}
                awaitingApproval={!finalApproved && p.amountCents + paidCents >= totalCents}
                money={money}
              />
            ))}
          </ul>
        </>
      ) : viewer === "creator" ? (
        <p className="text-sm text-muted-foreground">{t.payment.empty}</p>
      ) : null}

      {viewer === "creator" && outstanding > 0 && dueIsDeposit ? (
        pendingReport ? (
          /*
            ระหว่างที่ลูกค้ามีรายการรอตอบ ไม่มีฟอร์มบันทึกเอง — server ก็ไม่รับ (`pending_exists`)
            เงินก้อนที่ลูกค้าแจ้งกับก้อนที่ครีเอเตอร์เห็นทางไลน์มักเป็นก้อนเดียวกัน
            ถ้าบันทึกเองแล้วกดยืนยันรายการนั้นด้วย จะนับเงินก้อนเดียวสองครั้ง
          */
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t.payment.recordBlockedPending}
          </p>
        ) : (
          <RecordForm code={code} dueNow={dueNow} outstanding={Math.min(outstanding, depositCents - paidCents)} money={money} />
        )
      ) : null}

      {viewer === "creator" && outstanding > 0 && !dueIsDeposit && !pendingReport ? (
        <p className="rounded-lg border bg-muted/30 p-3 text-sm">
          {locale === "th" ? "รอลูกค้ากดแจ้งชำระยอดสุดท้ายก่อน จึงจะยืนยันรับเงินได้ ตรวจยอดเงินเข้าบัญชีจริงก่อนยืนยัน" : "Wait for the client's final payment report before confirming receipt. Check your account balance before confirming."}
        </p>
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

/**
 * ช่องยอดเงินเป็นบาทเต็ม — ใช้ทั้งฟอร์มแจ้งโอนของลูกค้าและฟอร์มบันทึกรับเงินของครีเอเตอร์
 * คืนยอดเป็นสตางค์ หรือข้อความ error ที่พร้อมโชว์
 */
function useBahtField(initialCents: number, maxCents: number, money: (c: number) => string) {
  const { t } = useLocale();
  const [value, setValue] = useState(() => toBahtInput(initialCents));
  const cents = parseBaht(value);
  const error =
    cents === null
      ? t.payment.amountInvalid
      : cents > maxCents
        ? fill(t.payment.amountOver, { amount: money(maxCents) })
        : null;
  return { value, setValue, cents, error };
}

/**
 * id ของแถวที่กำลังจะสร้าง — ใช้เป็น idempotency key ของ `recordPayment`
 *
 * สร้างตอนกดครั้งแรกแล้วเก็บไว้จนกว่าจะสำเร็จ: กดซ้ำหรือส่งใหม่หลังเน็ตหลุด
 * ได้แถวเดียวเสมอ สำเร็จแล้วค่อยล้าง รายการถัดไปจะได้ id ใหม่
 */
function useRequestId() {
  const ref = useRef<string | null>(null);
  return {
    take: () => (ref.current ??= newId("pay")),
    reset: () => {
      ref.current = null;
    },
  };
}

function ReportForm({
  code,
  qr,
  dueNow,
  outstanding,
  money,
  channels,
}: {
  code: string;
  qr: React.ReactNode;
  dueNow: number;
  outstanding: number;
  money: (c: number) => string;
  channels: Array<{ method: "promptpay" | "bank_transfer" | "true_wallet"; label: string; details: React.ReactNode }>;
}) {
  const { t } = useLocale();
  const [pending, run] = usePaymentAction();
  const amount = useBahtField(dueNow, outstanding, money);
  const requestId = useRequestId();
  const [method, setMethod] = useState<"promptpay" | "bank_transfer" | "true_wallet">(channels[0]?.method ?? "promptpay");
  const selected = channels.find(c => c.method === method) ?? channels[0];

  function report() {
    if (amount.cents === null || amount.error) return;
    const amountCents = amount.cents;
    run(
      () =>
        recordPayment({
          code,
          amountCents,
          method: selected?.method ?? method,
          proofMediaId: null,
          note: "",
          paymentId: requestId.take(),
        }),
      t.payment.awaitingConfirm,
      requestId.reset,
    );
  }

  return (
    <>
      {channels.length > 1 ? <div className="flex flex-wrap gap-2">{channels.map(c => <Button type="button" key={c.method} variant={(selected?.method ?? method) === c.method ? "default" : "outline"} size="sm" aria-pressed={(selected?.method ?? method) === c.method} onClick={() => setMethod(c.method)}>{c.label}</Button>)}</div> : null}
      {selected?.method === "promptpay" || !selected ? qr : selected.details}
      <div>
        <Label htmlFor="pay-amount" className="text-sm">
          {t.payment.amountSent}
        </Label>
        <Input
          id="pay-amount"
          value={amount.value}
          onChange={(e) => amount.setValue(e.target.value.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={amount.error ? true : undefined}
          aria-describedby="pay-amount-hint"
          className="tabular mt-1.5 text-right"
        />
        <p
          id="pay-amount-hint"
          className={cn(
            "mt-1 text-xs leading-relaxed",
            amount.error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {amount.error ?? t.payment.amountSentHint}
        </p>
      </div>
      <Button onClick={report} disabled={pending || amount.error !== null} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {t.payment.iPaid}
      </Button>
    </>
  );
}

function StateBadge({ state }: { state: PaymentState }) {
  const { t } = useLocale();
  switch (state) {
    case "verified":
      return (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="size-3" />
          {t.payment.confirmed}
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="size-3" />
          {t.payment.stateRejected}
        </Badge>
      );
    case "voided":
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Undo2 className="size-3" />
          {t.payment.stateVoided}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1 text-warning">
          <Clock className="size-3" />
          {t.payment.awaitingConfirm}
        </Badge>
      );
  }
}

function PaymentItem({
  code,
  row,
  viewer,
  fits,
  money,
  readOnly = false,
  awaitingApproval = false,
}: {
  code: string;
  row: PaymentRow;
  viewer: "creator" | "client";
  fits: boolean;
  money: (c: number) => string;
  /** ออเดอร์ปิดแล้ว — ไม่มีปุ่มตอบรายการ และคำแนะนำ "แจ้งใหม่ได้" ต้องไม่โผล่ */
  readOnly?: boolean;
  awaitingApproval?: boolean;
}) {
  const { t, locale } = useLocale();
  const [pending, run] = usePaymentAction();
  // ฟอร์มย่อยที่เปิดอยู่ — ปฏิเสธกับยกเลิกการยืนยันต้องกดสองจังหวะเสมอ ไม่มีปุ่มเดียวจบ
  const [open, setOpen] = useState<"reject" | "undo" | null>(null);
  const [reason, setReason] = useState("");
  const counted = row.state === "verified";
  const struck = row.state === "rejected" || row.state === "voided";

  function close() {
    setOpen(null);
    setReason("");
  }

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "tabular text-sm font-medium",
            // แถวที่ไม่นับเป็นเงินต้องดูออกทันทีว่าไม่นับ ไม่ใช่ต้องอ่าน badge ก่อน
            struck && "text-muted-foreground line-through",
          )}
        >
          {money(row.amountCents)}
        </span>
        <StateBadge state={row.state} />
      </div>
      {/* เวลาสัมพัทธ์เดินระหว่างเรนเดอร์กับ hydrate — ต่างกันได้โดยไม่ผิด */}
      <p className="mt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
        {t.payment.recordedAt} {formatRelative(row.paidAt, locale)}
      </p>
      {row.note ? <p className="mt-1 text-xs whitespace-pre-wrap">{row.note}</p> : null}

      {struck ? (
        <div className="mt-1.5 space-y-0.5 text-xs leading-relaxed">
          {viewer === "client" ? (
            <p className="text-muted-foreground">
              {row.state === "rejected"
                ? // คำแนะนำปกติบอกให้แจ้งโอนใหม่ ซึ่งทำไม่ได้แล้วบนออเดอร์ที่ปิด
                  readOnly
                  ? t.payment.rejectedClosedHint
                  : t.payment.rejectedClientHint
                : t.payment.voidedClientHint}
            </p>
          ) : null}
          {row.reason ? <p>{fill(t.payment.reasonLabel, { reason: row.reason })}</p> : null}
        </div>
      ) : null}

      {/* รายการที่ค้างรอตอบตอนออเดอร์ปิด — badge "รอยืนยัน" อย่างเดียวจะอ่านเหมือนยังจะมีคนตอบ */}
      {readOnly && row.state === "pending" ? (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {t.payment.pendingClosedHint}
        </p>
      ) : null}

      {!readOnly && viewer === "creator" && row.state === "pending" && open === null ? (
        <div className="mt-2.5">
          {/*
            คำอธิบายอยู่เหนือปุ่มเสมอ ไม่ใช่ tooltip — คนกดต้องอ่านก่อนกด
            ไม่ใช่หลังจากสงสัยแล้วไปหาเอง
          */}
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
            {awaitingApproval ? (locale === "th" ? "รอลูกค้ายืนยันภาพตัวอย่างงานก่อนยืนยันรับเงินยอดสุดท้าย" : "Wait for the client to approve the preview before confirming the final payment.") : fits ? t.payment.confirmReceivedHint : t.payment.overTotalWarning}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending || !fits || awaitingApproval}
              onClick={() =>
                run(() => confirmPayment(code, row.id), t.payment.confirmed)
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t.payment.confirmReceived}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen("reject")}
            >
              {t.payment.reject}
            </Button>
          </div>
        </div>
      ) : null}

      {!readOnly && viewer === "creator" && counted && open === null ? (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1.5 -ml-2 h-7 text-xs text-muted-foreground"
          onClick={() => setOpen("undo")}
        >
          <Undo2 className="size-3.5" />
          {t.payment.undo}
        </Button>
      ) : null}

      {!readOnly && open ? (
        <div className="mt-2.5 space-y-2 rounded-md bg-muted/50 p-2.5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {open === "reject" ? t.payment.rejectHint : t.payment.undoHint}
          </p>
          <Label htmlFor={`reason-${row.id}`} className="text-xs">
            {open === "reject" ? t.payment.rejectReason : t.payment.undoReason}
          </Label>
          <Textarea
            id={`reason-${row.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder={
              open === "reject" ? t.payment.rejectReasonPlaceholder : t.payment.undoReasonPlaceholder
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              // ยกเลิกการยืนยันต้องมีเหตุผล — ลูกค้าจะเห็นยอดที่ตัวเองจ่ายถูกหักออก
              disabled={pending || (open === "undo" && reason.trim().length === 0)}
              onClick={() =>
                open === "reject"
                  ? run(
                      () => rejectPayment({ code, paymentId: row.id, reason }),
                      t.payment.rejectedToast,
                      close,
                    )
                  : run(
                      () => voidPayment({ code, paymentId: row.id, reason }),
                      t.payment.undoneToast,
                      close,
                    )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {open === "reject" ? t.payment.rejectSubmit : t.payment.undoSubmit}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={close}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * ครีเอเตอร์บันทึกเงินที่ได้รับเอง — นับทันทีเพราะคนกดคือเจ้าของบัญชี
 *
 * พับไว้ก่อนเสมอ: ทางปกติคือให้ลูกค้าแจ้งแล้วครีเอเตอร์ยืนยัน ฟอร์มนี้มีไว้
 * สำหรับเงินที่มาทางอื่น (ไลน์ เงินสด) ไม่ใช่ทางลัดที่ควรเด่นกว่าปุ่มยืนยัน
 *
 * ⚠️ ค่าตั้งต้นคือยอดรอบนี้ (`dueNow`) ไม่ใช่ยอดคงค้างทั้งหมด — ยังไม่ถึงมัดจำ ลูกค้าก็มักโอนแค่มัดจำ
 * ถ้าตั้งเป็นยอดเต็ม กดบันทึกทีเดียวโดยไม่ได้แก้ตัวเลข = ออเดอร์ขึ้นว่าจ่ายครบ ไฟล์ปลดล็อก
 * ทั้งที่เงินเข้าแค่มัดจำ เพดานจับไม่ได้เพราะยอดไม่เกินราคางาน
 * เพดานของช่องกรอกยังเป็นยอดคงค้าง — ลูกค้าจ่ายเต็มก้อนเดียวก็บันทึกได้
 */
function RecordForm({
  code,
  dueNow,
  outstanding,
  money,
}: {
  code: string;
  dueNow: number;
  outstanding: number;
  money: (c: number) => string;
}) {
  const { t } = useLocale();
  const [pending, run] = usePaymentAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const amount = useBahtField(dueNow, outstanding, money);
  const requestId = useRequestId();

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => {
          // ยอดเปลี่ยนได้ระหว่างที่ฟอร์มพับอยู่ — เปิดใหม่ต้องเริ่มจากยอดรอบนี้ล่าสุด
          amount.setValue(toBahtInput(dueNow));
          setOpen(true);
        }}
      >
        {t.payment.recordReceived}
      </Button>
    );
  }

  function submit() {
    if (amount.cents === null || amount.error) return;
    const amountCents = amount.cents;
    run(
      () =>
        recordPayment({
          code,
          amountCents,
          method: "other",
          proofMediaId: null,
          note,
          paymentId: requestId.take(),
        }),
      t.payment.recordedToast,
      () => {
        requestId.reset();
        setOpen(false);
        setNote("");
      },
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">{t.payment.recordReceived}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{t.payment.recordReceivedHint}</p>
      <div>
        <Label htmlFor="record-amount" className="text-xs">
          {t.payment.recordAmount}
        </Label>
        <Input
          id="record-amount"
          value={amount.value}
          onChange={(e) => amount.setValue(e.target.value.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={amount.error ? true : undefined}
          className="tabular mt-1 text-right"
        />
        {amount.error ? <p className="mt-1 text-xs text-destructive">{amount.error}</p> : null}
      </div>
      <div>
        <Label htmlFor="record-note" className="text-xs">
          {t.payment.recordNote}
        </Label>
        <Input
          id="record-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder={t.payment.recordNotePlaceholder}
          className="mt-1"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || amount.error !== null} onClick={submit}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {t.payment.recordSubmit}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleSlash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireSession } from "@/lib/auth-guard";
import { getLiveQuote, getOrderForClient } from "@/lib/queries/orders";
import { markThreadRead } from "@/lib/orders/actions";
import { toThreadEntries } from "@/lib/orders/thread";
import { toPaymentRows } from "@/lib/payments/rows";
import { paymentMode } from "@/lib/orders/release";
import { closedText, completedByOf, dueLabel } from "@/lib/orders/labels";
import { moneyMoved } from "@/lib/orders/cancel";
import { dueNowCents } from "@/lib/payments/money";
import { PaymentPanel } from "@/components/app/payment-panel";
import { DeliveryPanel } from "@/components/app/delivery-panel";
import { readDelivery } from "@/lib/delivery/read";
import { canRelease } from "@/lib/orders/release";
import { PromptPayQR } from "@/components/app/promptpay-qr";
import type { PromptPayType } from "@/lib/payments/promptpay-id";
import { OrderThread } from "@/components/app/order-thread";
import { OrderActions } from "@/components/app/order-actions";
import { QuoteCard } from "@/components/app/quote-card";
import { ClientReviewCard } from "@/components/app/order-review";
import { getReviewForOrder } from "@/lib/queries/reputation";
import { reviewEligibility } from "@/lib/reputation/review-rules";
import { toOrderReviewView } from "@/lib/reputation/view";
import { formatDate, formatLineAmount, formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { shopHref } from "@/lib/routes";
import type { OrderStatus } from "@/lib/types";

type Props = { params: Promise<{ code: string }> };

export const metadata: Metadata = {
  // หน้าคำขอส่วนตัว — ห้ามให้ search engine เก็บ
  robots: { index: false, follow: false },
};

export default async function ClientRequestPage({ params }: Props) {
  const { code } = await params;
  const session = await requireSession();

  const order = await getOrderForClient(code, session.user.id);
  // ไม่ใช่ของเราก็ 404 เหมือนไม่มีอยู่จริง — ไม่บอกว่ามีออเดอร์นี้อยู่แต่เข้าไม่ได้
  if (!order) notFound();

  await markThreadRead(code);

  const locale = await getLocale();
  const t = getDictionary(locale);
  const handle = order.page.user?.handle ?? "";

  // ยังไม่ถึงมัดจำ ให้โอนแค่มัดจำก่อน ไม่ใช่ยอดเต็ม — ตรงกับด่านใน transitionOrder
  const { open: openRound, released: releasedRound, releasedFiles, pendingFiles } = await readDelivery(order.id, order.deliveries);
  // ใบเสนอราคาที่ยังกดได้ — ดึงเฉพาะตอนอยู่ในสถานะที่กดได้จริง ไม่งั้นเสีย query เปล่า
  const liveQuote = order.status === "quoted" ? await getLiveQuote(order.id) : null;
  // ยอดใน QR ต้องเป็นตัวเดียวกับที่แผงชำระเงินโชว์ — ใช้ฟังก์ชันเดียวกัน ไม่คำนวณซ้ำสองที่
  const amountDue = dueNowCents(order);
  const status = order.status as OrderStatus;
  const mode = paymentMode(status);
  const closed = closedText(t, status, completedByOf(order.messages));
  const payments = toPaymentRows(order.payments);
  /**
   * หัวการ์ดบอกว่าออเดอร์อยู่ตรงไหน ไม่ใช่ "ส่งคำขอแล้ว" ตลอดกาล
   *
   * เดิมออเดอร์ที่ยกเลิก/ปฏิเสธ/หมดอายุยังขึ้นติ๊กเขียว "ส่งคำขอแล้ว — ครีเอเตอร์จะติดต่อกลับ"
   * ลูกค้าจึงนั่งรอคนที่ปฏิเสธไปแล้ว ออเดอร์ที่จบแล้วใช้หัวข้อเดียวกับแผงเงิน (`closedText`)
   * ไอคอนเป็นกลาง ไม่ใช่เครื่องหมายถูก — เสร็จสมบูรณ์เท่านั้นที่ได้ติ๊กเขียว
   */
  const header = closed
    ? { title: closed.title, hint: closed.body, done: status === "completed" }
    : { title: t.order.sent, hint: t.order.sentHint, done: true };
  /**
   * กำหนดส่งฝั่งลูกค้า — ตัวเดียวกับบอร์ดของครีเอเตอร์ (`dueLabel`) สองฝั่งจึงเห็นตรงกันเสมอ
   * ว่างานเลยกำหนดหรือยัง ถ้าฝั่งหนึ่งขึ้นแดงอีกฝั่งไม่ขึ้น จะเถียงกันจากหน้าจอคนละแบบ
   * รอมัดจำอยู่ = บอกเป็นจำนวนวันหลังได้มัดจำ ไม่ใช่วันที่ (วันที่ยังเลื่อนได้)
   */
  const due = dueLabel(t, { ...order, status });
  /**
   * รีวิวมีได้เฉพาะงานที่ `completed` (สถานะปลายทาง ย้อนไม่ได้) — สถานะอื่นไม่ต้องเสีย query
   * ฟอร์มเขียนใหม่โชว์เมื่อมีสิทธิ์ตามกติกาเดียวกับ server (`reviewEligibility`) ส่วนรีวิวที่มีแล้ว
   * โชว์เสมอ แม้ร้านจะยกเลิกการยืนยันเงินทีหลัง — ลูกค้าต้องเห็นสิ่งที่ตัวเองเขียนไว้
   */
  const reviewRow = status === "completed" ? await getReviewForOrder(order.id) : null;
  const canReview = reviewEligibility({ status, amountPaidCents: order.amountPaidCents }) === "ok";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      {handle ? (
        <Link
          href={shopHref(handle)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {order.page.displayName}
        </Link>
      ) : null}

      <Card className="mt-4 gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-lg font-semibold">
              {header.done ? (
                <CheckCircle2 className="size-5 text-success" />
              ) : (
                <CircleSlash className="size-5 text-muted-foreground" />
              )}
              {header.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{header.hint}</p>
          </div>
          <Badge variant="secondary">{t.orderStatus[order.status as OrderStatus]}</Badge>
        </div>

        <Separator />

        <dl className="grid gap-2 text-sm sm:grid-cols-[140px_1fr]">
          <dt className="text-muted-foreground">{t.order.code}</dt>
          <dd className="tabular font-mono font-medium">{order.code}</dd>

          <dt className="text-muted-foreground">{t.order.service}</dt>
          <dd>{order.service?.title ?? "—"}</dd>

          <dt className="text-muted-foreground">{t.order.creator}</dt>
          <dd>{order.page.displayName}</dd>

          {due ? (
            <>
              <dt className="text-muted-foreground">{t.order.dueDate}</dt>
              <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {/* รอมัดจำ = วันที่ยังเลื่อนได้ บอกแค่จำนวนวันหลังได้มัดจำ */}
                {due.kind !== "after_deposit" && order.dueAt ? (
                  <span className="tabular">{formatDate(order.dueAt, locale)}</span>
                ) : null}
                <span
                  className={
                    due.tone === "overdue"
                      ? "inline-flex items-center gap-1 font-medium text-destructive"
                      : "text-muted-foreground"
                  }
                >
                  {due.tone === "overdue" ? <AlertTriangle className="size-3.5" /> : null}
                  {due.text}
                </span>
              </dd>
            </>
          ) : null}
        </dl>
      </Card>

      {reviewRow || canReview ? (
        <div className="mt-4">
          <ClientReviewCard
            code={order.code}
            review={reviewRow ? toOrderReviewView(reviewRow, locale) : null}
          />
        </div>
      ) : null}

      <Card className="mt-4 gap-3 p-6">
        <p className="font-medium">{t.service.total}</p>
        <ul className="space-y-2 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {item.quantity > 1 ? `${item.label} × ${item.quantity}` : item.label}
              </span>
              <span className="tabular shrink-0">
                {formatLineAmount(
                  item.unitPriceCents * item.quantity,
                  item.kind,
                  t.service.includedInPrice,
                  order.currency,
                  locale,
                )}
              </span>
            </li>
          ))}
        </ul>
        <Separator />
        <div className="flex items-baseline justify-between">
          <span className="font-medium">{t.service.total}</span>
          <span className="tabular text-xl font-semibold">
            {formatMoney(order.totalCents, order.currency, locale)}
          </span>
        </div>
      </Card>

      {order.answers.length > 0 ? (
        <Card className="mt-4 gap-3 p-6">
          <p className="font-medium">{t.order.brief}</p>
          <dl className="space-y-2 text-sm">
            {order.answers.map((a) => (
              <div key={a.id} className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-2">
                {/* แสดง label ที่แช่ไว้ตอนสั่ง ไม่ใช่ label ปัจจุบันของฟอร์ม */}
                <dt className="text-muted-foreground">{a.fieldLabel}</dt>
                <dd className="whitespace-pre-wrap">{String(a.value ?? "—")}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      {/*
        เธรดกับปุ่มเป็นคอมโพเนนต์เดียวกับฝั่งครีเอเตอร์ ต่างกันแค่ `actor`
        ปุ่มที่ลูกค้าเห็นจึงมาจาก state machine ชุดเดียวกัน — ไม่มีทางหลุดว่า
        ฝั่งหนึ่งกดได้อีกฝั่งกดไม่ได้เพราะเขียนรายการปุ่มไว้คนละที่
      */}
      <div className="mt-4">
        <OrderThread
          code={order.code}
          entries={toThreadEntries(order.messages)}
          currentUserId={session.user.id}
        />
      </div>

      {/*
        ก่อนครีเอเตอร์ตอบรับ ไม่ต้องมีช่องทางจ่ายเงินให้เห็นเลย
        โอนไปก่อนแล้วครีเอเตอร์ปฏิเสธงาน = เงินอยู่บัญชีเขาแล้วและเราคืนให้ไม่ได้
        (แพลตฟอร์มไม่ได้ถือเงิน) — ด่านจริงอยู่ที่ `recordPayment` ตรงนี้แค่ไม่ล่อให้จ่าย
      */}
      {/*
        มีใบเสนอราคาค้างอยู่ = แสดงใบนั้นแทนข้อความ "รอครีเอเตอร์ตอบรับ"
        เพราะตอนนี้ลูกบอลอยู่ที่ลูกค้า ไม่ใช่ครีเอเตอร์ — บอกว่า "รอ" ทั้งที่
        รอลูกค้าอยู่ คือส่งคนไปนั่งรอสิ่งที่ตัวเองเป็นคนต้องกด
      */}
      {liveQuote ? (
        <div className="mt-4">
          <QuoteCard
            code={order.code}
            currency={order.currency}
            expired={liveQuote.expired}
            quote={{
              id: liveQuote.id,
              lines: liveQuote.lines,
              totalCents: liveQuote.totalCents,
              depositCents: liveQuote.depositCents,
              note: liveQuote.note,
              expiresAt: liveQuote.expiresAt,
            }}
          />
        </div>
      ) : mode !== "open" ? (
        /*
          ออเดอร์ที่จบแล้วต้องบอกตรง ๆ ว่าจบแบบไหน — เดิมตกมาที่ "ยังไม่ต้องโอน รอครีเอเตอร์ตอบรับ"
          ทั้งที่ยกเลิกไปแล้ว และรายการเงินที่จ่ายไปก็หายจากหน้าไปด้วย
          ⚠️ มีรายการเงินเมื่อไหร่ต้องโชว์เสมอ ไม่ว่าสถานะไหน — มันคือหลักฐานตอนคุยเรื่องคืนเงิน
        */
        <Card className="mt-4 gap-3 p-6">
          <div className="space-y-1.5">
            <p className="font-medium">{closed ? closed.title : t.payment.awaitingApproval}</p>
            <p className="text-sm text-muted-foreground">
              {closed ? closed.body : t.payment.awaitingApprovalBody}
            </p>
            {/* เสร็จสมบูรณ์ไม่มีเรื่องคืนเงิน — บอกเฉพาะออเดอร์ที่จบก่อนงานเสร็จแต่มีเงินขยับแล้ว */}
            {closed && status !== "completed" && payments.length > 0 ? (
              <p className="text-sm leading-relaxed">{t.payment.noRefundClient}</p>
            ) : null}
          </div>
          {payments.length > 0 ? (
            <>
              <Separator />
              <PaymentPanel
                code={order.code}
                viewer="client"
                totalCents={order.totalCents}
                paidCents={order.amountPaidCents}
                depositCents={order.depositCents}
                currency={order.currency}
                payments={payments}
                hasPayout={Boolean(order.page.promptpayId)}
                closed
              />
            </>
          ) : null}
        </Card>
      ) : (
      <Card className="mt-4 gap-3 p-6">
        <p className="font-medium">{t.payment.title}</p>
        <PaymentPanel
          code={order.code}
          viewer="client"
          totalCents={order.totalCents}
          paidCents={order.amountPaidCents}
          depositCents={order.depositCents}
          currency={order.currency}
          payments={payments}
          hasPayout={Boolean(order.page.promptpayId)}
          /*
            QR สร้างฝั่ง server แล้วส่งเป็น element ลงมา
            หมายเลข PromptPay จึงไม่เคยถูก serialize ไปอยู่ใน payload ของหน้า
            และ payload ที่ลูกค้าสแกนก็ไม่มีทางถูกแก้จากฝั่ง client
          */
          qr={
            order.page.promptpayId ? (
              <PromptPayQR
                type={(order.page.promptpayType ?? "phone") as PromptPayType}
                id={order.page.promptpayId}
                payeeName={order.page.promptpayName}
                amountSatang={amountDue}
                locale={locale}
              />
            ) : undefined
          }
        />
      </Card>
      )}

      {releasedRound || openRound ? (
        <Card className="mt-4 gap-3 p-6">
          <DeliveryPanel
            code={order.code}
            viewer="client"
            openRound={openRound}
            releasedRound={releasedRound}
            releasedFiles={releasedFiles}
            pendingFiles={pendingFiles}
            canDeliver={canRelease(order)}
            orderStatus={order.status}
          />
        </Card>
      ) : null}

      <Card className="mt-4 p-4">
        <OrderActions
          code={order.code}
          status={status}
          actor="client"
          money={moneyMoved(order.amountPaidCents, payments)}
          currency={order.currency}
          revisions={{ used: order.revisionsUsed, allowed: order.revisionsAllowed }}
        />
      </Card>

      {order.tosSnapshot.length > 0 ? (
        <Card className="mt-4 gap-3 p-6">
          <p className="font-medium">{t.creator.tosTitle}</p>
          <ol className="space-y-1.5 text-sm text-muted-foreground">
            {order.tosSnapshot.map((line, i) => (
              <li key={line} className="flex gap-2">
                <span className="tabular">{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { OrderStatusPill } from "@/components/status-pill";
import { OrderActions } from "@/components/app/order-actions";
import { OrderThread } from "@/components/app/order-thread";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/user-avatar";
import { requireCreator } from "@/lib/auth-guard";
import { getLiveQuote, getOrderForCreator } from "@/lib/queries/orders";
import { markThreadRead } from "@/lib/orders/actions";
import { toThreadEntries } from "@/lib/orders/thread";
import { toPaymentRows } from "@/lib/payments/rows";
import { PaymentPanel } from "@/components/app/payment-panel";
import { DeliveryPanel } from "@/components/app/delivery-panel";
import { QuoteBuilder } from "@/components/app/quote-builder";
import { readDelivery } from "@/lib/delivery/read";
import { canPay, canRelease } from "@/lib/orders/release";
import { daysUntil, formatMoney, formatRelative } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { fill, getDictionary } from "@/lib/i18n/dictionaries";
import type { OrderStatus } from "@/lib/types";

type Props = { params: Promise<{ code: string }> };

export const metadata: Metadata = {
  // หน้างานส่วนตัว — ห้าม index
  robots: { index: false, follow: false },
};

export default async function OrderPage({ params }: Props) {
  const { code } = await params;
  const { user } = await requireCreator();

  const order = await getOrderForCreator(code, user.id);
  // ไม่ใช่งานของร้านเรา = 404 เหมือนไม่มีอยู่จริง
  if (!order) notFound();

  // เปิดหน้าแล้วถือว่าอ่าน — ทำหลังโหลดข้อมูลเสร็จ จะได้ไม่ต้องรอ DB สองรอบก่อนวาดหน้า
  await markThreadRead(code);

  const locale = await getLocale();
  const t = getDictionary(locale);
  const days = order.dueAt ? daysUntil(order.dueAt) : null;
  const { delivery, pendingFiles } = await readDelivery(order.id, order.deliveries);
  const remaining = order.totalCents - order.amountPaidCents;

  /**
   * ออกใบเสนอราคาได้ก่อนลูกค้าตอบรับเท่านั้น — หลังจากนั้นราคาถือว่าตกลงกันแล้ว
   * และมีเงินเข้ามาเกี่ยวข้องได้ การเปลี่ยนราคาทีหลังต้องเป็นเรื่องที่คุยกันใหม่
   */
  const quotable = ["requested", "reviewing", "quoted"].includes(order.status);
  const liveQuote = quotable ? await getLiveQuote(order.id) : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:py-8">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.order.title}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="tabular font-mono text-lg font-semibold">#{order.code}</h1>
        <OrderStatusPill status={order.status as OrderStatus} />
        {days !== null ? (
          <span
            className={`tabular text-sm ${days < 0 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {days < 0
              ? fill(t.order.daysLate, { n: Math.abs(days) })
              : days === 0
                ? t.order.dueToday
                : fill(t.order.daysLeft, { n: days })}
          </span>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-6">
          <OrderThread
            code={order.code}
            entries={toThreadEntries(order.messages)}
            currentUserId={user.id}
          />

          {quotable ? (
            <QuoteBuilder
              code={order.code}
              currency={order.currency}
              /* ตั้งต้นจากใบที่ค้างอยู่ ถ้าไม่มีก็จากรายการที่ลูกค้าสั่งมา */
              initialLines={
                liveQuote
                  ? liveQuote.lines
                  : order.items.map((i) => ({
                      label: i.label,
                      amountCents: i.unitPriceCents * i.quantity,
                    }))
              }
              /*
                กู้เปอร์เซ็นต์คืนจากจำนวนเงินที่เก็บไว้ — เก็บเป็นเงินเพราะด่านมัดจำ
                เทียบกับยอดที่จ่ายมาตรง ๆ การปัดเป็นบาทเต็มทำให้เพี้ยนได้ไม่ถึง 1%
                `Math.round` จึงคืนปุ่มเดิมที่ครีเอเตอร์เคยกดไว้เสมอ
              */
              initialDepositPercent={
                liveQuote && liveQuote.totalCents > 0
                  ? Math.round((liveQuote.depositCents / liveQuote.totalCents) * 100)
                  : 50
              }
            />
          ) : null}

          {order.answers.length > 0 ? (
            <Card className="gap-3 p-5">
              <p className="font-medium">{t.order.brief}</p>
              <dl className="space-y-2 text-sm">
                {order.answers.map((a) => (
                  <div key={a.id} className="grid gap-1 sm:grid-cols-[160px_1fr] sm:gap-2">
                    {/* label ที่แช่ไว้ตอนสั่ง ไม่ใช่ label ปัจจุบันของฟอร์ม */}
                    <dt className="text-muted-foreground">{a.fieldLabel}</dt>
                    <dd className="whitespace-pre-wrap">{String(a.value ?? "—")}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card className="gap-3 p-5">
            <p className="text-sm font-medium">{t.order.client}</p>
            <div className="flex items-center gap-3">
              <UserAvatar
                user={{
                  name: order.client?.name ?? "",
                  email: order.client?.email ?? "",
                  image: order.client?.image,
                }}
                className="size-9"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{order.client?.name ?? "—"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatRelative(order.createdAt, locale)}
                </p>
              </div>
            </div>
          </Card>

          <Card className="gap-3 p-5">
            <p className="text-sm font-medium">{t.order.service}</p>
            <ul className="space-y-1.5 text-sm">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {i.quantity > 1 ? `${i.label} × ${i.quantity}` : i.label}
                  </span>
                  <span className="tabular shrink-0">
                    {formatMoney(i.unitPriceCents * i.quantity, order.currency, locale)}
                  </span>
                </li>
              ))}
            </ul>
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm font-medium">{t.order.total}</span>
              <span className="tabular font-semibold">
                {formatMoney(order.totalCents, order.currency, locale)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t.order.paid}</span>
              <span className="tabular">
                {formatMoney(order.amountPaidCents, order.currency, locale)}
              </span>
            </div>
            {remaining > 0 ? (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t.order.remaining}</span>
                <span className="tabular text-warning">
                  {formatMoney(remaining, order.currency, locale)}
                </span>
              </div>
            ) : (
              <Badge variant="secondary" className="self-start">
                {t.order.fullyPaid}
              </Badge>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t.order.revisionsUsed}</span>
              <span className="tabular">
                {order.revisionsUsed} / {order.revisionsAllowed}
              </span>
            </div>
          </Card>

          {/* ก่อนตอบรับ ลูกค้ายังจ่ายไม่ได้ — บอกครีเอเตอร์ตรง ๆ ว่าปุ่มไหนเป็นตัวปลด */}
          {!canPay(order.status as OrderStatus) ? (
            <Card className="gap-1.5 p-5">
              <p className="text-sm font-medium">{t.payment.title}</p>
              <p className="text-sm text-muted-foreground">
                {t.payment.awaitingApprovalCreator}
              </p>
            </Card>
          ) : (
          <Card className="gap-3 p-5">
            <p className="text-sm font-medium">{t.payment.title}</p>
            <PaymentPanel
              code={order.code}
              viewer="creator"
              totalCents={order.totalCents}
              paidCents={order.amountPaidCents}
              depositCents={order.depositCents}
              currency={order.currency}
              payments={toPaymentRows(order.payments)}
              // ครีเอเตอร์ไม่ต้องเห็น QR ของตัวเอง แต่ต้องรู้ว่าตั้งค่ารับเงินแล้วหรือยัง
              hasPayout={Boolean(order.page.promptpayId)}
            />
          </Card>
          )}

          <Card className="gap-3 p-5">
            <DeliveryPanel
              code={order.code}
              viewer="creator"
              delivery={delivery}
              pendingFiles={pendingFiles}
              canDeliver={canRelease(order)}
              orderStatus={order.status}
            />
          </Card>

          {order.privateNote ? (
            <Card className="gap-1.5 border-dashed p-5">
              <p className="text-xs font-medium">{t.order.privateNote}</p>
              <p className="text-sm whitespace-pre-wrap">{order.privateNote}</p>
              <p className="text-xs text-muted-foreground">{t.order.privateNoteHint}</p>
            </Card>
          ) : null}
        </aside>
      </div>

      {/* แถบปฏิบัติการอยู่ล่างสุดและติดหน้าจอ — เป็นสิ่งที่ครีเอเตอร์มาหาบนหน้านี้ */}
      <Card className="sticky bottom-4 mt-6 p-4 shadow-lg">
        <OrderActions code={order.code} status={order.status as OrderStatus} actor="creator" />
      </Card>
    </div>
  );
}

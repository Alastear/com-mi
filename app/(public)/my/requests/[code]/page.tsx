import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireSession } from "@/lib/auth-guard";
import { getOrderForClient } from "@/lib/queries/orders";
import { markThreadRead } from "@/lib/orders/actions";
import { toThreadEntries } from "@/lib/orders/thread";
import { toPaymentRows } from "@/lib/payments/rows";
import { depositSatisfied } from "@/lib/orders/release";
import { PaymentPanel } from "@/components/app/payment-panel";
import { DeliveryPanel } from "@/components/app/delivery-panel";
import { readDelivery } from "@/lib/delivery/read";
import { canRelease } from "@/lib/orders/release";
import { PromptPayQR } from "@/components/app/promptpay-qr";
import type { PromptPayType } from "@/lib/payments/promptpay-id";
import { OrderThread } from "@/components/app/order-thread";
import { OrderActions } from "@/components/app/order-actions";
import { formatMoney } from "@/lib/format";
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
  const { delivery, pendingFiles } = await readDelivery(order.id, order.deliveries);
  const remaining = Math.max(0, order.totalCents - order.amountPaidCents);
  const amountDue = depositSatisfied(order) ? remaining : order.depositCents - order.amountPaidCents;

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
              <CheckCircle2 className="size-5 text-success" />
              {t.order.sent}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t.order.sentHint}</p>
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
        </dl>
      </Card>

      <Card className="mt-4 gap-3 p-6">
        <p className="font-medium">{t.service.total}</p>
        <ul className="space-y-2 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {item.quantity > 1 ? `${item.label} × ${item.quantity}` : item.label}
              </span>
              <span className="tabular shrink-0">
                {formatMoney(item.unitPriceCents * item.quantity, order.currency, locale)}
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

      <Card className="mt-4 gap-3 p-6">
        <p className="font-medium">{t.payment.title}</p>
        <PaymentPanel
          code={order.code}
          viewer="client"
          totalCents={order.totalCents}
          paidCents={order.amountPaidCents}
          depositCents={order.depositCents}
          currency={order.currency}
          payments={toPaymentRows(order.payments)}
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

      {delivery ? (
        <Card className="mt-4 gap-3 p-6">
          <DeliveryPanel
            code={order.code}
            viewer="client"
            delivery={delivery}
            pendingFiles={pendingFiles}
            canDeliver={canRelease(order)}
            orderStatus={order.status}
          />
        </Card>
      ) : null}

      <Card className="mt-4 p-4">
        <OrderActions code={order.code} status={order.status as OrderStatus} actor="client" />
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

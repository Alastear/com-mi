import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrderStatusPill } from "@/components/status-pill";
import { requireSession } from "@/lib/auth-guard";
import { listOrdersForClient } from "@/lib/queries/orders";
import { formatMoney } from "@/lib/format";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/server";
import { orderRequestHref } from "@/lib/routes";
import type { OrderStatus } from "@/lib/types";

export const metadata: Metadata = { title: "คำขอของฉัน / My requests" };

/**
 * หน้ารวมของ "คนซื้อ" — ก่อนหน้านี้ไม่มี
 *
 * ลูกค้าเข้าถึงออเดอร์ตัวเองได้ทางเดียวคือลิงก์ตรงไปที่ /my/requests/<code>
 * ซึ่งอยู่ในอีเมลกับการแจ้งเตือน ถ้าปิดแท็บทิ้งหรือลบอีเมลก็หาไม่เจออีกเลย
 * ทั้งที่ข้อมูลอยู่ครบและ `listOrdersForClient` ก็เขียนไว้แล้วแต่ไม่มีใครเรียก
 *
 * ใช้ `requireSession` ไม่ใช่ `requireCreator` — นี่คือหน้าของคนที่ไม่มีร้าน
 * (ครีเอเตอร์เปิดได้ด้วย เพราะสั่งงานคนอื่นได้เหมือนกัน)
 */
export default async function MyRequestsPage() {
  const { user } = await requireSession();
  const locale = await getLocale();
  const t = getDictionary(locale);

  const orders = await listOrdersForClient(user.id);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:py-8">
      <h1 className="text-xl font-semibold tracking-tight">{t.myRequests.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.myRequests.subtitle}</p>

      {orders.length === 0 ? (
        <Card className="mt-6 items-center gap-3 p-10 text-center">
          <p className="font-medium">{t.myRequests.emptyTitle}</p>
          <p className="text-sm text-muted-foreground">{t.myRequests.emptyBody}</p>
          <Button asChild className="mt-1">
            <Link href="/explore">{t.myRequests.emptyCta}</Link>
          </Button>
        </Card>
      ) : (
        <Card className="mt-6 gap-0 overflow-hidden p-0">
          <ul className="divide-y">
            {orders.map((o) => (
              <li key={o.code}>
                <Link
                  href={orderRequestHref(o.code)}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-4 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {o.service?.title ?? o.code}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.myRequests.from} {o.page.displayName}
                    </p>
                  </div>
                  <span className="tabular text-sm">
                    {formatMoney(o.totalCents, o.currency, locale)}
                  </span>
                  <OrderStatusPill status={o.status as OrderStatus} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

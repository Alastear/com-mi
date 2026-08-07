import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock, Inbox, TrendingUp } from "lucide-react";
import { ArtImage } from "@/components/art-image";
import { UserAvatar } from "@/components/user-avatar";
import { OrderStatusPill } from "@/components/status-pill";
import { CopyLinkButton } from "@/components/copy-link-button";
import { LockedFeature } from "@/components/locked-feature";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireCreator } from "@/lib/auth-guard";
import { listOrdersForBoard } from "@/lib/queries/orders";
import { getCreatorStats, getSetupProgress } from "@/lib/queries/setup";
import { ensureShop } from "@/lib/shop/ensure";
import { SetupChecklist } from "@/components/app/setup-checklist";
import { ACTIVE_STATUSES, type OrderStatus } from "@/lib/types";
import { daysUntil, formatBytes, formatMoney, formatRelative } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PLANS } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { orderHref, shopHref } from "@/lib/routes";
import { shopUrl } from "@/lib/site";

export default async function DashboardPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const { user } = await requireCreator();
  const pageId = await ensureShop(user.id, user.name);

  const [allOrders, progress, usage] = await Promise.all([
    listOrdersForBoard(user.id),
    getSetupProgress(user.id),
    getCreatorStats(user.id, pageId),
  ]);

  const shopPageHref = user.handle ? shopHref(user.handle) : "/onboarding";
  const currency = "THB";

  const active = allOrders.filter((o) => ACTIVE_STATUSES.includes(o.status as OrderStatus));
  const newRequests = active.filter((o) => o.status === "requested");
  const inProgress = active.filter((o) => o.status === "in_progress");
  const dueSoon = active.filter((o) => o.dueAt && daysUntil(o.dueAt) <= 3);

  /**
   * รายได้นับจาก "เงินที่ยืนยันแล้วว่าเข้าจริง" ไม่ใช่ยอดรวมของออเดอร์
   * ออเดอร์ที่ยังไม่จ่ายไม่ใช่รายได้ และตัวเลขที่สูงเกินจริงบนแดชบอร์ด
   * ทำให้ครีเอเตอร์วางแผนผิด
   */
  const revenue = allOrders.reduce((sum, o) => sum + o.amountPaidCents, 0);

  // งานที่ต้องจัดการ: คำขอใหม่ + เลยกำหนด
  const needsAttention = active
    .filter((o) => o.status === "requested" || (o.dueAt !== null && daysUntil(o.dueAt) < 0))
    .slice(0, 5);

  const storageUsed = usage.storageBytes;
  // TODO Phase 2: อ่านลิมิตจาก plan จริงของผู้ใช้ผ่าน entitlements
  const freeLimits = PLANS.free.limits;

  const stats = [
    { label: t.dashboard.newRequests, value: newRequests.length, icon: Inbox, tone: "text-info" },
    { label: t.dashboard.inProgress, value: inProgress.length, icon: TrendingUp, tone: "text-primary" },
    { label: t.dashboard.dueSoon, value: dueSoon.length, icon: Clock, tone: "text-warning" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:py-8">
      {/* หัวหน้าเพจ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <UserAvatar user={user} className="size-11" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t.dashboard.greeting} {user.name}
            </h1>
            <p className="text-sm text-muted-foreground">{t.dashboard.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user.handle ? (
            <CopyLinkButton
              value={shopUrl(user.handle)}
              label={t.dashboard.shopLink}
              size="sm"
            />
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link href={shopPageHref}>{user.handle ? t.nav.shop : t.auth.finishSetup}</Link>
          </Button>
        </div>
      </div>

      {/*
        เช็กลิสต์ตั้งร้าน — อยู่บนสุดจนกว่าจะตั้งค่าครบและเผยแพร่แล้ว
        ครีเอเตอร์ใหม่เปิดเข้ามาเจอตัวเลข 0 ทั้งแถวโดยไม่รู้ว่าต้องทำอะไรต่อ
        คือจุดที่คนเลิกใช้มากที่สุด
      */}
      {progress ? (
        <div className="mt-6">
          <SetupChecklist progress={progress} handle={user.handle ?? ""} locale={locale} />
        </div>
      ) : null}

      {/* ตัวเลขสรุป */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="gap-1 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <s.icon className={`size-4 ${s.tone}`} />
            </div>
            <p className="tabular text-2xl font-semibold xl:text-3xl">{s.value}</p>
          </Card>
        ))}

        <Card className="gap-1 p-4">
          <p className="text-sm text-muted-foreground">{t.dashboard.monthRevenue}</p>
          <p className="tabular text-2xl font-semibold xl:text-3xl">
            {/* TODO Phase 1: อ่านสกุลเงินจาก creator_page */}
            {formatMoney(revenue, currency, locale)}
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        {/* ต้องจัดการ */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t.dashboard.needsAttention}</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/orders">
                {t.common.viewAll}
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          {needsAttention.length === 0 ? (
            <Card className="mt-3 items-center p-10 text-center text-sm text-muted-foreground">
              {t.dashboard.needsAttentionEmpty}
            </Card>
          ) : (
            <ul className="mt-3 space-y-2">
              {needsAttention.map((o) => {
                const overdue = o.dueAt !== null && daysUntil(o.dueAt) < 0;
                return (
                  <li key={o.code}>
                    <Link href={orderHref(o.code)}>
                      <Card className="flex-row items-center gap-3 p-3 transition-colors hover:bg-accent/40">
                        <ArtImage seed={o.id} alt="" ratio={1} className="size-12 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="tabular font-mono text-xs text-muted-foreground">
                              #{o.code}
                            </span>
                            <OrderStatusPill status={o.status as OrderStatus} />
                            {overdue && (
                              <span className="inline-flex items-center gap-1 text-xs text-destructive">
                                <AlertTriangle className="size-3" />
                                {t.order.overdue}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-sm font-medium">{o.service?.title ?? "—"}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {o.client?.name ?? "—"} · {formatRelative(o.createdAt, locale)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular text-sm font-medium">
                            {o.totalCents > 0
                              ? formatMoney(o.totalCents, o.currency, locale)
                              : t.order.noQuoteYet}
                          </p>
                        </div>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {/* ตัวอย่างฟีเจอร์ที่ล็อกไว้ — ต้องเห็นว่ามีอะไรให้ปลด ไม่ใช่หน้าว่าง */}
          <div className="mt-6">
            <h2 className="mb-3 font-semibold">{t.nav.analytics}</h2>
            <LockedFeature
              description={t.analytics.lockDesc}
            >
              <Card className="gap-4 p-5">
                <div className="flex items-end gap-2">
                  {[42, 68, 55, 90, 74, 96, 61, 83, 45, 77, 88, 52].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-primary/70"
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Views</p>
                    <p className="tabular text-xl font-semibold">2,481</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Requests</p>
                    <p className="tabular text-xl font-semibold">63</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Conversion</p>
                    <p className="tabular text-xl font-semibold">2.5%</p>
                  </div>
                </div>
              </Card>
            </LockedFeature>
          </div>
        </section>

        {/* ขวา: โควตา + ความเคลื่อนไหว */}
        <aside className="space-y-6">
          <Card className="gap-4 p-5">
            <p className="font-medium">{t.dashboard.quotaTitle}</p>

            <Quota
              label={t.dashboard.quotaOrders}
              used={usage.activeOrders}
              max={freeLimits.active_orders}
              display={`${usage.activeOrders} / ${freeLimits.active_orders}`}
              overLabel={t.dashboard.overQuota}
            />
            <Quota
              label={t.dashboard.quotaServices}
              used={usage.services}
              max={freeLimits.services}
              display={`${usage.services} / ${freeLimits.services}`}
              overLabel={t.dashboard.overQuota}
            />
            <Quota
              label={t.dashboard.quotaStorage}
              used={storageUsed}
              max={freeLimits.storage_bytes}
              display={`${formatBytes(storageUsed)} / ${formatBytes(freeLimits.storage_bytes)}`}
              overLabel={t.dashboard.overQuota}
            />

            <Button asChild size="sm" variant="outline" className="mt-1 w-full">
              <Link href="/pricing">{t.common.upgrade}</Link>
            </Button>
          </Card>

          {/*
            เดิมเป็นรายการแจ้งเตือนจำลอง — ตาราง notification ยังไม่มี (Phase 1c)
            ระหว่างนี้แสดงออเดอร์ล่าสุดจริง ซึ่งเป็นความเคลื่อนไหวที่มีอยู่แล้ว
            ดีกว่าโชว์การแจ้งเตือนของคนอื่นที่ไม่เคยเกิดขึ้น
          */}
          <Card className="gap-3 p-5">
            <p className="font-medium">{t.dashboard.recentActivity}</p>
            {allOrders.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t.order.emptyAll}
              </p>
            ) : (
              <ul className="space-y-3">
                {allOrders.slice(0, 5).map((o) => (
                  <li key={o.id}>
                    <Link href={orderHref(o.code)} className="group flex gap-2.5">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm group-hover:underline">
                          {o.service?.title ?? o.code}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {o.client?.name ?? "—"} · {t.orderStatus[o.status as OrderStatus]}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {formatRelative(o.createdAt, locale)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Quota({
  label,
  used,
  max,
  display,
  overLabel,
}: {
  label: string;
  used: number;
  max: number;
  display: string;
  overLabel: string;
}) {
  const percent = Math.min(100, Math.round((used / max) * 100));

  /**
   * เกินโควตาได้จริงและเป็นสถานะที่ตั้งใจรองรับ — เช่นคนที่ลด Pro → Free
   * แล้วยังมีงานค้างเกินลิมิต (docs/03-plans-and-entitlements.md §5)
   * ต้องแสดงให้รู้ว่า "เกิน" ไม่ใช่ปล่อยให้แถบเต็มสีปกติจนดูเหมือนระบบพัง
   */
  const over = used > max;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("tabular shrink-0", over && "font-medium text-destructive")}>
          {display}
        </span>
      </div>
      <Progress
        value={percent}
        className={cn("mt-1.5 h-1.5", over && "*:bg-destructive")}
      />
      {over ? <p className="mt-1 text-xs text-destructive">{overLabel}</p> : null}
    </div>
  );
}

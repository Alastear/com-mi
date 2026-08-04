import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock, Inbox, TrendingUp } from "lucide-react";
import { ArtAvatar, ArtImage } from "@/components/art-image";
import { OrderStatusPill } from "@/components/status-pill";
import { CopyLinkButton } from "@/components/copy-link-button";
import { LockedFeature } from "@/components/locked-feature";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { creator, notifications, orders } from "@/lib/mock/data";
import { ACTIVE_STATUSES } from "@/lib/types";
import { daysUntil, formatBytes, formatMoney, formatRelative } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PLANS } from "@/lib/billing/plans";
import { orderHref, shopHref } from "@/lib/routes";

export default async function DashboardPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const newRequests = orders.filter((o) => o.status === "requested");
  const inProgress = orders.filter((o) => o.status === "in_progress");
  const dueSoon = active.filter((o) => o.dueAt && daysUntil(o.dueAt) <= 3);
  const revenue = orders
    .filter((o) => o.paidCents > 0)
    .reduce((sum, o) => sum + o.paidCents, 0);

  // งานที่ต้องจัดการ: คำขอใหม่ + เลยกำหนด + ลูกค้าตอบแล้วยังไม่ได้อ่าน
  const needsAttention = active
    .filter(
      (o) =>
        o.status === "requested" ||
        o.unreadCount > 0 ||
        (o.dueAt !== undefined && daysUntil(o.dueAt) < 0),
    )
    .slice(0, 5);

  const storageUsed = 96 * 1024 ** 2;
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
          <ArtAvatar seed={creator.avatarSeed} alt={creator.displayName} className="size-11" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t.dashboard.greeting} {creator.displayName}
            </h1>
            <p className="text-sm text-muted-foreground">{t.dashboard.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CopyLinkButton
            value={`https://commi.app/@${creator.handle}`}
            label={t.dashboard.shopLink}
            size="sm"
          />
          <Button asChild size="sm" variant="outline">
            <Link href={shopHref(creator.handle)}>{t.nav.shop}</Link>
          </Button>
        </div>
      </div>

      {/* ตัวเลขสรุป */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="gap-1 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <s.icon className={`size-4 ${s.tone}`} />
            </div>
            <p className="tabular text-3xl font-semibold">{s.value}</p>
          </Card>
        ))}

        <Card className="gap-1 p-4">
          <p className="text-sm text-muted-foreground">{t.dashboard.monthRevenue}</p>
          <p className="tabular text-3xl font-semibold">
            {formatMoney(revenue, creator.currency, locale)}
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
                const overdue = o.dueAt !== undefined && daysUntil(o.dueAt) < 0;
                return (
                  <li key={o.code}>
                    <Link href={orderHref(o.code)}>
                      <Card className="flex-row items-center gap-3 p-3 transition-colors hover:bg-accent/40">
                        <ArtImage
                          seed={o.coverSeed}
                          alt=""
                          ratio={1}
                          className="size-12 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="tabular font-mono text-xs text-muted-foreground">
                              #{o.code}
                            </span>
                            <OrderStatusPill status={o.status} />
                            {overdue && (
                              <span className="inline-flex items-center gap-1 text-xs text-destructive">
                                <AlertTriangle className="size-3" />
                                {t.order.overdue}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-sm font-medium">{o.serviceTitle}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {o.clientName} · {formatRelative(o.createdAt, locale)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular text-sm font-medium">
                            {o.totalCents > 0
                              ? formatMoney(o.totalCents, o.currency, locale)
                              : "—"}
                          </p>
                          {o.unreadCount > 0 && (
                            <span className="tabular mt-1 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                              {o.unreadCount}
                            </span>
                          )}
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
              used={active.length}
              max={freeLimits.active_orders}
              display={`${active.length} / ${freeLimits.active_orders}`}
            />
            <Quota
              label={t.dashboard.quotaServices}
              used={5}
              max={freeLimits.services}
              display={`5 / ${freeLimits.services}`}
            />
            <Quota
              label={t.dashboard.quotaStorage}
              used={storageUsed}
              max={freeLimits.storage_bytes}
              display={`${formatBytes(storageUsed)} / ${formatBytes(freeLimits.storage_bytes)}`}
            />

            <Button asChild size="sm" variant="outline" className="mt-1 w-full">
              <Link href="/pricing">{t.common.upgrade}</Link>
            </Button>
          </Card>

          <Card className="gap-3 p-5">
            <p className="font-medium">{t.dashboard.recentActivity}</p>
            <ul className="space-y-3">
              {notifications.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} className="group flex gap-2.5">
                    <span
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                        n.read ? "bg-muted-foreground/40" : "bg-primary"
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm group-hover:underline">
                        {n.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {n.body}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {formatRelative(n.createdAt, locale)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
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
}: {
  label: string;
  used: number;
  max: number;
  display: string;
}) {
  const percent = Math.min(100, Math.round((used / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular">{display}</span>
      </div>
      <Progress value={percent} className="mt-1.5 h-1.5" />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Minus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/format";
import { COMPARISON, PLANS, type CompareValue, type ComparisonGroup } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

type Cycle = "monthly" | "yearly";

export function PricingClient() {
  const { t, locale } = useLocale();
  const [cycle, setCycle] = useState<Cycle>("monthly");

  const proPrice =
    cycle === "monthly" ? PLANS.pro.priceCentsMonthly : PLANS.pro.priceCentsYearly;

  const tiers = [
    {
      id: "free" as const,
      name: t.plan.free,
      desc: t.plan.freeDesc,
      price: 0,
      cta: t.pricing.startFree,
      highlight: false,
      bullets: Object.values(t.pricing.freeBullets),
    },
    {
      id: "pro" as const,
      name: t.plan.pro,
      desc: t.plan.proDesc,
      price: proPrice,
      cta: t.pricing.choosePlan,
      highlight: true,
      bullets: Object.values(t.pricing.proBullets),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.pricing.title}</h1>
        <p className="mx-auto mt-3 max-w-lg text-muted-foreground">{t.pricing.subtitle}</p>
      </div>

      {/* สลับรายเดือน / รายปี */}
      <div className="mt-8 flex justify-center">
        <div
          role="tablist"
          aria-label={t.pricing.title}
          className="inline-flex items-center gap-1 rounded-full border bg-card p-1"
        >
          {(["monthly", "yearly"] as const).map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={cycle === c}
              onClick={() => setCycle(c)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                cycle === c
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c === "monthly" ? t.pricing.monthly : t.pricing.yearly}
            </button>
          ))}
        </div>
        {cycle === "yearly" && (
          <Badge variant="secondary" className="ml-3 self-center">
            {t.pricing.yearlyBadge}
          </Badge>
        )}
      </div>

      {/* การ์ดแพ็กเกจ */}
      <div className="mx-auto mt-10 grid max-w-3xl gap-5 sm:grid-cols-2">
        {tiers.map((tier) => (
          <Card
            key={tier.id}
            className={cn(
              // Card ของ shadcn มี overflow-hidden ติดมา → badge ที่ -top-2.5 จะโดนตัดครึ่ง
              // ต้อง overflow-visible เพื่อให้ป้าย "แนะนำ" ลอยพ้นขอบการ์ดได้
              "relative gap-0 overflow-visible p-6",
              tier.highlight && "border-primary/50 ring-1 ring-primary/25",
            )}
          >
            {tier.highlight && (
              <Badge className="absolute -top-2.5 left-6 gap-1">
                <Sparkles className="size-3" />
                {t.pricing.popular}
              </Badge>
            )}

            <p className="text-lg font-semibold">{tier.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{tier.desc}</p>

            <p className="tabular mt-5 flex items-baseline gap-1">
              <span className="text-3xl font-semibold">
                {formatMoney(tier.price, "THB", locale)}
              </span>
              {tier.price > 0 && (
                <span className="text-sm text-muted-foreground">
                  {cycle === "monthly" ? t.pricing.perMonth : t.pricing.perYear}
                </span>
              )}
            </p>

            <Button
              asChild
              className="mt-5 w-full"
              variant={tier.highlight ? "default" : "outline"}
            >
              <Link href="/dashboard">{tier.cta}</Link>
            </Button>

            <ul className="mt-6 space-y-2.5 text-sm">
              {tier.bullets.map((b) => (
                <li key={b} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {/* ตารางเปรียบเทียบ */}
      <div className="mt-16">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-background pb-3 text-left font-medium" />
                <th className="w-28 pb-3 text-center font-medium">{t.plan.free}</th>
                <th className="w-28 pb-3 text-center font-medium text-primary">{t.plan.pro}</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((group) => (
                <ComparisonRows key={group.key} group={group} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ */}
      <div className="mx-auto mt-16 max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight">{t.pricing.faqTitle}</h2>
        <dl className="mt-6 space-y-6">
          {[
            { q: t.pricing.noEscrowQ, a: t.pricing.noEscrowA },
            { q: t.pricing.freeLimitQ, a: t.pricing.freeLimitA },
            { q: t.pricing.downgradeQ, a: t.pricing.downgradeA },
          ].map((f) => (
            <div key={f.q}>
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-1.5 leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function ComparisonRows({
  group,
  t,
}: {
  group: ComparisonGroup;
  t: Dictionary;
}) {
  return (
    <>
      <tr>
        <td colSpan={3} className="pt-6 pb-2">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t.compare.groups[group.key]}
          </span>
        </td>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.key} className="border-t">
          <td className="sticky left-0 bg-background border-t py-2.5 pr-4">
            {t.compare.rows[row.key]}
          </td>
          <td className="border-t py-2.5 text-center">
            <Cell value={row.free} t={t} />
          </td>
          <td className="border-t py-2.5 text-center">
            <Cell value={row.pro} t={t} />
          </td>
        </tr>
      ))}
    </>
  );
}

function Cell({ value, t }: { value: CompareValue; t: Dictionary }) {
  if (value === true)
    return <Check className="mx-auto size-4 text-success" aria-label={t.common.yes} />;
  if (value === false)
    return <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label={t.common.no} />;

  const label = typeof value === "string" ? value : t.compare.values[value.t];
  return <span className="tabular text-muted-foreground">{label}</span>;
}

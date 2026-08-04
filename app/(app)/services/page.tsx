import Link from "next/link";
import { GripVertical, Plus } from "lucide-react";
import { ArtImage } from "@/components/art-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { creator, services } from "@/lib/mock/data";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { fill, getDictionary } from "@/lib/i18n/dictionaries";
import { PLANS } from "@/lib/billing/plans";
import { serviceHref } from "@/lib/routes";

export default async function ServicesPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const max = PLANS.free.limits.services;
  const atLimit = services.length >= max;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t.nav.services}</h1>
          <p className="tabular text-sm text-muted-foreground">
            {services.length} / {max}
          </p>
        </div>
        <Button disabled={atLimit}>
          <Plus className="size-4" />
          {t.service.addService}
        </Button>
      </div>

      {atLimit && (
        <Card className="mt-4 flex-row items-center gap-3 border-primary/40 bg-primary/5 p-4">
          <p className="flex-1 text-sm">
            {fill(t.service.limitReached, { n: max })}
          </p>
          <Button asChild size="sm">
            <Link href="/pricing">{t.common.upgrade}</Link>
          </Button>
        </Card>
      )}

      <ul className="mt-5 space-y-3">
        {services.map((s) => (
          <li key={s.id}>
            <Card className="flex-row items-center gap-4 p-3">
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
              <ArtImage seed={s.coverSeed} alt={s.title} ratio={1} className="size-16 shrink-0" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{s.title}</p>
                  <Badge variant={s.mode === "instant" ? "default" : "secondary"} className="text-[10px]">
                    {s.mode === "instant" ? t.service.instantOrder : t.service.customProposal}
                  </Badge>
                </div>
                <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                  {s.description}
                </p>
                <p className="tabular mt-1 text-xs text-muted-foreground">
                  {s.tiers.length} {t.service.tiersLabel} · {s.options.length}{" "}
                  {t.service.addonsLabel} · {s.deliveryDays} {t.common.days}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="tabular font-semibold">
                  {formatMoney(s.basePriceCents, creator.currency, locale)}
                </p>
                <Button asChild variant="ghost" size="sm" className="mt-1">
                  <Link href={serviceHref(creator.handle, s.slug)}>{t.common.edit}</Link>
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

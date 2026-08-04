import { ImagePlus } from "lucide-react";
import { ArtImage } from "@/components/art-image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { portfolio } from "@/lib/mock/data";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PLANS } from "@/lib/billing/plans";

export default async function PortfolioPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const max = PLANS.free.limits.portfolio_items;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t.nav.portfolio}</h1>
          <p className="tabular text-sm text-muted-foreground">
            {portfolio.length} / {max}
          </p>
        </div>
        <Button disabled={portfolio.length >= max}>
          <ImagePlus className="size-4" />
          {t.portfolio.upload}
        </Button>
      </div>

      <div className="masonry mt-6 columns-2 sm:columns-3 lg:columns-4">
        {portfolio.map((p) => (
          <figure key={p.id} className="group relative">
            <ArtImage seed={p.seed} alt={p.title} ratio={1 / p.ratio} />
            <figcaption className="absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/80 to-transparent p-2.5">
              <span className="block truncate text-xs font-medium text-white">{p.title}</span>
              {p.linkedServiceSlug ? (
                <Badge variant="secondary" className="mt-1 text-[10px]">
                  {p.linkedServiceSlug}
                </Badge>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        {t.portfolio.storageNote}
      </p>
    </div>
  );
}

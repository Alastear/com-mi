import { Gavel, Timer } from "lucide-react";
import { ArtImage } from "@/components/art-image";
import { LockedFeature } from "@/components/locked-feature";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";

const MOCK_LISTINGS = [
  { id: "l1", title: "Kitsune adopt #12", seed: "adopt-kitsune", bid: 180_000, bids: 14, endsIn: "2ชม. 14น.", type: "auction" },
  { id: "l2", title: "YCH — Coffee shop", seed: "ych-coffee", bid: 95_000, bids: 8, endsIn: "1ว. 3ชม.", type: "auction" },
  { id: "l3", title: "Chibi base pack", seed: "base-chibi", bid: 45_000, bids: 0, endsIn: "—", type: "fixed" },
  { id: "l4", title: "Ocean spirit adopt", seed: "adopt-ocean", bid: 260_000, bids: 22, endsIn: "6ชม. 41น.", type: "auction" },
];

export default async function ListingsPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:py-8">
      <div className="flex items-center gap-2">
        <Gavel className="size-5 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">{t.nav.listings}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.listings.desc}
      </p>

      <LockedFeature
        className="mt-6"
        description={
          t.listings.lockDesc
        }
      >
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {MOCK_LISTINGS.map((l) => (
            <Card key={l.id} className="gap-0 overflow-hidden p-0">
              <ArtImage seed={l.seed} alt={l.title} ratio={1.5} rounded={false} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{l.title}</p>
                  <Badge variant={l.type === "auction" ? "default" : "secondary"}>
                    {l.type === "auction" ? t.listings.auction : t.listings.fixed}
                  </Badge>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {l.type === "auction" ? t.listings.currentBid : t.listings.price}
                    </p>
                    <p className="tabular text-lg font-semibold">
                      {formatMoney(l.bid, "THB", locale)}
                    </p>
                  </div>
                  <p className="tabular inline-flex items-center gap-1 text-xs text-warning">
                    <Timer className="size-3" />
                    {l.endsIn}
                  </p>
                </div>
                {l.bids > 0 && (
                  <p className="tabular mt-1 text-xs text-muted-foreground">
                    {l.bids} {t.listings.bids}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      </LockedFeature>
    </div>
  );
}

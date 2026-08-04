import { ArtAvatar } from "@/components/art-image";
import { LockedFeature } from "@/components/locked-feature";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";

const MOCK_CLIENTS = [
  { name: "KaiStream", seed: "client-kai", orders: 6, spent: 480_000, tags: ["ลูกค้าประจำ", "จ่ายไว"] },
  { name: "Mint", seed: "client-mint", orders: 4, spent: 320_000, tags: ["ลูกค้าประจำ"] },
  { name: "ploy.", seed: "client-ploy", orders: 3, spent: 610_000, tags: ["งานใหญ่"] },
  { name: "Tar", seed: "client-tar", orders: 2, spent: 280_000, tags: [] },
  { name: "Bam", seed: "client-bam", orders: 1, spent: 0, tags: ["ลูกค้าใหม่"] },
];

export default async function ClientsPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:py-8">
      <h1 className="text-xl font-semibold tracking-tight">{t.nav.clients}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.clients.desc}
      </p>

      <LockedFeature
        className="mt-6"
        description={
          t.clients.lockDesc
        }
      >
        <Card className="gap-0 overflow-hidden p-0">
          <ul className="divide-y">
            {MOCK_CLIENTS.map((c) => (
              <li key={c.name} className="flex items-center gap-3 p-3.5">
                <ArtAvatar seed={c.seed} alt={c.name} className="size-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="tabular shrink-0 text-right text-sm">
                  <p className="font-medium">{formatMoney(c.spent, "THB", locale)}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.orders} {t.clients.orders}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </LockedFeature>
    </div>
  );
}

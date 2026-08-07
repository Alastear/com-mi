import Link from "next/link";
import { ArtAvatar, ArtImage } from "@/components/art-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listPublicShops } from "@/lib/queries/creator";
import { shopHref } from "@/lib/routes";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { fill, getDictionary } from "@/lib/i18n/dictionaries";
import type { ShopStatus } from "@/lib/types";

/**
 * Phase 1–2 หน้านี้ตั้งใจให้เรียบมาก — marketplace ที่ยังไม่มีคนใช้ดูแย่กว่าไม่มีเลย
 * (ดู docs/00-product-overview.md §7) ค่อยเพิ่ม ranking / ค้นหาจริงใน Phase 3
 *
 * แสดงเฉพาะร้านจริงที่กด publish แล้ว — **ร้านตัวอย่างถูกตัดออกด้วย `isDemo`**
 * เดิมหน้านี้ปั้นครีเอเตอร์ปลอมสามคนจากข้อมูลจำลองชุดเดียว ซึ่งกดเข้าไปแล้ว 404 ทั้งหมด
 * ยอมให้หน้าว่างดีกว่าโชว์ร้านที่ไม่มีตัวตน — คนกดแล้วเจอหน้าเสียจะไม่กลับมาอีก
 */
export default async function ExplorePage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const shops = await listPublicShops();

  const statusTone: Record<ShopStatus, string> = {
    open: "text-success",
    waitlist: "text-warning",
    closed: "text-muted-foreground",
    vacation: "text-info",
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{t.nav.explore}</h1>
      <p className="mt-2 text-muted-foreground">
        {shops.length > 0 ? fill(t.explore.count, { n: shops.length }) : t.brand.tagline}
      </p>

      {shops.length === 0 ? (
        <Card className="mt-10 items-center gap-3 p-10 text-center">
          <p className="font-medium">{t.explore.empty}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t.explore.emptyHint}</p>
          <Button asChild className="mt-2">
            <Link href="/dashboard">{t.explore.openShop}</Link>
          </Button>
        </Card>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shops.map((c) => {
            const handle = c.user?.handle ?? "";
            return (
              <Card key={c.id} className="gap-0 overflow-hidden p-0">
                <Link href={shopHref(handle)} className="group block">
                  <ArtImage
                    seed={c.id}
                    src={c.banner?.url}
                    alt=""
                    ratio={2.6}
                    rounded={false}
                    className="transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <div className="-mt-7 px-4 pb-4">
                    <ArtAvatar
                      seed={c.id + "-avatar"}
                      src={c.avatar?.url}
                      alt={c.displayName}
                      className="size-14 ring-4 ring-card"
                    />
                    <p className="mt-2.5 font-medium">{c.displayName}</p>
                    <p className="text-xs text-muted-foreground">@{handle}</p>
                    {c.tagline ? (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {c.tagline}
                      </p>
                    ) : null}

                    {/*
                      เรตติ้งกับจำนวนรีวิวเคยอยู่ตรงนี้ตอนเป็น prototype
                      ตัดออกจนกว่าจะมีออเดอร์จริง — ตัวเลขปลอมบนหน้าค้นหาคือการโกหกลูกค้า
                    */}
                    <div className="mt-3 text-xs">
                      <span className={statusTone[c.status as ShopStatus]}>
                        ● {t.shopStatus[c.status as ShopStatus]}
                      </span>
                    </div>

                    {c.services.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {c.services.map((s) => (
                          <Badge key={s.id} variant="secondary" className="tabular font-normal">
                            {s.title.split(" ")[0]} ·{" "}
                            {formatMoney(s.basePriceCents, "THB", locale)}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    {c.portfolio.length > 0 ? (
                      <div className="mt-3 grid grid-cols-4 gap-1.5">
                        {c.portfolio.map((p) => (
                          <ArtImage
                            key={p.id}
                            seed={p.id}
                            src={p.media?.url}
                            alt={p.title}
                            ratio={1}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { ArtAvatar, ArtImage } from "@/components/art-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listPublicShops } from "@/lib/queries/creator";
import { shopHref } from "@/lib/routes";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { fill, getDictionary } from "@/lib/i18n/dictionaries";
import { SERVICE_KINDS, type ShopStatus } from "@/lib/types";

/**
 * Phase 1–2 หน้านี้ตั้งใจให้เรียบมาก — marketplace ที่ยังไม่มีคนใช้ดูแย่กว่าไม่มีเลย
 * (ดู docs/00-product-overview.md §7) ค่อยเพิ่ม ranking / ค้นหาจริงใน Phase 3
 *
 * แสดงเฉพาะร้านจริงที่กด publish แล้ว — **ร้านตัวอย่างถูกตัดออกด้วย `isDemo`**
 * เดิมหน้านี้ปั้นครีเอเตอร์ปลอมสามคนจากข้อมูลจำลองชุดเดียว ซึ่งกดเข้าไปแล้ว 404 ทั้งหมด
 * ยอมให้หน้าว่างดีกว่าโชว์ร้านที่ไม่มีตัวตน — คนกดแล้วเจอหน้าเสียจะไม่กลับมาอีก
 */
export default async function ExplorePage(props: PageProps<"/explore">) {
  const locale = await getLocale();
  const t = getDictionary(locale);

  // ตัวกรองอยู่ใน URL ทั้งหมด — แชร์ลิงก์ผลค้นหาได้ และปุ่ม back ทำงานถูก
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  const hasFilter = Boolean(q || kind);

  const shops = await listPublicShops(24, { q, kind });

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

      {/* ฟอร์ม GET ธรรมดา — ค้นได้แม้ JavaScript ยังไม่โหลด และ Enter ทำงานเอง */}
      <form className="mt-6 flex max-w-lg gap-2">
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t.home.searchPlaceholder}
          aria-label={t.home.searchPlaceholder}
          className="h-10"
        />
        <Button type="submit">{t.home.searchCta}</Button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          asChild
          size="sm"
          variant={kind ? "outline" : "secondary"}
          className="rounded-full"
        >
          <Link href={q ? `/explore?q=${encodeURIComponent(q)}` : "/explore"}>{t.common.all}</Link>
        </Button>
        {SERVICE_KINDS.map((k) => (
          <Button
            key={k}
            asChild
            size="sm"
            variant={k === kind ? "secondary" : "outline"}
            className="rounded-full"
          >
            <Link
              href={`/explore?kind=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              aria-current={k === kind ? "true" : undefined}
            >
              {t.serviceKind[k]}
            </Link>
          </Button>
        ))}
      </div>

      {shops.length === 0 ? (
        <Card className="mt-10 items-center gap-3 p-10 text-center">
          {/* หาไม่เจอกับยังไม่มีใครเปิดร้าน เป็นคนละเรื่อง ต้องบอกให้ตรง */}
          <p className="font-medium">{hasFilter ? t.explore.noMatch : t.explore.empty}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {hasFilter ? t.explore.noMatchHint : t.explore.emptyHint}
          </p>
          <Button asChild variant={hasFilter ? "outline" : "default"} className="mt-2">
            <Link href={hasFilter ? "/explore" : "/for-creators"}>
              {hasFilter ? t.explore.clearFilters : t.explore.openShop}
            </Link>
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

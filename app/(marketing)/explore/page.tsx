import Link from "next/link";
import { Star } from "lucide-react";
import { ArtAvatar, ArtImage } from "@/components/art-image";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { creator, portfolio, services } from "@/lib/mock/data";
import { shopHref } from "@/lib/routes";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";

/**
 * Phase 1–2 หน้านี้ตั้งใจให้เรียบมาก — marketplace ที่ยังไม่มีคนใช้ดูแย่กว่าไม่มีเลย
 * (ดู docs/00-product-overview.md §7) ค่อยเพิ่ม ranking / ค้นหาจริงใน Phase 3
 */
export default async function ExplorePage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  // จำลองครีเอเตอร์หลายคนจากข้อมูลชุดเดียว เพื่อให้เห็นเลย์เอาต์กริดจริง
  const cards = [
    { ...creator, seedOffset: "" },
    {
      ...creator,
      handle: "arttoy",
      displayName: "Art Toy Studio",
      tagline: "รับออกแบบ adopt และ YCH · เปิดประมูลทุกสัปดาห์",
      status: "waitlist" as const,
      rating: 4.8,
      reviewCount: 31,
      seedOffset: "-b",
    },
    {
      ...creator,
      handle: "motionkid",
      displayName: "MotionKid",
      tagline: "ตัดต่อวิดีโอ · โมชันกราฟิก · OP/ED สำหรับช่อง",
      status: "open" as const,
      rating: 5.0,
      reviewCount: 18,
      seedOffset: "-c",
    },
    {
      ...creator,
      handle: "linelab",
      displayName: "Line Lab",
      tagline: "Live2D rigging และ VTuber model",
      status: "closed" as const,
      rating: 4.7,
      reviewCount: 12,
      seedOffset: "-d",
    },
  ];

  const statusTone = {
    open: "text-success",
    waitlist: "text-warning",
    closed: "text-muted-foreground",
    vacation: "text-info",
  } as const;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{t.nav.explore}</h1>
      <p className="mt-2 text-muted-foreground">{t.brand.tagline}</p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.handle} className="gap-0 overflow-hidden p-0">
            <Link href={shopHref(c.handle)} className="group block">
              <ArtImage
                seed={c.bannerSeed + c.seedOffset}
                alt=""
                ratio={2.6}
                rounded={false}
                className="transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <div className="-mt-7 px-4 pb-4">
                <ArtAvatar
                  seed={c.avatarSeed + c.seedOffset}
                  alt={c.displayName}
                  className="size-14 ring-4 ring-card"
                />
                <p className="mt-2.5 font-medium">{c.displayName}</p>
                <p className="text-xs text-muted-foreground">@{c.handle}</p>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.tagline}</p>

                <div className="mt-3 flex items-center gap-3 text-xs">
                  <span className={statusTone[c.status]}>● {t.shopStatus[c.status]}</span>
                  <span className="tabular inline-flex items-center gap-1 text-muted-foreground">
                    <Star className="size-3 fill-current" />
                    {c.rating} ({c.reviewCount})
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {services.slice(0, 2).map((s) => (
                    <Badge key={s.id} variant="secondary" className="tabular font-normal">
                      {s.title.split(" ")[0]} · {formatMoney(s.basePriceCents, "THB", locale)}
                    </Badge>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {portfolio.slice(0, 4).map((p) => (
                    <ArtImage key={p.id} seed={p.seed + c.seedOffset} alt={p.title} ratio={1} />
                  ))}
                </div>
              </div>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}

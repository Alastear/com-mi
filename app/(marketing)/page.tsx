import Link from "next/link";
import { ArrowRight, Check, Clock, Receipt, Search, ShieldCheck, Wallet, Sparkles, Paintbrush, ArrowUpRight, Pencil, MessageCircle, Gift } from "lucide-react";
import { ArtPlayground } from "@/components/art-playground";
import { StudioArt, ART_STYLES, type ArtPalette } from "@/components/studio-art";
import { ArtAvatar, ArtImage } from "@/components/art-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { listPublicShops } from "@/lib/queries/creator";
import { shopHref } from "@/lib/routes";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { DEMO_HANDLE } from "@/lib/site";
import { SERVICE_KINDS, type ShopStatus } from "@/lib/types";

/**
 * หน้าแรก — สำหรับ **คนที่มาหาคนวาดงาน** ไม่ใช่ครีเอเตอร์
 *
 * เนื้อหาฝั่งครีเอเตอร์ (เปิดร้าน ฟีเจอร์ ราคาแพ็กเกจ) ย้ายไปหน้า /for-creators แล้ว
 * หน้าเดียวที่พูดกับสองกลุ่มพร้อมกันจะไม่ชัดกับใครเลย — คนหาคนวาดไม่สนใจว่าเราคิดค่าสมาชิกเท่าไร
 * และครีเอเตอร์ก็ไม่ได้เข้ามาเพื่อหาคนวาด
 *
 * ⚠️ ตอนนี้ยังไม่มีครีเอเตอร์จริงมาก หน้านี้จึงต้องดูดีตอนว่างด้วย
 * ไม่ใช่ดีเฉพาะตอนมีของเต็ม — ไม่งั้นช่วงเปิดตัวจะดูเหมือนเว็บร้าง
 * ร้านตัวอย่างไม่ถูกนับรวมในรายการ (กรองด้วย isDemo) แต่ยังกดดูได้จากปุ่มที่บอกชัดว่าเป็นตัวอย่าง
 */
export default async function HomePage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const shops = await listPublicShops(6);

  const steps = [
    { n: "1", icon: Pencil, title: t.home.how.s1Title, body: t.home.how.s1Body },
    { n: "2", icon: MessageCircle, title: t.home.how.s2Title, body: t.home.how.s2Body },
    { n: "3", icon: Gift, title: t.home.how.s3Title, body: t.home.how.s3Body },
  ];

  const trust = [
    { icon: ShieldCheck, title: t.home.trust.termsTitle, body: t.home.trust.termsBody },
    { icon: Receipt, title: t.home.trust.priceTitle, body: t.home.trust.priceBody },
    { icon: Clock, title: t.home.trust.trackTitle, body: t.home.trust.trackBody },
    { icon: Wallet, title: t.home.trust.feeTitle, body: t.home.trust.feeBody },
  ];

  // หมวดที่คนมองหาบ่อยสุดก่อน ไม่ใช่ทั้ง 12 หมวดซึ่งจะกลายเป็นกำแพงป้ายให้อ่าน
  const categories = SERVICE_KINDS.filter((k) =>
    ["illustration", "chibi", "reference_sheet", "emote", "live2d", "adopt"].includes(k),
  );

  const statusTone: Record<ShopStatus, string> = {
    open: "text-success",
    waitlist: "text-warning",
    closed: "text-muted-foreground",
    vacation: "text-info",
  };

  return (
    <div>
      <section className="art-home-hero overflow-hidden border-b border-border/60">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-5 py-8 sm:gap-12 sm:px-8 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-20">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" aria-hidden />{t.redesign.eyebrow}
            </span>
            <h1 className="mt-6 text-[2.25rem] leading-[1.3] font-semibold tracking-tight text-balance sm:text-5xl xl:text-[3.5rem]">
              {t.redesign.heroTitle}<span className="art-headline-accent relative mt-1 block w-fit text-primary">{t.redesign.heroAccent}</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">{t.redesign.heroBody}</p>
            <form action="/explore" role="search" className="mt-7 flex flex-col gap-2 rounded-2xl border border-foreground/15 bg-card p-2 shadow-lg shadow-primary/5 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="search" name="q" placeholder={t.home.searchPlaceholder} aria-label={t.home.searchPlaceholder} className="h-12 border-0 bg-transparent pl-9 shadow-none dark:bg-transparent" />
              </div>
              <Button type="submit" size="lg" className="rounded-xl">{t.home.searchCta}<ArrowRight className="hidden size-4 sm:block" aria-hidden /></Button>
            </form>
            <p className="mt-5 hidden text-xs font-medium text-muted-foreground sm:block">{t.redesign.popular}</p>
            <div className="mt-2.5 hidden flex-wrap gap-2 sm:flex">
              {categories.map((k) => (
                <Button key={k} asChild variant="outline" size="sm" className="rounded-full bg-card/70">
                  <Link href={`/explore?kind=${k}`}>{t.serviceKind[k]}</Link>
                </Button>
              ))}
            </div>
          </div>
          <ArtPlayground copy={t.artHome} />
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 pt-14 pb-4 sm:px-8 lg:pt-20" aria-labelledby="art-categories-title">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">{t.artHome.galleryEyebrow}</p>
          <h2 id="art-categories-title" className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{t.artHome.galleryTitle}</h2>
          <p className="mt-3 text-base text-muted-foreground">{t.artHome.galleryBody}</p>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {ART_STYLES.map((kind, index) => (
            <Link key={kind} href={`/explore?kind=${kind}`} className="art-category group min-w-0 rounded-3xl border bg-card p-3 transition-transform motion-safe:hover:-translate-y-1">
              <div className="overflow-hidden rounded-2xl">
                <StudioArt kind={kind} palette={(["peach", "mint", "lilac"] as ArtPalette[])[index]} className="aspect-[21/13] w-full object-cover" />
              </div>
              <div className="px-3 pt-5 pb-3">
                <p className="text-xs font-medium text-primary">{t.serviceKind[kind]}</p>
                <h3 className="mt-2 text-xl font-semibold leading-relaxed">{t.artHome.categories[kind].title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t.artHome.categories[kind].body}</p>
                <span className="mt-5 flex items-center justify-between gap-3 text-sm font-medium">{t.artHome.galleryCta}<ArrowUpRight className="size-5 shrink-0 transition-transform motion-safe:group-hover:translate-x-1 motion-safe:group-hover:-translate-y-1" aria-hidden /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── ครีเอเตอร์ที่เปิดรับงาน ────────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-6 lg:py-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-2xl font-semibold tracking-tight">{t.home.featuredTitle}</h2><p className="mt-2 text-sm text-muted-foreground">{t.redesign.featuredNote}</p></div>
          {shops.length > 0 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/explore">
                {t.home.browseAll}
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : null}
        </div>

        {shops.length === 0 ? (
          <Card className="mt-7 items-center gap-3 border border-dashed border-primary/25 bg-primary/3 px-5 py-12 text-center shadow-none ring-0">
            <span className="mb-2 grid size-14 place-items-center rounded-2xl border border-primary/15 bg-card text-primary"><Paintbrush className="size-6" aria-hidden /></span>
            <p className="text-xs font-medium text-primary">{t.redesign.emptyEyebrow}</p>
            <h3 className="text-xl font-semibold">{t.redesign.emptyTitle}</h3>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{t.redesign.emptyBody}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/for-creators">{t.landing.heroCta}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={shopHref(DEMO_HANDLE)}>{t.landing.heroCtaSecondary}</Link>
              </Button>
            </div>
          </Card>
        ) : (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shops.map((c) => {
              const handle = c.user?.handle ?? "";
              const cheapest = c.services[0];
              return (
                <Card key={c.id} className="gap-0 overflow-hidden p-0 transition-shadow hover:shadow-lg">
                  <Link href={shopHref(handle)} className="group block">
                    <ArtImage
                      seed={c.id}
                      src={c.banner?.url}
                      alt=""
                      ratio={2.6}
                      rounded={false}
                      className="transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    <div className="relative -mt-7 px-5 pb-5">
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

                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className={statusTone[c.status as ShopStatus]}>
                          ● {t.shopStatus[c.status as ShopStatus]}
                        </span>
                        {cheapest ? (
                          <span className="tabular text-muted-foreground">
                            {t.common.from}{" "}
                            {formatMoney(cheapest.basePriceCents, "THB", locale)}
                          </span>
                        ) : null}
                      </div>

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
      </section>

      {/* ── สั่งงานยังไง ──────────────────────────────────── */}
      <section className="art-journey border-y bg-card/60">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 py-16">
          <p className="mb-2 text-xs font-medium text-primary">{t.redesign.howEyebrow}</p><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.home.howTitle}</h2>
          <ol className="relative mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="relative rounded-2xl border bg-card p-6">
                <div className="flex items-center justify-between">
                  <span className="tabular text-3xl font-semibold text-primary/50">0{s.n}</span>
                  <s.icon className="size-7 text-primary" aria-hidden />
                </div>
                <h3 className="mt-3 font-medium">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── ทำไมสั่งที่นี่ ────────────────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-5 sm:px-8 py-16">
        <p className="mb-2 text-xs font-medium text-primary">{t.redesign.trustEyebrow}</p><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.home.trustTitle}</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {trust.map((x) => (
            <div key={x.title} className="flex gap-4 rounded-2xl border bg-card p-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-card">
                <x.icon className="size-4 text-primary" />
              </span>
              <div className="min-w-0">
                <h3 className="font-medium">{x.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{x.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── ทางเข้าฝั่งครีเอเตอร์ ─────────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-5 sm:px-8 pb-20">
        <Card className="art-creator-banner relative flex-row flex-wrap items-center gap-6 overflow-hidden border-primary/20 p-6 sm:p-10">
          <span className="art-creator-doodle" aria-hidden>✳</span>
          <div className="relative min-w-0 basis-full lg:flex-1">
            <p className="mb-3 text-sm font-medium text-primary">{t.artHome.creatorEyebrow}</p>
            <p className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
              {t.home.forCreatorsTitle}
              <Badge variant="secondary" className="font-normal">
                <Check className="size-3" />
                {t.landing.heroNote}
              </Badge>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t.home.forCreatorsBody}</p>
          </div>
          <Button asChild>
            <Link href="/for-creators">
              {t.home.forCreatorsCta}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Card>
      </section>
    </div>
  );
}

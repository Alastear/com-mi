import Link from "next/link";
import { ArrowRight, Check, Clock, Receipt, Search, ShieldCheck, Wallet } from "lucide-react";
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
    { n: "1", title: t.home.how.s1Title, body: t.home.how.s1Body },
    { n: "2", title: t.home.how.s2Title, body: t.home.how.s2Body },
    { n: "3", title: t.home.how.s3Title, body: t.home.how.s3Body },
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
      {/* ── หา ─────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-4xl px-4 pt-16 pb-10 text-center lg:pt-24">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t.home.heroTitle}{" "}
          <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">
            {t.home.heroTitleAccent}
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground sm:text-lg">
          {t.home.heroSubtitle}
        </p>

        {/*
          ฟอร์มธรรมดาแบบ GET — ไม่ต้องใช้ JavaScript ก็ค้นได้ และปุ่ม Enter ทำงานเอง
          ปลายทางคือ /explore ซึ่งเป็นหน้ารายการเต็ม
        */}
        <form action="/explore" className="mx-auto mt-7 flex max-w-lg gap-2">
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              name="q"
              placeholder={t.home.searchPlaceholder}
              aria-label={t.home.searchPlaceholder}
              className="h-11 pl-9"
            />
          </div>
          <Button type="submit" size="lg" className="h-11">
            {t.home.searchCta}
          </Button>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {categories.map((k) => (
            <Button key={k} asChild variant="outline" size="sm" className="rounded-full">
              <Link href={`/explore?kind=${k}`}>{t.serviceKind[k]}</Link>
            </Button>
          ))}
        </div>
      </section>

      {/* ── ครีเอเตอร์ที่เปิดรับงาน ────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{t.home.featuredTitle}</h2>
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
          <Card className="mt-5 items-center gap-3 p-10 text-center">
            <p className="font-medium">{t.home.featuredEmpty}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t.home.featuredEmptyBody}</p>
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
      <section className="border-t bg-card/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.home.howTitle}</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n}>
                <span className="tabular grid size-9 place-items-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                  {s.n}
                </span>
                <h3 className="mt-3 font-medium">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── ทำไมสั่งที่นี่ ────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.home.trustTitle}</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {trust.map((x) => (
            <div key={x.title} className="flex gap-3.5">
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
      <section className="mx-auto w-full max-w-6xl px-4 pb-20">
        <Card className="flex-row flex-wrap items-center gap-4 border-primary/30 bg-primary/5 p-6">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium">
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

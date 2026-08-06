import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock, Star } from "lucide-react";
import { ArtAvatar, ArtImage } from "@/components/art-image";
import { ShopStatusPill } from "@/components/status-pill";
import { CopyLinkButton } from "@/components/copy-link-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getCreator, portfolio, reviews, services } from "@/lib/mock/data";
import { serviceHref } from "@/lib/routes";
import { formatDate, formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { fill, getDictionary } from "@/lib/i18n/dictionaries";
import { shopUrl } from "@/lib/site";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const c = getCreator(handle);
  if (!c) return { title: "404" };
  return {
    title: `${c.displayName} (@${c.handle})`,
    description: c.tagline,
    openGraph: { title: c.displayName, description: c.tagline },
  };
}

export default async function CreatorPage({ params }: Props) {
  const { handle } = await params;
  const creator = getCreator(handle);
  if (!creator) notFound();

  const locale = await getLocale();
  const t = getDictionary(locale);
  const slotsLeft = creator.slotsTotal - creator.queueCount;

  return (
    <div className="pb-20">
      {/* ── Banner + identity ────────────────────────────── */}
      {/*
        แบนเนอร์อยู่ในคอนเทนเนอร์เดียวกับเนื้อหา (max-w-6xl เท่ากับ header/footer)
        ถ้าปล่อยเต็มขอบจอ พอจอกว้าง ๆ อวาตาร์กับชื่อจะลอยอยู่กลางที่ว่าง
        และไม่ตรงกับโลโก้บน header — เหมือนหน้าโปรไฟล์ที่วางผิดกริด
        บนมือถือยังเต็มขอบอยู่เพื่อความรู้สึกเต็มจอ
      */}
      <div className="mx-auto w-full max-w-6xl sm:px-4 sm:pt-4">
        <ArtImage
          seed={creator.bannerSeed}
          alt=""
          rounded={false}
          className="h-40 w-full sm:h-52 sm:rounded-2xl lg:h-60"
          ratio={null}
        />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
          <ArtAvatar
            seed={creator.avatarSeed}
            alt={creator.displayName}
            className="size-24 ring-4 ring-background sm:size-28"
          />

          <div className="flex-1 pb-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {creator.displayName}
            </h1>
            <p className="text-sm text-muted-foreground">@{creator.handle}</p>
          </div>

          <div className="flex gap-2 pb-1">
            <CopyLinkButton
              value={shopUrl(creator.handle)}
              label={t.common.share}
              size="sm"
            />
            <Button asChild size="sm">
              <a href="#menu">{t.creator.viewMenu}</a>
            </Button>
          </div>
        </div>

        <p className="mt-4 max-w-2xl text-muted-foreground">{creator.tagline}</p>

        {/* สถานะร้าน — ข้อมูลชิ้นที่สำคัญที่สุดบนหน้านี้ ต้องอยู่สูงและอ่านง่าย */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <ShopStatusPill status={creator.status} />
          <span className="tabular text-sm text-muted-foreground">
            {t.creator.queueCount} {creator.queueCount}
            {slotsLeft > 0 ? ` · ${fill(t.creator.slotsLeft, { n: slotsLeft })}` : ` · ${t.creator.fullyBooked}`}
          </span>
          <span className="tabular inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-3.5" />
            {t.creator.avgDelivery} {creator.avgDeliveryDays} {t.common.days}
          </span>
          <span className="tabular inline-flex items-center gap-1.5 text-sm">
            <Star className="size-3.5 fill-warning text-warning" />
            <span className="font-medium">{creator.rating}</span>
            <span className="text-muted-foreground">
              ({creator.reviewCount} {t.creator.reviewCount})
            </span>
          </span>
        </div>

        {/*
          prototype: แสดงเป็นชิปเฉย ๆ ไม่ใช่ลิงก์
          เพราะ URL ใน mock เป็นของปลอม กดแล้วจะพาออกไปบัญชีคนอื่นจริง ๆ
          ตอนต่อ DB ค่อยเปลี่ยนเป็น <a href={s.url}> ที่ชี้ไปบัญชีจริงของครีเอเตอร์
        */}
        <ul className="mt-4 flex flex-wrap gap-2">
          {creator.socials.map((s) => (
            <li
              key={s.platform}
              className="rounded-md border px-2.5 py-1 text-sm text-muted-foreground"
            >
              {s.platform}
            </li>
          ))}
        </ul>

        <Separator className="my-10" />

        {/* ── เมนูรับงาน ─────────────────────────────────── */}
        <section id="menu" className="scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight">{t.creator.menuTitle}</h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <Card key={s.id} className="group gap-0 overflow-hidden p-0">
                <Link href={serviceHref(creator.handle, s.slug)} className="block">
                  <ArtImage
                    seed={s.coverSeed}
                    alt={s.title}
                    ratio={1.25}
                    rounded={false}
                    className="transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="leading-snug font-medium">{s.title}</h3>
                      <Badge
                        variant={s.mode === "instant" ? "default" : "secondary"}
                        className="shrink-0 text-[10px]"
                      >
                        {s.mode === "instant" ? t.service.instantOrder : t.service.customProposal}
                      </Badge>
                    </div>

                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                      {s.description}
                    </p>

                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <p className="text-[11px] text-muted-foreground">{t.service.startingAt}</p>
                        <p className="tabular text-lg font-semibold">
                          {formatMoney(
                            s.basePriceCents + Math.min(...s.tiers.map((x) => x.priceDeltaCents)),
                            creator.currency,
                            locale,
                          )}
                        </p>
                      </div>
                      <p className="tabular text-right text-xs text-muted-foreground">
                        {t.service.deliveryIn} {s.deliveryDays} {t.common.days}
                        <br />
                        {t.service.revisions} {s.revisionsIncluded} {t.service.times}
                      </p>
                    </div>
                  </div>
                </Link>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="my-10" />

        {/* ── ผลงาน ──────────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-semibold tracking-tight">{t.creator.portfolioTitle}</h2>

          <div className="masonry mt-5 columns-2 sm:columns-3 lg:columns-4">
            {portfolio.map((p) => (
              <figure key={p.id} className="group relative">
                <ArtImage seed={p.seed} alt={p.title} ratio={1 / p.ratio} />
                <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/75 to-transparent p-2.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-xs font-medium text-white">{p.title}</span>
                </figcaption>
                {p.linkedServiceSlug ? (
                  <Link
                    href={serviceHref(creator.handle, p.linkedServiceSlug)}
                    className="absolute inset-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="sr-only">
                      {t.creator.orderNow} — {p.title}
                    </span>
                  </Link>
                ) : null}
              </figure>
            ))}
          </div>
        </section>

        <Separator className="my-10" />

        {/* ── รีวิว + ข้อตกลง ────────────────────────────── */}
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
          <section>
            <h2 className="text-xl font-semibold tracking-tight">{t.creator.reviewsTitle}</h2>
            <ul className="mt-5 space-y-4">
              {reviews.map((r) => (
                <li key={r.id}>
                  <Card className="gap-2 p-4">
                    <div className="flex items-center gap-3">
                      <ArtAvatar seed={r.clientSeed} alt={r.clientName} className="size-9" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{r.clientName}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.serviceTitle}</p>
                      </div>
                      <div className="flex shrink-0 gap-0.5" aria-label={`${r.rating} / 5`}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star
                            key={i}
                            className={
                              i < r.rating
                                ? "size-3.5 fill-warning text-warning"
                                : "size-3.5 text-muted-foreground/30"
                            }
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed">{r.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(r.createdAt, locale)}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">{t.creator.tosTitle}</h2>
            <Card className="mt-5 p-5">
              <p className="text-sm leading-relaxed text-muted-foreground">{creator.about}</p>
              <Separator className="my-4" />
              <ol className="space-y-2.5 text-sm">
                {creator.tos.map((line, i) => (
                  <li key={line} className="flex gap-2.5">
                    <span className="tabular mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{line}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </section>
        </div>

        {/* ── CTA ล่างสุด ────────────────────────────────── */}
        <Card className="mt-10 flex-row items-center gap-4 p-5">
          <div className="flex-1">
            <p className="font-medium">{t.creator.orderNow}</p>
            <p className="text-sm text-muted-foreground">{creator.tagline}</p>
          </div>
          <Button asChild>
            <a href="#menu">
              {t.creator.viewMenu}
              <ArrowRight className="size-4" />
            </a>
          </Button>
        </Card>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          {t.creator.poweredBy}{" "}
          <Link href="/" className="underline underline-offset-2">
            {t.brand.name}
          </Link>
        </p>
      </div>
    </div>
  );
}

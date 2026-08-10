import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock, Eye } from "lucide-react";
import { ArtAvatar, ArtImage } from "@/components/art-image";
import { ArtMedia } from "@/components/art-media";
import { ShopStatusPill } from "@/components/status-pill";
import { CopyLinkButton } from "@/components/copy-link-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getShopByHandle } from "@/lib/queries/creator";
import { getSession } from "@/lib/auth-guard";
import { serviceHref, shopHref } from "@/lib/routes";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { fill, getDictionary } from "@/lib/i18n/dictionaries";
import { shopUrl } from "@/lib/site";
import { normalizeHandle, redirectToCanonicalHandle } from "@/lib/canonical";
import type { ShopStatus } from "@/lib/types";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const shop = await getShopByHandle(handle);
  if (!shop) return { title: "404" };
  return {
    title: `${shop.displayName} (@${shop.owner.handle})`,
    description: shop.tagline,
    openGraph: { title: shop.displayName, description: shop.tagline },
  };
}

export default async function CreatorPage({ params }: Props) {
  const { handle } = await params;
  // ต้องอยู่ในตัวหน้า ไม่ใช่ generateMetadata — redirect จาก metadata ไม่มีผลกับ response
  redirectToCanonicalHandle(handle, shopHref(normalizeHandle(handle)));

  const shop = await getShopByHandle(handle);
  if (!shop) notFound();

  const locale = await getLocale();
  const t = getDictionary(locale);

  /**
   * ร้านที่ยังไม่กด publish: เจ้าของเห็น preview พร้อมแถบเตือน คนอื่นเห็น 404
   * (docs/04-ux-and-ia.md §6 — หน้าที่มักลืมแต่ต้องมี)
   */
  const session = await getSession();
  const isOwner = session?.user.id === shop.userId;
  if (!shop.isPublished && !isOwner) notFound();

  const ownerHandle = shop.owner.handle ?? handle;
  const avatarSrc = shop.avatar?.url ?? shop.owner.image ?? null;
  const hasServices = shop.services.length > 0;

  return (
    <div className="pb-20">
      {!shop.isPublished && isOwner ? (
        <div className="border-b border-warning/30 bg-warning/10">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <Eye className="size-4 shrink-0 text-warning" />
            <span className="text-warning">{t.shop.unpublishedNotice}</span>
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <Link href="/shop">{t.shop.publishCta}</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {/*
        แบนเนอร์อยู่ในคอนเทนเนอร์เดียวกับเนื้อหา (max-w-6xl เท่ากับ header/footer)
        ถ้าปล่อยเต็มขอบจอ พอจอกว้าง ๆ อวาตาร์กับชื่อจะลอยอยู่กลางที่ว่าง
        และไม่ตรงกับโลโก้บน header — เหมือนหน้าโปรไฟล์ที่วางผิดกริด
      */}
      <div className="mx-auto w-full max-w-6xl sm:px-4 sm:pt-4">
        <ArtImage
          seed={shop.id}
          src={shop.banner?.url}
          alt=""
          rounded={false}
          className="h-40 w-full sm:h-52 sm:rounded-2xl lg:h-60"
          ratio={null}
        />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4">
        {/*
          อวาตาร์ยื่นขึ้นไปคร่อมแบนเนอร์ได้ แต่ "ชื่อร้านต้องอยู่ใต้แบนเนอร์เสมอ"
          เดิมชื่อถูกจัดชิดล่างในแถวเดียวกับอวาตาร์ พอ h1 สูงกว่าครึ่งล่างของอวาตาร์
          ตัวอักษรก็โผล่ไปทับรูปปก — ยิ่งชื่อยาวหรือจอแคบยิ่งทับหนัก
          แยกชื่อออกมาเป็นบรรทัดของตัวเองจึงไม่มีทางชนกันไม่ว่าชื่อยาวแค่ไหน
        */}
        <div className="-mt-12 sm:-mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <ArtAvatar
              seed={shop.userId}
              src={avatarSrc}
              alt={shop.displayName}
              className="size-24 ring-4 ring-background sm:size-28"
            />

            <div className="flex gap-2">
              <CopyLinkButton value={shopUrl(ownerHandle)} label={t.common.share} size="sm" />
              {hasServices ? (
                <Button asChild size="sm">
                  <a href="#menu">{t.creator.viewMenu}</a>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {shop.displayName}
            </h1>
            <p className="text-sm text-muted-foreground">@{ownerHandle}</p>
          </div>
        </div>

        {shop.tagline ? (
          <p className="mt-4 max-w-2xl text-muted-foreground">{shop.tagline}</p>
        ) : null}

        {/* สถานะร้าน — ข้อมูลชิ้นที่สำคัญที่สุดบนหน้านี้ ต้องอยู่สูงและอ่านง่าย */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <ShopStatusPill
            status={shop.status as ShopStatus}
            note={shop.statusNote || undefined}
          />
          {shop.slotsTotal > 0 ? (
            <span className="tabular text-sm text-muted-foreground">
              {fill(t.creator.slotsLeft, { n: shop.slotsTotal })}
            </span>
          ) : null}
          {hasServices ? (
            <span className="tabular inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-3.5" />
              {t.service.deliveryIn}{" "}
              {Math.min(...shop.services.map((s) => s.deliveryDays))}–
              {Math.max(...shop.services.map((s) => s.deliveryDays))} {t.common.days}
            </span>
          ) : null}
        </div>

        {shop.socials.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {shop.socials.map((s) => (
              <li key={s.platform}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener nofollow"
                  className="inline-block rounded-md border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {s.platform}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <Separator className="my-10" />

        {/* ── เมนูรับงาน ─────────────────────────────────── */}
        <section id="menu" className="scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight">{t.creator.menuTitle}</h2>

          {hasServices ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shop.services.map((s) => {
                const cheapestDelta = s.tiers.length
                  ? Math.min(...s.tiers.map((x) => x.priceDeltaCents))
                  : 0;
                return (
                  <Card key={s.id} className="group gap-0 overflow-hidden p-0">
                    <Link href={serviceHref(ownerHandle, s.slug)} className="block">
                      <ArtImage
                        seed={s.id}
                        src={s.cover?.url}
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
                            {s.mode === "instant"
                              ? t.service.instantOrder
                              : t.service.customProposal}
                          </Badge>
                        </div>

                        {s.description ? (
                          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                            {s.description}
                          </p>
                        ) : null}

                        <div className="mt-3 flex items-end justify-between gap-2">
                          <div>
                            <p className="text-[11px] text-muted-foreground">
                              {t.service.startingAt}
                            </p>
                            <p className="tabular text-lg font-semibold">
                              {formatMoney(
                                s.basePriceCents + cheapestDelta,
                                shop.currency,
                                locale,
                              )}
                            </p>
                          </div>
                          <p className="tabular shrink-0 text-right text-xs text-muted-foreground">
                            {t.service.deliveryIn} {s.deliveryDays} {t.common.days}
                            <br />
                            {t.service.revisions} {s.revisionsIncluded} {t.service.times}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="mt-5 items-center gap-3 p-10 text-center">
              <p className="text-sm text-muted-foreground">{t.shop.noServices}</p>
              {isOwner ? (
                <Button asChild size="sm">
                  <Link href="/services">{t.service.addService}</Link>
                </Button>
              ) : null}
            </Card>
          )}
        </section>

        {/* ── ผลงาน ──────────────────────────────────────── */}
        {shop.portfolio.length > 0 ? (
          <>
            <Separator className="my-10" />
            <section>
              <h2 className="text-xl font-semibold tracking-tight">{t.creator.portfolioTitle}</h2>
              <div className="masonry mt-5 columns-2 sm:columns-3 lg:columns-4">
                {shop.portfolio.map((p) => {
                  const m = p.media;
                  const ratio = m?.width && m.height ? m.width / m.height : 1;
                  // วิดีโอที่อัปเองดูจาก contentType ไม่ใช่จากนามสกุลใน URL
                  const isVideo = Boolean(m?.contentType?.startsWith("video/"));
                  const linkedSlug = shop.services.find(
                    (s) => s.id === p.linkedServiceId,
                  )?.slug;
                  return (
                    <figure key={p.id} className="group relative">
                      <ArtMedia
                        seed={p.mediaId ?? p.id}
                        alt={p.title || t.creator.portfolioTitle}
                        ratio={ratio}
                        posterUrl={m?.posterUrl ?? (isVideo ? null : (m?.url ?? null))}
                        videoUrl={isVideo ? (m?.url ?? null) : null}
                        embedRef={p.embedRef}
                        durationSeconds={m?.durationSeconds ?? null}
                      />
                      {p.title ? (
                        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/75 to-transparent p-2.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="text-xs font-medium text-white">{p.title}</span>
                        </figcaption>
                      ) : null}
                      {linkedSlug ? (
                        <Link
                          href={serviceHref(ownerHandle, linkedSlug)}
                          className="absolute inset-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <span className="sr-only">
                            {t.creator.orderNow} — {p.title}
                          </span>
                        </Link>
                      ) : null}
                    </figure>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {/* ── เกี่ยวกับ + ข้อตกลง ────────────────────────── */}
        {shop.about || shop.tos.length > 0 ? (
          <>
            <Separator className="my-10" />
            <section className="max-w-2xl">
              <h2 className="text-xl font-semibold tracking-tight">{t.creator.tosTitle}</h2>
              <Card className="mt-5 p-5">
                {shop.about ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">{shop.about}</p>
                ) : null}
                {shop.about && shop.tos.length > 0 ? <Separator className="my-4" /> : null}
                {shop.tos.length > 0 ? (
                  <ol className="space-y-2.5 text-sm">
                    {shop.tos.map((line, i) => (
                      <li key={line} className="flex gap-2.5">
                        <span className="tabular mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{line}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </Card>
            </section>
          </>
        ) : null}

        {hasServices ? (
          <Card className="mt-10 flex-row items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.creator.orderNow}</p>
              <p className="truncate text-sm text-muted-foreground">{shop.tagline}</p>
            </div>
            <Button asChild className="shrink-0">
              <a href="#menu">
                {t.creator.viewMenu}
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </Card>
        ) : null}

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

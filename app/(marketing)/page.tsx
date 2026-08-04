import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Gavel,
  LayoutGrid,
  QrCode,
  Store,
  ClipboardList,
} from "lucide-react";
import { ArtAvatar, ArtImage } from "@/components/art-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { creator, portfolio, services } from "@/lib/mock/data";
import { shopHref } from "@/lib/routes";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default async function LandingPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  const features = [
    { icon: Store, title: t.landing.features.shopTitle, body: t.landing.features.shopBody },
    { icon: LayoutGrid, title: t.landing.features.queueTitle, body: t.landing.features.queueBody },
    { icon: ClipboardList, title: t.landing.features.briefTitle, body: t.landing.features.briefBody },
    { icon: QrCode, title: t.landing.features.payTitle, body: t.landing.features.payBody },
    { icon: Bell, title: t.landing.features.notifyTitle, body: t.landing.features.notifyBody },
    { icon: Gavel, title: t.landing.features.adoptTitle, body: t.landing.features.adoptBody },
  ];

  const steps = [
    { n: "1", title: t.landing.how.s1Title, body: t.landing.how.s1Body },
    { n: "2", title: t.landing.how.s2Title, body: t.landing.how.s2Body },
    { n: "3", title: t.landing.how.s3Title, body: t.landing.how.s3Body },
  ];

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(45% 60% at 30% 50%, var(--primary) 0%, transparent 70%), radial-gradient(40% 55% at 72% 40%, var(--info) 0%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 pt-16 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <span className="size-1.5 rounded-full bg-success" />
              {t.landing.heroNote}
            </p>

            <h1 className="mt-5 text-4xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
              {t.landing.heroTitle}{" "}
              <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">
                {t.landing.heroTitleAccent}
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t.landing.heroSubtitle}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/dashboard">
                  {t.landing.heroCta}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={shopHref(creator.handle)}>{t.landing.heroCtaSecondary}</Link>
              </Button>
            </div>

            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              {[
                { k: t.creator.completed, v: "132" },
                { k: t.creator.rating, v: "4.9 ★" },
                { k: t.creator.avgDelivery, v: `9 ${t.common.days}` },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-muted-foreground">{s.k}</dt>
                  <dd className="tabular text-lg font-semibold">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* ตัวอย่างหน้าร้านย่อส่วน — สื่อสารว่า "ได้อะไร" เร็วกว่าคำอธิบาย */}
          <div className="relative">
            <Card className="overflow-hidden p-0 shadow-2xl">
              <ArtImage seed={creator.bannerSeed} alt="" ratio={3} rounded={false} />
              <div className="-mt-8 px-5 pb-5">
                <ArtAvatar
                  seed={creator.avatarSeed}
                  alt={creator.displayName}
                  className="size-16 ring-4 ring-card"
                />
                <p className="mt-3 font-semibold">{creator.displayName}</p>
                <p className="text-xs text-muted-foreground">@{creator.handle}</p>
                <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-success">
                  <span className="size-1.5 rounded-full bg-success" />
                  {t.shopStatus.open}
                  <span className="text-muted-foreground">
                    · {t.creator.queueCount} {creator.queueCount}
                  </span>
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {services.slice(0, 3).map((s) => (
                    <div key={s.id} className="rounded-lg border bg-background/40 p-2">
                      <ArtImage seed={s.coverSeed} alt={s.title} ratio={1.1} className="mb-2" />
                      <p className="truncate text-[11px] font-medium">{s.title}</p>
                      <p className="tabular text-[11px] text-muted-foreground">
                        {formatMoney(s.basePriceCents, creator.currency, locale)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="masonry mt-3 columns-3">
                  {portfolio.slice(0, 6).map((p) => (
                    <ArtImage key={p.id} seed={p.seed} alt={p.title} ratio={1 / p.ratio} />
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section className="border-t bg-card/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t.landing.featuresTitle}
          </h2>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="gap-3 p-5">
                <div className="grid size-9 place-items-center rounded-lg border border-primary/25 bg-primary/10">
                  <f.icon className="size-4 text-primary" />
                </div>
                <h3 className="font-medium">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.landing.howTitle}</h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="relative">
              <span className="tabular grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {s.n}
              </span>
              <p className="mt-4 font-medium">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20">
        <Card className="relative overflow-hidden p-8 text-center sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              background:
                "radial-gradient(60% 120% at 50% 0%, var(--primary) 0%, transparent 65%)",
            }}
          />
          <div className="relative">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t.landing.ctaTitle}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">{t.landing.ctaBody}</p>
            <Button asChild size="lg" className="mt-7">
              <Link href="/dashboard">
                {t.landing.heroCta}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </Card>
      </section>
    </>
  );
}

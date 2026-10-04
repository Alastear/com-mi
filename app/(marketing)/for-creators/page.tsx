import { CAPABILITY_SURFACES, capabilityPresentation, type CapabilityGroup } from "@/lib/capabilities/registry";
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
import { ComingSoonBadge } from "@/components/locked-feature";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BETA_FREE_PRO } from "@/lib/billing/plans";
import { creator, portfolio, services } from "@/lib/mock/data";
import { DEMO_HANDLE } from "@/lib/site";
import { shopHref } from "@/lib/routes";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { fill, getDictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

/**
 * หน้าสำหรับครีเอเตอร์ — เนื้อหาชุดนี้เคยอยู่ที่ `/`
 *
 * ย้ายออกมาเพราะหน้าแรกต้องพูดกับ "คนที่มาหาคนวาดงาน" ซึ่งเป็นคนละกลุ่มกัน
 * หน้าเดียวที่พูดกับสองกลุ่มพร้อมกันจะไม่ชัดกับใครเลย
 *
 * ภาพหน้าร้านย่อส่วนในหน้านี้ยังใช้ข้อมูลจำลองโดยตั้งใจ — เป็นภาพประกอบว่า
 * "เปิดร้านแล้วจะได้อะไร" ไม่ใช่ข้อมูลของผู้ใช้จริง
 */
export default async function LandingPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  /**
   * ⚠️ ทุกการ์ดต้องตรงกับของที่ใช้ได้บนเว็บจริงวันนี้ — ตรวจกับโค้ดแล้ว (ก.ย. 2569)
   *
   * `soon: true`  = ทั้งการ์ดยังไม่มีโค้ดรองรับ (ประมูล — หน้า /listings เป็นภาพตัวอย่าง)
   * `soonNote`    = การ์ดนั้นมีของจริงแล้ว แต่ส่วนที่เคยโฆษณาไว้บางส่วนยังไม่มี
   *                 เช่น อีเมลส่งจริงแล้ว แต่ Push/Discord ยังไม่มีสักบรรทัด
   *                 ฟอร์มบรีฟมีจริงแต่เป็นชุดเดียวตายตัว ออกแบบเองไม่ได้และแนบไฟล์ไม่ได้
   *
   * ไม่ลบของที่ยังไม่มีทิ้ง — ติดป้ายไว้ให้เห็นว่ากำลังจะมา แต่ไม่ให้อ่านเหมือนมีแล้ว
   */
  const features: Array<{
    icon: typeof Store;
    title: string;
    body: string;
    soon?: true;
    soonNote?: string;
    capabilities?: CapabilityGroup;
  }> = [
    { icon: Store, title: t.landing.features.shopTitle, body: t.landing.features.shopBody },
    { icon: LayoutGrid, title: t.landing.features.queueTitle, body: t.landing.features.queueBody },
    {
      icon: ClipboardList,
      title: t.landing.features.briefTitle,
      body: t.landing.features.briefBody,
      soonNote: capabilityPresentation(CAPABILITY_SURFACES.marketing.brief).soon ? t.landing.features.briefSoon : undefined,
      capabilities: CAPABILITY_SURFACES.marketing.brief,
    },
    { icon: QrCode, title: t.landing.features.payTitle, body: t.landing.features.payBody },
    {
      icon: Bell,
      title: t.landing.features.notifyTitle,
      body: t.landing.features.notifyBody,
      soonNote: capabilityPresentation(CAPABILITY_SURFACES.marketing.notify).soon ? t.landing.features.notifySoon : undefined,
      capabilities: CAPABILITY_SURFACES.marketing.notify,
    },
    {
      icon: Gavel,
      title: t.landing.features.adoptTitle,
      body: t.landing.features.adoptBody,
      ...capabilityPresentation(CAPABILITY_SURFACES.marketing.adopt),
    },
  ];

  /**
   * ข้อเท็จจริงใต้ปุ่ม — เดิมเป็นสถิติที่แต่งขึ้น "ส่งแล้ว 132 งาน · 4.9★ · ส่งเฉลี่ย 9 วัน"
   * วางไว้ใต้หัวข้อเหมือนเป็นผลงานของแพลตฟอร์ม ทั้งที่ยังไม่มีงานไหนผ่านระบบครบขนาดนั้น
   * และระบบรีวิวก็ไม่มีอยู่จริง ตอนนี้ใช้ข้อที่จริงกับทุกร้านตั้งแต่วันแรก
   * (ไม่หักเปอร์เซ็นต์ · เงินเข้าบัญชีตรง · เบต้าได้ Pro ฟรี — ดู BETA_FREE_PRO)
   *
   * ⚠️ อย่าใส่ตัวเลขสถิติกลับมาจนกว่าจะคำนวณจากข้อมูลจริงใน DB ได้
   */
  const facts = [
    { k: t.landing.facts.feeLabel, v: t.landing.facts.feeValue },
    { k: t.landing.facts.payoutLabel, v: t.landing.facts.payoutValue },
    ...(BETA_FREE_PRO ? [{ k: t.landing.facts.betaLabel, v: t.landing.facts.betaValue }] : []),
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
                <Link href={shopHref(DEMO_HANDLE)}>{t.landing.heroCtaSecondary}</Link>
              </Button>
            </div>

            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              {facts.map((s) => (
                <div key={s.k}>
                  <dt className="text-muted-foreground">{s.k}</dt>
                  <dd className="tabular text-lg font-semibold">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/*
            ตัวอย่างหน้าร้านย่อส่วน — สื่อสารว่า "ได้อะไร" เร็วกว่าคำอธิบาย
            ข้อมูลข้างในมาจาก lib/mock ทั้งหมด จึงต้องมีป้ายบอกว่าเป็นตัวอย่าง
            ไม่งั้นชื่อร้าน ราคา และจำนวนช่องอ่านเหมือนร้านจริงบนแพลตฟอร์ม
          */}
          <div className="relative">
            <p className="absolute top-3 left-3 z-10 rounded-full border bg-background/85 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              {t.landing.exampleLabel}
            </p>
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
                  {/* ข้อความเดียวกับหน้าร้านจริง — ตัวอย่างต้องไม่โชว์สิ่งที่ร้านจริงไม่มี */}
                  <span className="text-muted-foreground">
                    · {fill(t.creator.slotsOpen, { n: creator.slotsTotal })}
                  </span>
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {services.slice(0, 3).map((s) => (
                    <div key={s.id} className="rounded-lg border bg-background/40 p-2">
                      <ArtImage seed={s.coverSeed} alt={s.title} ratio={1.1} className="mb-2" />
                      <p className="truncate text-xs font-medium">{s.title}</p>
                      <p className="tabular text-xs text-muted-foreground">
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
              <Card key={f.title} className={cn("gap-3 p-5", f.soon && "border-dashed")}>
                <div
                  className={cn(
                    "grid size-9 place-items-center rounded-lg border",
                    f.soon ? "bg-muted/50" : "border-primary/25 bg-primary/10",
                  )}
                >
                  <f.icon className={cn("size-4", f.soon ? "text-muted-foreground" : "text-primary")} />
                </div>
                <h3 className="flex flex-wrap items-center gap-2 font-medium">
                  {f.title}
                  {f.soon ? <ComingSoonBadge capabilities={f.capabilities} /> : null}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                {f.soonNote ? (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <ComingSoonBadge capabilities={f.capabilities} />
                    {f.soonNote}
                  </p>
                ) : null}
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

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, Minus, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ArtImage } from "@/components/art-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dynamicHref, shopHref } from "@/lib/routes";
import type { getShopByHandle } from "@/lib/queries/creator";
import { createOrder } from "@/lib/orders/create";
import { quoteOrder } from "@/lib/orders/pricing";
import { fill } from "@/lib/i18n/dictionaries";

type Shop = NonNullable<Awaited<ReturnType<typeof getShopByHandle>>>;
type ShopService = Shop["services"][number];

type Step = 0 | 1 | 2;

/**
 * ฟอร์มบรีฟชุด preset (แพ็กเกจ Free ได้ 3 แบบให้เลือก แก้ label ได้แต่เพิ่มฟิลด์ไม่ได้)
 * ของจริงมาจาก `service.formSchema` ใน DB — ดู docs/02-data-model.md §7
 */
const BRIEF_FIELDS = [
  { key: "character", type: "text", required: true },
  { key: "mood", type: "text", required: true },
  { key: "detail", type: "textarea", required: false },
  { key: "avoid", type: "text", required: false },
] as const satisfies ReadonlyArray<{
  key: keyof Dictionary["brief"];
  type: "text" | "textarea";
  required: boolean;
}>;

export function ServiceOrderFlow({
  service,
  shop,
}: {
  service: ShopService;
  shop: Shop;
}) {
  const { t, locale } = useLocale();

  const router = useRouter();
  const pathname = usePathname();
  const [pending, startSubmit] = useTransition();

  const [step, setStep] = useState<Step>(0);
  const [tierId, setTierId] = useState(service.tiers.at(-1)?.id ?? "");
  const [options, setOptions] = useState<Record<string, number>>({});
  const [brief, setBrief] = useState<Record<string, string>>({});
  const [tosAccepted, setTosAccepted] = useState(false);
  const [hideFromQueue, setHideFromQueue] = useState(false);

  const tier = service.tiers.find((x) => x.id === tierId) ?? service.tiers[0] ?? null;

  /**
   * ยอดที่โชว์มาจาก `quoteOrder` ตัวเดียวกับที่ server ใช้ตอนบันทึกจริง
   * ถ้าแยกเป็นสองสูตร วันหนึ่งจะเพี้ยนกันแล้วลูกค้าเห็นราคาไม่ตรงกับที่ถูกเรียกเก็บ
   */
  const quote = useMemo(
    () =>
      quoteOrder(
        {
          title: service.title,
          basePriceCents: service.basePriceCents,
          tiers: service.tiers,
          options: service.options,
        },
        {
          tierId: tier?.id ?? null,
          options: Object.entries(options).map(([optionId, quantity]) => ({ optionId, quantity })),
        },
      ),
    [service, tier, options],
  );

  const total = quote.totalCents;

  const briefComplete = BRIEF_FIELDS.filter((f) => f.required).every((f) =>
    (brief[f.key] ?? "").trim(),
  );

  const steps = [t.service.stepPackage, t.service.stepBrief, t.service.stepConfirm];

  function toggleOption(id: string, next: number) {
    setOptions((prev) => ({ ...prev, [id]: Math.max(0, next) }));
    // ของจริงจะบันทึกร่างลง localStorage ทุก 2 วินาที (docs/04-ux-and-ia.md §3.2)
  }

  /**
   * เก็บร่างไว้ใน localStorage แล้วกู้กลับตอนกลับมาจากหน้าล็อกอิน
   *
   * ลูกค้าส่วนใหญ่มาจากลิงก์ใน bio โดยยังไม่เคยล็อกอิน ถ้ากรอกบรีฟยาว ๆ เสร็จ
   * แล้วโดนเด้งไปล็อกอินจนข้อมูลหาย ส่วนใหญ่จะไม่กลับมากรอกใหม่
   */
  const draftKey = `draft:${shop.owner.handle}:${service.slug}`;
  const restored = useRef(false);

  /**
   * อ่าน localStorage ต้องทำหลัง hydrate เท่านั้น — ถ้าอ่านตอน render
   * ฝั่ง server จะได้ฟอร์มเปล่าแต่ฝั่ง client ได้ฟอร์มที่มีข้อมูล แล้ว hydration พัง
   *
   * eslint-disable ตรงนี้ตั้งใจ: กฎมีไว้กันการ setState ที่ทำให้ render วนซ้ำ
   * ส่วนนี้อ่าน external store ครั้งเดียวตลอดอายุ component (กันด้วย `restored`)
   * ซึ่งเป็นเคสที่ effect ถูกออกแบบมาให้ใช้
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        tierId?: string;
        options?: Record<string, number>;
        brief?: Record<string, string>;
        hideFromQueue?: boolean;
      };
      if (d.tierId) setTierId(d.tierId);
      if (d.options) setOptions(d.options);
      if (d.brief) setBrief(d.brief);
      if (d.hideFromQueue) setHideFromQueue(true);
      if (d.brief && Object.values(d.brief).some(Boolean)) {
        setStep(2);
        toast.info(t.order.draftRestored);
      }
    } catch {
      // ร่างเสียก็แค่เริ่มใหม่ ไม่ต้องแจ้งอะไร
      localStorage.removeItem(draftKey);
    }
  }, [draftKey, t.order.draftRestored]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function saveDraft() {
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ tierId: tier?.id, options, brief, hideFromQueue }),
      );
    } catch {
      // โหมดส่วนตัวบางเบราว์เซอร์เขียนไม่ได้ — ปล่อยผ่าน ไม่ใช่เรื่องคอขาดบาดตาย
    }
  }

  function submit() {
    startSubmit(async () => {
      const res = await createOrder({
        handle: shop.owner.handle ?? "",
        slug: service.slug,
        tierId: tier?.id ?? null,
        options: Object.entries(options)
          .filter(([, q]) => q > 0)
          .map(([optionId, quantity]) => ({ optionId, quantity })),
        answers: BRIEF_FIELDS.filter((f) => (brief[f.key] ?? "").trim()).map((f) => ({
          key: f.key,
          label: t.brief[f.key],
          value: brief[f.key]!.trim(),
        })),
        acceptTos: true,
        isPublicInQueue: !hideFromQueue,
      });

      if (res.ok) {
        localStorage.removeItem(draftKey);
        toast.success(t.order.sent, { description: t.order.sentHint });
        router.push(dynamicHref(`/my/requests/${res.code}`));
        return;
      }

      if (res.error === "unauthenticated") {
        saveDraft();
        toast.info(t.orderError.signInFirst);
        router.push(dynamicHref(`/sign-in?next=${encodeURIComponent(pathname)}`));
        return;
      }

      toast.error(
        res.error === "not_found"
          ? t.orderError.notFound
          : res.error === "shop_closed"
            ? t.orderError.shopClosed
            : res.error === "own_shop"
              ? t.orderError.ownShop
              : res.error === "creator_full"
                ? t.orderError.creatorFull
                : res.error === "rate_limited"
                  ? fill(t.orderError.rateLimited, {
                      n: Math.ceil((res.retryAfterSeconds ?? 60) / 60),
                    })
                  : t.orderError.generic,
      );
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
      {/* ── ซ้าย: ขั้นตอน ─────────────────────────────── */}
      <div>
        {/* ตัวบอกขั้นตอน */}
        <ol className="flex items-center gap-2 text-sm">
          {steps.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => i < step && setStep(i as Step)}
                disabled={i > step}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full px-2.5 py-1 transition-colors",
                  i === step && "bg-primary/12 text-primary",
                  i < step && "text-muted-foreground hover:text-foreground",
                  i > step && "text-muted-foreground/50",
                )}
              >
                <span
                  className={cn(
                    "tabular grid size-5 place-items-center rounded-full text-[11px] font-semibold",
                    i === step
                      ? "bg-primary text-primary-foreground"
                      : i < step
                        ? "bg-success text-success-foreground"
                        : "bg-muted",
                  )}
                >
                  {i < step ? <Check className="size-3" /> : i + 1}
                </span>
                {/* ต้องเป็น sr-only ไม่ใช่ hidden — ไม่งั้นปุ่มขั้นตอนไม่มีชื่อบนมือถือ
                    (ไอคอน Check ของ lucide เป็น aria-hidden ในตัว) */}
                <span className="sr-only sm:not-sr-only">{label}</span>
              </button>
              {i < steps.length - 1 && <span className="h-px w-4 bg-border sm:w-8" />}
            </li>
          ))}
        </ol>

        <div className="mt-6">
          {step === 0 && (
            <div className="space-y-8">
              {/* ระดับความละเอียด */}
              <fieldset>
                <legend className="text-sm font-medium">{t.service.tier}</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {service.tiers.map((x) => {
                    const active = x.id === tier?.id;
                    return (
                      <button
                        key={x.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setTierId(x.id)}
                        className={cn(
                          "overflow-hidden rounded-xl border p-0 text-left transition-colors",
                          active
                            ? "border-primary ring-2 ring-primary/25"
                            : "hover:border-foreground/25",
                        )}
                      >
                        <ArtImage seed={x.id} src={x.preview?.url} alt={x.label} ratio={1.4} rounded={false} />
                        <div className="p-3">
                          <p className="text-sm font-medium">{x.label}</p>
                          <p className="tabular text-sm text-muted-foreground">
                            {formatMoney(
                              service.basePriceCents + x.priceDeltaCents,
                              shop.currency,
                              locale,
                            )}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* ตัวเลือกเพิ่มเติม */}
              <fieldset>
                <legend className="text-sm font-medium">{t.service.addons}</legend>
                <div className="mt-3 space-y-2">
                  {service.options.map((opt) => {
                    const qty = options[opt.id] ?? 0;
                    return (
                      <div
                        key={opt.id}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        {opt.inputType === "checkbox" ? (
                          <Checkbox
                            id={opt.id}
                            checked={qty > 0}
                            onCheckedChange={(v) => toggleOption(opt.id, v ? 1 : 0)}
                          />
                        ) : null}

                        <div className="min-w-0 flex-1">
                          <Label htmlFor={opt.id} className="cursor-pointer font-normal">
                            {opt.label}
                          </Label>
                          <p className="text-xs text-muted-foreground">{opt.groupLabel}</p>
                        </div>

                        {opt.inputType === "quantity" ? (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-7"
                              onClick={() => toggleOption(opt.id, qty - 1)}
                              disabled={qty === 0}
                              aria-label="-"
                            >
                              <Minus className="size-3" />
                            </Button>
                            <span className="tabular w-6 text-center text-sm">{qty}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-7"
                              onClick={() => toggleOption(opt.id, qty + 1)}
                              disabled={qty >= (opt.maxQuantity ?? 9)}
                              aria-label="+"
                            >
                              <Plus className="size-3" />
                            </Button>
                          </div>
                        ) : null}

                        <span className="tabular w-20 text-right text-sm text-muted-foreground">
                          +{formatMoney(opt.priceDeltaCents, shop.currency, locale)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              {BRIEF_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={f.key}>
                    {t.brief[f.key]}
                    {f.required ? (
                      <span className="text-destructive"> *</span>
                    ) : (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({t.common.optional})
                      </span>
                    )}
                  </Label>
                  {f.type === "textarea" ? (
                    <Textarea
                      id={f.key}
                      className="mt-1.5"
                      rows={4}
                      value={brief[f.key] ?? ""}
                      onChange={(e) => setBrief((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id={f.key}
                      className="mt-1.5"
                      value={brief[f.key] ?? ""}
                      onChange={(e) => setBrief((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}

              {/* จุดอัปโหลด reference — ของจริงอัปตรงไป Blob ไม่ผ่าน function */}
              <div>
                <Label>{t.brief.referenceFiles}</Label>
                <div className="mt-1.5 grid place-items-center rounded-xl border border-dashed py-10 text-center">
                  <ImagePlus className="size-6 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t.brief.dropzone}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.brief.dropzoneHint}
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{t.service.draftSaved}</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <Card className="gap-3 p-4">
                <p className="text-sm font-medium">{t.order.brief}</p>
                <dl className="space-y-2 text-sm">
                  {BRIEF_FIELDS.map((f) => (
                    <div key={f.key} className="grid grid-cols-[140px_1fr] gap-2">
                      <dt className="text-muted-foreground">{t.brief[f.key]}</dt>
                      <dd>{brief[f.key]?.trim() || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              <Card className="gap-3 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="size-4 text-primary" />
                  {t.creator.tosTitle}
                </p>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  {shop.tos.slice(0, 3).map((line, i) => (
                    <li key={line} className="flex gap-2">
                      <span className="tabular">{i + 1}.</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
                <Separator />
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <Checkbox
                    checked={tosAccepted}
                    onCheckedChange={(v) => setTosAccepted(Boolean(v))}
                    className="mt-0.5"
                  />
                  <span>{t.service.acceptTos}</span>
                </label>
              </Card>

              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <Checkbox
                  checked={hideFromQueue}
                  onCheckedChange={(v) => setHideFromQueue(v === true)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  {t.order.hideFromQueue}
                  <span className="block text-xs text-muted-foreground">
                    {t.order.hideFromQueueHint}
                  </span>
                </span>
              </label>

              <p className="text-xs text-muted-foreground">
                {t.brief.signInNote}
              </p>
            </div>
          )}
        </div>

        {/* ปุ่มเดินหน้า/ถอยหลัง */}
        <div className="mt-8 flex items-center gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as Step)}>
              <ArrowLeft className="size-4" />
              {t.common.back}
            </Button>
          )}
          {step < 2 ? (
            <Button
              className="ml-auto"
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={step === 1 && !briefComplete}
            >
              {t.common.next}
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button className="ml-auto" onClick={submit} disabled={!tosAccepted || pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t.service.submitRequest}
            </Button>
          )}
        </div>
      </div>

      {/* ── ขวา: สรุปราคา (sticky) ────────────────────── */}
      <Card className="gap-0 p-5 lg:sticky lg:top-20">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{service.title}</p>
          <Badge variant={service.mode === "instant" ? "default" : "secondary"}>
            {service.mode === "instant" ? t.service.instantOrder : t.service.customProposal}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {service.mode === "instant"
            ? t.service.instantOrderHint
            : t.service.customProposalHint}
        </p>

        <Separator className="my-4" />

        <ul className="space-y-2 text-sm">
          {quote.lines.map((line, i) => (
            <li key={`${line.kind}-${line.sourceId ?? i}`} className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {line.quantity > 1 ? `${line.label} × ${line.quantity}` : line.label}
              </span>
              <span className="tabular shrink-0">
                {formatMoney(line.unitPriceCents * line.quantity, shop.currency, locale)}
              </span>
            </li>
          ))}
        </ul>

        <Separator className="my-4" />

        <div className="flex items-baseline justify-between">
          <span className="font-medium">{t.service.total}</span>
          <span className="tabular text-2xl font-semibold">
            {formatMoney(total, shop.currency, locale)}
          </span>
        </div>

        <dl className="mt-4 space-y-1.5 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <dt>{t.service.deliveryIn}</dt>
            <dd className="tabular">
              {service.deliveryDays} {t.common.days}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>{t.service.revisions}</dt>
            <dd className="tabular">
              {service.revisionsIncluded} {t.service.times}
            </dd>
          </div>
        </dl>

        <Separator className="my-4" />

        <p className="text-xs text-muted-foreground">
          {t.creator.poweredBy}{" "}
          <Link href={shopHref(shop.owner.handle ?? "")} className="underline underline-offset-2">
            @{shop.owner.handle}
          </Link>
        </p>
      </Card>
    </div>
  );
}

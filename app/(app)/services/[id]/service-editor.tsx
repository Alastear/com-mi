"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ArtImage } from "@/components/art-image";
import { MediaUploader } from "@/components/media-uploader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useDict } from "@/lib/i18n/client";
import { serviceHref } from "@/lib/routes";
import { SERVICE_KINDS, SERVICE_MODES } from "@/lib/types";
import { MAX_MULTIPLIER_BP } from "@/lib/orders/pricing";
import { deleteService, saveService, setServiceCover, type SaveServiceResult } from "../actions";

type Tier = { id?: string; label: string; priceDeltaCents: number };
type Option = {
  id?: string;
  groupLabel: string;
  label: string;
  priceDeltaCents: number;
  /** 0 = ตัวเลือกแบบบวกเงิน · >0 = ตัวคูณ basis point (10000 = x1) */
  priceMultiplierBp: number;
  inputType: "checkbox" | "quantity";
  maxQuantity: number | null;
};

type Service = {
  id: string;
  title: string;
  description: string;
  slug: string;
  kind: string;
  mode: string;
  basePriceCents: number;
  deliveryDays: number;
  revisionsIncluded: number;
  includes: string[];
  isActive: boolean;
  coverUrl: string | null;
  tiers: Tier[];
  options: Option[];
};

/** ราคาในฟอร์มเป็นบาท ส่วน DB เก็บเป็นสตางค์ — แปลงที่ขอบเท่านั้น */
const toBaht = (cents: number) => Math.round(cents / 100);
const toCents = (baht: string) => Math.max(0, Math.round(Number(baht) || 0)) * 100;

/**
 * ตัวคูณ: ครีเอเตอร์คิดเป็น "x2" แต่ DB เก็บเป็น basis point
 *
 * ⚠️ ช่องนี้อยู่ติดกับช่องราคาซึ่งแปลง บาท→สตางค์ (x100) — คนละหน่วยกันคนละตัวคูณ
 * สลับสองอันนี้เมื่อไรคือคิดเงินผิด 100 เท่าแบบเงียบ ๆ จึงตั้งชื่อให้ต่างกันชัด
 */
const toRate = (bp: number) => (bp > 0 ? bp / 10_000 : 0);
const toBp = (rate: string) => {
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 1) return 0;
  return Math.min(MAX_MULTIPLIER_BP, Math.round(n * 10_000));
};

export function ServiceEditor({ handle, service }: { handle: string; service: Service }) {
  const t = useDict();
  const router = useRouter();
  const [state, action, saving] = useActionState<SaveServiceResult, FormData>(
    saveService,
    undefined,
  );

  const [kind, setKind] = useState(service.kind);
  const [mode, setMode] = useState(service.mode);
  const [isActive, setIsActive] = useState(service.isActive);
  const [tiers, setTiers] = useState<Tier[]>(service.tiers);
  const [options, setOptions] = useState<Option[]>(service.options);
  const [deleting, startDelete] = useTransition();

  if (state?.ok) {
    queueMicrotask(() => toast.success(t.service.saved));
  }

  function patchTier(i: number, patch: Partial<Tier>) {
    setTiers((prev) => prev.map((row, n) => (n === i ? { ...row, ...patch } : row)));
  }
  function patchOption(i: number, patch: Partial<Option>) {
    setOptions((prev) => prev.map((row, n) => (n === i ? { ...row, ...patch } : row)));
  }

  function confirmDelete() {
    if (!window.confirm(t.service.deleteConfirm)) return;
    startDelete(async () => {
      await deleteService(service.id);
      toast.success(t.service.deleted);
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/services">
            <ArrowLeft className="size-4" />
            {t.nav.services}
          </Link>
        </Button>
        {handle && service.isActive && (
          <Button asChild size="sm" variant="outline">
            <Link href={serviceHref(handle, service.slug)}>
              {t.common.viewAll}
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>

      {/* หน้าปกอยู่นอกฟอร์ม — อัปโหลดแล้วบันทึกทันที ไม่ต้องรอกดบันทึกทั้งหน้า */}
      <Card className="mt-4 gap-4 p-5">
        <p className="font-medium">{t.service.cover}</p>
        <div className="flex flex-wrap items-center gap-4">
          <ArtImage
            seed={service.id}
            src={service.coverUrl}
            alt={t.service.cover}
            ratio={1}
            className="size-24 shrink-0"
          />
          <MediaUploader
            kind="service_cover"
            label={t.service.cover}
            className="min-w-56 flex-1"
            onUploaded={async (mediaId) => {
              await setServiceCover(service.id, mediaId);
              router.refresh();
              toast.success(t.media.uploaded);
            }}
          />
        </div>
      </Card>

      <form action={action} className="mt-5 space-y-5">
        <input type="hidden" name="id" value={service.id} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="isActive" value={isActive ? "on" : ""} />
        <input type="hidden" name="tiers" value={JSON.stringify(tiers)} />
        <input type="hidden" name="options" value={JSON.stringify(options)} />

        <Card className="gap-4 p-5">
          <p className="font-medium">{t.service.basics}</p>

          <div>
            <Label htmlFor="title">{t.service.titleLabel}</Label>
            <Input
              id="title"
              name="title"
              defaultValue={service.title}
              maxLength={80}
              required
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="description">{t.service.descriptionLabel}</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={service.description}
              rows={3}
              maxLength={2000}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="slug">{t.service.slugLabel}</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={service.slug}
              maxLength={60}
              className="mt-1.5 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t.service.slugHint}</p>
          </div>

          <div>
            <Label>{t.service.kindLabel}</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {SERVICE_KINDS.map((k) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={k === kind ? "default" : "outline"}
                  onClick={() => setKind(k)}
                >
                  {t.serviceKind[k]}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label>{t.service.modeLabel}</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {SERVICE_MODES.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={m === mode ? "default" : "outline"}
                  onClick={() => setMode(m)}
                >
                  {m === "instant" ? t.service.instantOrder : t.service.customProposal}
                </Button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {mode === "instant" ? t.service.instantOrderHint : t.service.customProposalHint}
            </p>
          </div>
        </Card>

        <Card className="gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="basePriceCents">
                {t.service.basePrice} ({t.service.priceUnit})
              </Label>
              <Input
                id="basePriceCents"
                name="basePriceCents"
                type="number"
                min={0}
                max={1_000_000}
                defaultValue={toBaht(service.basePriceCents)}
                className="tabular mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="deliveryDays">
                {t.service.deliveryLabel} ({t.common.days})
              </Label>
              <Input
                id="deliveryDays"
                name="deliveryDays"
                type="number"
                min={1}
                max={365}
                defaultValue={service.deliveryDays}
                className="tabular mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="revisionsIncluded">{t.service.revisionsLabel}</Label>
              <Input
                id="revisionsIncluded"
                name="revisionsIncluded"
                type="number"
                min={0}
                max={99}
                defaultValue={service.revisionsIncluded}
                className="tabular mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="includes">{t.service.includesLabel}</Label>
            <Textarea
              id="includes"
              name="includes"
              defaultValue={service.includes.join("\n")}
              rows={4}
              maxLength={2000}
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t.service.includesHint}</p>
          </div>
        </Card>

        {/* ระดับความละเอียด */}
        <Card className="gap-4 p-5">
          <div>
            <p className="font-medium">{t.service.tiersTitle}</p>
            <p className="text-sm text-muted-foreground">{t.service.tiersHint}</p>
          </div>

          {tiers.map((row, i) => (
            <div key={row.id ?? `new-${i}`} className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1">
                <Label className="text-xs">{t.service.rowLabel}</Label>
                <Input
                  value={row.label}
                  maxLength={60}
                  onChange={(e) => patchTier(i, { label: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="w-28">
                <Label className="text-xs">
                  {t.service.priceDelta} ({t.service.priceUnit})
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={toBaht(row.priceDeltaCents)}
                  onChange={(e) => patchTier(i, { priceDeltaCents: toCents(e.target.value) })}
                  className="tabular mt-1"
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t.common.delete}
                onClick={() => setTiers((prev) => prev.filter((_, n) => n !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={tiers.length >= 10}
            onClick={() => setTiers((prev) => [...prev, { label: "", priceDeltaCents: 0 }])}
          >
            <Plus className="size-4" />
            {t.service.addTier}
          </Button>
        </Card>

        {/* ตัวเลือกเสริม */}
        <Card className="gap-4 p-5">
          <div>
            <p className="font-medium">{t.service.optionsTitle}</p>
            <p className="text-sm text-muted-foreground">{t.service.optionsHint}</p>
          </div>

          {options.map((row, i) => (
            <div key={row.id ?? `new-${i}`} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <Label className="text-xs">{t.service.rowLabel}</Label>
                  <Input
                    value={row.label}
                    maxLength={60}
                    onChange={(e) => patchOption(i, { label: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="w-28">
                  <Label className="text-xs">{t.service.groupLabel}</Label>
                  <Input
                    value={row.groupLabel}
                    maxLength={60}
                    onChange={(e) => patchOption(i, { groupLabel: e.target.value })}
                    className="mt-1"
                  />
                </div>
                {row.priceMultiplierBp > 0 ? (
                  <div className="w-28">
                    <Label className="text-xs">{t.service.multiplierRate}</Label>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-muted-foreground">×</span>
                      <Input
                        type="number"
                        min={1.1}
                        max={MAX_MULTIPLIER_BP / 10_000}
                        step={0.1}
                        value={toRate(row.priceMultiplierBp)}
                        onChange={(e) =>
                          patchOption(i, { priceMultiplierBp: toBp(e.target.value) })
                        }
                        className="tabular"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-28">
                    <Label className="text-xs">
                      {t.service.priceDelta} ({t.service.priceUnit})
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={toBaht(row.priceDeltaCents)}
                      onChange={(e) => patchOption(i, { priceDeltaCents: toCents(e.target.value) })}
                      className="tabular mt-1"
                    />
                  </div>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t.common.delete}
                  onClick={() => setOptions((prev) => prev.filter((_, n) => n !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <Label className="flex items-center gap-2 text-sm font-normal">
                  <Checkbox
                    checked={row.priceMultiplierBp > 0}
                    onCheckedChange={(v) =>
                      patchOption(i, {
                        // เริ่มที่ x2 ซึ่งเป็นอัตราที่ใช้กันบ่อยที่สุดสำหรับสิทธิ์เชิงพาณิชย์
                        priceMultiplierBp: v === true ? 20_000 : 0,
                        // ตัวคูณเป็นติ๊กถูกเสมอ — "ใช้เชิงพาณิชย์ 3 ครั้ง" ไม่มีความหมาย
                        // และล้างราคาบวกทิ้ง ไม่งั้นจะเหลือค่าที่ไม่ได้ใช้แต่ยังอยู่ใน DB
                        inputType: v === true ? "checkbox" : row.inputType,
                        maxQuantity: v === true ? null : row.maxQuantity,
                        priceDeltaCents: v === true ? 0 : row.priceDeltaCents,
                      })
                    }
                  />
                  {t.service.multiplierType}
                </Label>
                {row.priceMultiplierBp > 0 ? (
                  <p className="w-full text-xs text-muted-foreground">
                    {t.service.multiplierHint}
                  </p>
                ) : null}
                {row.priceMultiplierBp === 0 && (
                  <Label className="flex items-center gap-2 text-sm font-normal">
                    <Checkbox
                      checked={row.inputType === "quantity"}
                      onCheckedChange={(v) =>
                        patchOption(i, {
                          inputType: v === true ? "quantity" : "checkbox",
                          maxQuantity: v === true ? (row.maxQuantity ?? 5) : null,
                        })
                      }
                    />
                    {t.service.quantityType}
                  </Label>
                )}
                {row.priceMultiplierBp === 0 && row.inputType === "quantity" && (
                  <Label className="flex items-center gap-2 text-sm font-normal">
                    {t.service.maxQuantity}
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={row.maxQuantity ?? 5}
                      onChange={(e) =>
                        patchOption(i, {
                          maxQuantity: Math.min(99, Math.max(1, Number(e.target.value) || 1)),
                        })
                      }
                      className="tabular h-8 w-20"
                    />
                  </Label>
                )}
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={options.length >= 20}
            onClick={() =>
              setOptions((prev) => [
                ...prev,
                {
                  groupLabel: "",
                  label: "",
                  priceDeltaCents: 0,
                  priceMultiplierBp: 0,
                  inputType: "checkbox",
                  maxQuantity: null,
                },
              ])
            }
          >
            <Plus className="size-4" />
            {t.service.addOption}
          </Button>
        </Card>

        <Card className="flex-row items-center gap-4 p-5">
          <Checkbox
            id="isActiveBox"
            checked={isActive}
            onCheckedChange={(v) => setIsActive(v === true)}
          />
          <Label htmlFor="isActiveBox" className="min-w-0 flex-1 font-normal">
            <span className="block font-medium">{t.service.activeLabel}</span>
            <span className="block text-sm text-muted-foreground">{t.service.activeHint}</span>
          </Label>
        </Card>

        <Separator />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={confirmDelete}
            className="text-destructive hover:text-destructive"
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {t.service.deleteService}
          </Button>
          {state && !state.ok && <p className="text-sm text-destructive">{t.error.title}</p>}
          <Button type="submit" disabled={saving} className="ml-auto">
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t.common.save}
          </Button>
        </div>
      </form>
    </div>
  );
}

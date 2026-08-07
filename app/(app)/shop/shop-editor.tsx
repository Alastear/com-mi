"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { CopyLinkButton } from "@/components/copy-link-button";
import { useDict } from "@/lib/i18n/client";
import { shopHref } from "@/lib/routes";
import { shopUrl, shopUrlDisplay } from "@/lib/site";
import { cn } from "@/lib/utils";
import { saveShop, setPublished, type SaveShopResult } from "./actions";
import { MediaUploader } from "@/components/media-uploader";
import { ArtAvatar, ArtImage } from "@/components/art-image";
import { setShopImage } from "@/lib/media/actions";
import { useRouter } from "next/navigation";
import type { ShopStatus } from "@/lib/types";

const STATUSES: ShopStatus[] = ["open", "waitlist", "closed", "vacation"];

export function ShopEditor({
  handle,
  shop,
  starterTos,
}: {
  handle: string;
  /** ร่างข้อตกลงตั้งต้น ส่งมาจาก server เพราะขึ้นกับภาษา — ไม่ได้ใส่ให้อัตโนมัติ ต้องกดเอง */
  starterTos: string[];
  shop: {
    id: string;
    bannerUrl: string | null;
    avatarUrl: string | null;
    displayName: string;
    tagline: string;
    about: string;
    status: string;
    statusNote: string;
    slotsTotal: number;
    tos: string[];
    isPublished: boolean;
  };
}) {
  const t = useDict();
  const [state, action, saving] = useActionState<SaveShopResult, FormData>(saveShop, undefined);
  const [status, setStatus] = useState(shop.status);
  const [publishing, startPublish] = useTransition();
  const router = useRouter();

  /**
   * ช่องข้อตกลงเป็น controlled เพราะปุ่ม "ใส่ร่างตั้งต้น" ต้องเขียนค่าลงไปได้
   * ที่เหลือในฟอร์มยังเป็น uncontrolled ตามเดิม — ไม่มีเหตุให้ React ตามทุกตัวอักษร
   */
  const [tos, setTos] = useState(shop.tos.join("\n"));

  function togglePublish() {
    startPublish(async () => {
      await setPublished(!shop.isPublished);
      toast.success(shop.isPublished ? t.shop.unpublished : t.shop.published);
    });
  }

  if (state?.ok) {
    // แจ้งครั้งเดียวหลัง action สำเร็จ — useActionState คืน state ใหม่ทุกครั้งที่ submit
    queueMicrotask(() => toast.success(t.shop.saved));
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t.nav.shop}</h1>
          <p className="tabular text-sm text-muted-foreground">{shopUrlDisplay(handle)}</p>
        </div>
        <div className="flex gap-2">
          <CopyLinkButton value={shopUrl(handle)} label={t.common.share} size="sm" />
          <Button asChild size="sm" variant="outline">
            <Link href={shopHref(handle)}>
              {t.common.viewAll}
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* เผยแพร่ */}
      <Card className="mt-6 flex-row items-center gap-4 p-5">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/50">
          <Globe className={cn("size-4", shop.isPublished && "text-success")} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-medium">
            {t.shop.publishToggle}
            <Badge variant={shop.isPublished ? "default" : "secondary"}>
              {shop.isPublished ? t.shop.published : t.shop.unpublished}
            </Badge>
          </p>
          <p className="text-sm text-muted-foreground">{t.shop.publishHint}</p>
        </div>
        <Button
          onClick={togglePublish}
          disabled={publishing}
          variant={shop.isPublished ? "outline" : "default"}
          size="sm"
          className="shrink-0"
        >
          {publishing ? <Loader2 className="size-4 animate-spin" /> : null}
          {shop.isPublished ? t.shop.unpublished : t.shop.publishCta}
        </Button>
      </Card>

      {/* รูปหน้าร้าน */}
      <Card className="mt-5 gap-4 p-5">
        <p className="font-medium">{t.media.banner}</p>
        <ArtImage
          seed={shop.id}
          src={shop.bannerUrl}
          alt={t.media.banner}
          ratio={null}
          className="h-32 w-full sm:h-40"
        />
        <MediaUploader
          kind="banner"
          label={t.media.banner}
          onUploaded={async (id) => {
            await setShopImage(id, "banner");
            router.refresh();
            toast.success(t.media.uploaded);
          }}
        />

        <Separator />

        <p className="font-medium">{t.media.avatar}</p>
        <div className="flex items-center gap-4">
          <ArtAvatar
            seed={handle}
            src={shop.avatarUrl}
            alt={t.media.avatar}
            className="size-20 shrink-0"
          />
          <MediaUploader
            kind="avatar"
            label={t.media.avatar}
            className="flex-1"
            onUploaded={async (id) => {
              await setShopImage(id, "avatar");
              router.refresh();
              toast.success(t.media.uploaded);
            }}
          />
        </div>
      </Card>

      <form action={action} className="mt-5 space-y-5">
        <Card className="gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="displayName">{t.shop.displayName}</Label>
              <Input
                id="displayName"
                name="displayName"
                defaultValue={shop.displayName}
                maxLength={60}
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="slotsTotal">{t.creator.queueCount}</Label>
              <Input
                id="slotsTotal"
                name="slotsTotal"
                type="number"
                min={0}
                max={99}
                defaultValue={shop.slotsTotal}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="tagline">{t.shop.tagline}</Label>
            <Input
              id="tagline"
              name="tagline"
              defaultValue={shop.tagline}
              maxLength={160}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="about">{t.shop.about}</Label>
            <Textarea
              id="about"
              name="about"
              defaultValue={shop.about}
              rows={4}
              maxLength={2000}
              className="mt-1.5"
            />
          </div>
        </Card>

        <Card className="gap-4 p-5">
          <div>
            <p className="font-medium">{t.settings.shopStatusTitle}</p>
            <p className="text-sm text-muted-foreground">{t.settings.shopStatusDesc}</p>
          </div>
          <input type="hidden" name="status" value={status} />
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={s === status ? "default" : "outline"}
                onClick={() => setStatus(s)}
              >
                {t.shopStatus[s]}
              </Button>
            ))}
          </div>
          <div>
            <Label htmlFor="statusNote">{t.shop.statusNote}</Label>
            <Input
              id="statusNote"
              name="statusNote"
              defaultValue={shop.statusNote}
              maxLength={120}
              className="mt-1.5"
            />
          </div>
        </Card>

        <Card className="gap-4 p-5">
          <div>
            <p className="font-medium">{t.creator.tosTitle}</p>
            <p className="text-sm text-muted-foreground">{t.shop.tos}</p>
          </div>
          <Textarea
            name="tos"
            value={tos}
            onChange={(e) => setTos(e.target.value)}
            rows={6}
            maxLength={4000}
            className="font-mono text-xs"
          />
          {/* เสนอร่างเฉพาะตอนยังว่าง — ถ้าเขียนไว้แล้วปุ่มนี้มีแต่จะทับของเดิมทิ้ง */}
          {tos.trim() === "" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setTos(starterTos.join("\n"))}
              >
                {t.shop.tosUseTemplate}
              </Button>
              <p className="text-xs text-muted-foreground">{t.shop.tosTemplateHint}</p>
            </div>
          ) : null}
        </Card>

        <Separator />

        <div className="flex items-center gap-3">
          {state && !state.ok ? (
            <p className="text-sm text-destructive">{t.error.title}</p>
          ) : null}
          <Button type="submit" disabled={saving} className="ml-auto">
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t.common.save}
          </Button>
        </div>
      </form>
    </div>
  );
}

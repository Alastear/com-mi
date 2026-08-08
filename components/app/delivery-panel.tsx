"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Download, FileUp, Loader2, Lock, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useDict } from "@/lib/i18n/client";
import { formatBytes } from "@/lib/format";
import { attachDelivery, deliverAndRelease, requestDeliveryDownload } from "@/lib/delivery/actions";
import { registerDeliveryFile } from "@/lib/delivery/register";
import type { DeliveryFileRow, DeliveryRow } from "@/lib/delivery/rows";
import { cn } from "@/lib/utils";

/**
 * แผงไฟล์ส่งมอบ — ครีเอเตอร์อัปโหลดและกดส่ง · ลูกค้าดาวน์โหลด
 *
 * ⚠️ ไม่ใช้ `components/media-uploader.tsx` ซ้ำ เพราะตัวนั้นบังคับ `access: "public"`
 * และแปลงทุกไฟล์เป็น WebP ก่อนอัป ซึ่งจะทำลายไฟล์ส่งมอบ (PSD, ZIP, วิดีโอ)
 *
 * ⚠️ URL ดาวน์โหลดขอทีละครั้งผ่าน Server Action แล้วเปิดทันที
 * ไม่เคยถูกวางไว้ใน HTML — URL ที่ได้เป็น bearer credential ที่ใครถือก็โหลดได้
 */
export function DeliveryPanel({
  code,
  viewer,
  delivery,
  pendingFiles,
  canDeliver,
  orderStatus,
}: {
  code: string;
  viewer: "creator" | "client";
  /** การส่งมอบที่มีอยู่ (ถ้ามี) */
  delivery: DeliveryRow | null;
  /** ไฟล์ที่ครีเอเตอร์อัปไว้แต่ยังไม่ได้ผูกกับการส่งมอบ */
  pendingFiles: DeliveryFileRow[];
  /** จ่ายครบแล้วหรือยัง — ตัดสินฝั่ง server มาแล้ว */
  canDeliver: boolean;
  orderStatus: string;
}) {
  const t = useDict();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [downloading, setDownloading] = useState<string | null>(null);

  const uploadable = ["in_progress", "in_review", "revision_requested"].includes(orderStatus);

  async function handleFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, 20)) {
        // path ต้องขึ้นต้นด้วย `deliveries/<code>/` — ฝั่ง server ปฏิเสธถ้าไม่ตรง
        // (เคยส่ง `_` เป็นตัวยึดที่ ทำให้อัปไฟล์ไม่ผ่านสักครั้ง)
        const blob = await upload(`deliveries/${code}/${crypto.randomUUID()}`, file, {
          /**
           * ⚠️ ต้องเป็น "private" — เคยเขียนว่า "public" พร้อมคอมเมนต์ว่า
           * "store จริงถูกกำหนดโดย endpoint ที่ออก token" ซึ่ง **ไม่จริง**
           * @vercel/blob 2.7 ปฏิเสธตรง ๆ ว่า "Cannot use public access on a
           * private store" การอัปไฟล์ส่งมอบจึงล้มทุกครั้งแม้ token จะออกให้แล้ว
           * (ตรงกับ `access: "private"` ที่ lib/delivery/register.ts บันทึกลง DB อยู่แล้ว)
           */
          access: "private",
          handleUploadUrl: "/api/blob/delivery-upload",
          clientPayload: JSON.stringify({ code }),
          multipart: true,
          contentType: file.type || "application/octet-stream",
        });

        const res = await registerDeliveryFile({
          code,
          url: blob.url,
          pathname: blob.pathname,
          filename: file.name,
        });
        if (!res.ok) {
          toast.error(res.error === "storage_quota_exceeded" ? t.delivery.quotaFull : t.delivery.failed);
          break;
        }
      }
      router.refresh();
    } catch (err) {
      console.error("[delivery-upload]", err);
      toast.error(t.delivery.failed);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function prepare() {
    start(async () => {
      const res = await attachDelivery({
        code,
        mediaIds: pendingFiles.map((f) => f.mediaId),
        note,
        licenseType: "personal",
      });
      if (res.ok) router.refresh();
      else toast.error(t.error.title);
    });
  }

  function release() {
    if (!delivery) return;
    start(async () => {
      const res = await deliverAndRelease(code, delivery.id);
      if (res.ok) {
        toast.success(t.delivery.released);
        router.refresh();
      } else {
        toast.error(
          res.error === "not_paid"
            ? t.delivery.notPaid
            : res.error === "no_files"
              ? t.delivery.noFilesYet
              : t.error.title,
        );
      }
    });
  }

  async function download(mediaId: string) {
    setDownloading(mediaId);
    try {
      const res = await requestDeliveryDownload(code, mediaId);
      if (res.ok) {
        // เปิดทันที ไม่เก็บ URL ไว้ที่ไหน — อายุ 15 นาทีและใครถือก็โหลดได้
        window.location.href = res.url;
      } else {
        toast.error(res.error === "not_paid" ? t.delivery.lockedUntilPaid : t.error.title);
      }
    } finally {
      setDownloading(null);
    }
  }

  const files = delivery?.files ?? pendingFiles;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Package className="size-4" />
          {t.delivery.title}
        </p>
        {delivery?.released ? <Badge variant="secondary">{t.delivery.released}</Badge> : null}
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.delivery.noFiles}</p>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => {
            const locked = viewer === "client" && !delivery?.released;
            return (
              <li key={f.mediaId} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.filename || f.mediaId}</p>
                  <p className="tabular text-xs text-muted-foreground">{formatBytes(f.bytes)}</p>
                </div>
                {locked ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="size-3.5" />
                    {t.delivery.lockedUntilPaid}
                  </span>
                ) : delivery?.released ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={downloading === f.mediaId}
                    onClick={() => void download(f.mediaId)}
                  >
                    {downloading === f.mediaId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    {downloading === f.mediaId ? t.delivery.downloading : t.delivery.download}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {delivery?.released ? (
        <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          {t.delivery.linkWarning}
        </p>
      ) : null}

      {viewer === "creator" && !delivery?.released ? (
        <>
          <Separator />
          {uploadable ? (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                id={`delivery-${code}`}
                className="sr-only"
                onChange={(e) => void handleFiles(e.target.files)}
              />
              <label
                htmlFor={`delivery-${code}`}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors hover:border-primary/50",
                  busy && "pointer-events-none opacity-60",
                )}
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin text-primary" />
                ) : (
                  <FileUp className="size-5 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {busy ? t.delivery.uploading : t.delivery.upload}
                </span>
                <span className="text-xs text-muted-foreground">{t.delivery.uploadHint}</span>
              </label>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t.delivery.wrongState}</p>
          )}

          {pendingFiles.length > 0 && !delivery ? (
            <>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder={t.delivery.note}
                className="resize-none"
              />
              <Button onClick={prepare} disabled={pending} className="w-full">
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {t.delivery.prepare}
              </Button>
            </>
          ) : null}

          {delivery && !delivery.released ? (
            <>
              <p className="text-xs text-muted-foreground">{t.delivery.releaseHint}</p>
              <Button onClick={release} disabled={pending || !canDeliver} className="w-full">
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {canDeliver ? t.delivery.release : t.delivery.notPaid}
              </Button>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

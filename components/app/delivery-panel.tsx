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
import { deliveryPrefix } from "@/lib/delivery/path";
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
  openRound,
  releasedRound,
  releasedFiles,
  pendingFiles,
  canDeliver,
  orderStatus,
}: {
  code: string;
  viewer: "creator" | "client";
  /** รอบที่เตรียมไว้แล้วแต่ยังไม่ปล่อย — ครีเอเตอร์กดปล่อยได้ ลูกค้ายังโหลดไม่ได้ */
  openRound: DeliveryRow | null;
  /** รอบล่าสุดที่ปล่อยไปแล้ว — ลูกค้าโหลดได้ และต้องเห็นต่อไปแม้จะมีรอบใหม่กำลังทำอยู่ */
  releasedRound: DeliveryRow | null;
  /** ไฟล์จากทุกรอบที่ปล่อยแล้ว — ของที่ลูกค้าได้ไปแล้วห้ามหายเมื่อมีรอบใหม่ */
  releasedFiles: DeliveryFileRow[];
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

  /**
   * สถานะที่ `deliverAndRelease()` เดินไป `delivered` ได้จริง ตามเครื่องสถานะ
   *
   * `revision_requested` อัปไฟล์กับเตรียมรอบได้ แต่ปล่อยไม่ได้ — ต้องกด "เริ่มงาน"
   * ก่อนหนึ่งครั้ง ถ้าไม่เช็คตรงนี้ ปุ่มปล่อยจะโผล่มาในสถานะที่กดแล้วขึ้น error เสมอ
   */
  const releasable = ["in_progress", "in_review"].includes(orderStatus);

  async function handleFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, 20)) {
        // กฎ path อยู่ที่ lib/delivery/path.ts — ฝั่ง server เทียบด้วยกฎเดียวกัน
        const blob = await upload(`${deliveryPrefix(code)}${crypto.randomUUID()}`, file, {
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
    if (!openRound) return;
    start(async () => {
      const res = await deliverAndRelease(code, openRound.id);
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

  /**
   * ไฟล์ที่ยังไม่ถูกปล่อย = รอบที่เตรียมไว้ ถ้ายังไม่เตรียมก็คือกองที่เพิ่งอัป
   * ลูกค้าเห็นทั้งสองกองแต่โหลดได้เฉพาะกองที่ปล่อยแล้ว
   */
  const lockedFiles = openRound?.files ?? (viewer === "creator" ? pendingFiles : []);

  function fileRow(f: DeliveryFileRow, canDownload: boolean) {
    return (
      <li key={f.mediaId} className="flex items-center gap-3 rounded-lg border p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{f.filename || f.mediaId}</p>
          <p className="tabular text-xs text-muted-foreground">{formatBytes(f.bytes)}</p>
        </div>
        {canDownload ? (
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
        ) : viewer === "client" ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            {t.delivery.lockedUntilPaid}
          </span>
        ) : null}
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Package className="size-4" />
          {t.delivery.title}
        </p>
        {releasedRound ? <Badge variant="secondary">{t.delivery.released}</Badge> : null}
      </div>

      {releasedFiles.length === 0 && lockedFiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.delivery.noFiles}</p>
      ) : null}

      {/* ปล่อยแล้ว — ต้องเห็นต่อไปแม้กำลังทำรอบแก้อยู่ ลูกค้าซื้อไปแล้ว */}
      {releasedFiles.length > 0 ? (
        <ul className="space-y-2">{releasedFiles.map((f) => fileRow(f, true))}</ul>
      ) : null}

      {/* รอบที่กำลังทำอยู่ */}
      {lockedFiles.length > 0 ? (
        <>
          {releasedFiles.length > 0 ? (
            <p className="text-xs font-medium text-muted-foreground">{t.delivery.nextRound}</p>
          ) : null}
          <ul className="space-y-2">{lockedFiles.map((f) => fileRow(f, false))}</ul>
        </>
      ) : null}

      {releasedRound ? (
        <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          {t.delivery.linkWarning}
        </p>
      ) : null}

      {/*
        ⚠️ ไม่ปิดทั้งแผงเมื่อปล่อยรอบก่อนไปแล้ว
        เดิมเงื่อนไขคือ `!delivery?.released` ครีเอเตอร์จึงไม่มีทั้งช่องอัปโหลด
        ปุ่มเตรียม และปุ่มปล่อย ทันทีที่ปล่อยรอบแรก — พอลูกค้าขอแก้งาน
        ออเดอร์ก็เดินต่อไม่ได้อีกเลย และไฟล์ที่อัปหลังจากนั้นหายเงียบ
      */}
      {viewer === "creator" ? (
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

          {/* เตรียมรอบใหม่ได้เมื่อมีไฟล์ค้างและยังไม่มีรอบไหนเปิดอยู่ */}
          {pendingFiles.length > 0 && !openRound ? (
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

          {openRound ? (
            <>
              <p className="text-xs text-muted-foreground">
                {releasable ? t.delivery.releaseHint : t.delivery.startWorkFirst}
              </p>
              {releasable ? (
                <Button onClick={release} disabled={pending || !canDeliver} className="w-full">
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {canDeliver ? t.delivery.release : t.delivery.notPaid}
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

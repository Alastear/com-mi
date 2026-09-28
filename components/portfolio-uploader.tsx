"use client";

import { quotaFullText } from "@/lib/billing/plans";
import { useRef, useState } from "react";
import { ImagePlus, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDict } from "@/lib/i18n/client";
import { fill } from "@/lib/i18n/dictionaries";
import { ACCEPTED_IMAGE_TYPES, MAX_SOURCE_BYTES, prepareImage } from "@/lib/media/prepare";
import { ACCEPTED_VIDEO_TYPES, MAX_VIDEO_SECONDS, prepareVideo } from "@/lib/media/video";
import { parseEmbed } from "@/lib/media/embed";
import { addPortfolioEmbed, addPortfolioItem, registerMedia } from "@/lib/media/actions";
import { uploadPublic } from "@/lib/uploads/client";
import { stopsBatch, uploadFailure } from "@/lib/uploads/errors";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * เพิ่มผลงาน — รูป · วิดีโอสั้น · หรือลิงก์ YouTube/Vimeo
 *
 * ⚠️ ไม่ใช้ `MediaUploader` ซ้ำ เพราะตัวนั้นแปลงทุกไฟล์เป็น WebP
 * ซึ่งใช้กับวิดีโอไม่ได้ ที่นี่แยกเส้นทางตามชนิดไฟล์ตั้งแต่ต้น:
 *   รูป   → ย่อ + แปลง WebP (เหมือนเดิม)
 *   วิดีโอ → **ไม่แปลง** อัปต้นฉบับ + ดึงเฟรมมาเป็นภาพปกแยกไฟล์
 */
export function PortfolioUploader({ onDone }: { onDone: () => void }) {
  const t = useDict();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [embedUrl, setEmbedUrl] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, 12)) {
        /**
         * จับทีละไฟล์ — เดิมไม่มี catch เลย ไฟล์ที่อัปไม่ผ่านหายเงียบโดยไม่มีข้อความ
         * และไฟล์ที่เหลือในชุดเดียวกันก็ไม่ถูกอัปต่อ
         */
        try {
          if (ACCEPTED_VIDEO_TYPES.includes(file.type)) await uploadVideo(file);
          else if (ACCEPTED_IMAGE_TYPES.includes(file.type)) await uploadImage(file);
          else toast.error(t.media.wrongType);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          console.error("[upload]", msg);
          const f = uploadFailure(msg);
          toast.error(
            f === "quota"
              ? quotaFullText(t.media)
              : f === "too_large"
                ? t.media.tooBig
                : f === "rate_limited"
                  ? t.media.rateLimited
                  : t.media.failed,
          );
          // เต็มหรือถี่เกิน — ไฟล์ที่เหลือล้มเหมือนกันหมด ไม่ต้องขึ้น toast ซ้ำอีกสิบไฟล์
          if (stopsBatch(f)) break;
        }
      }
      onDone();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function uploadImage(file: File) {
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error(`${t.media.tooBig} (${formatBytes(MAX_SOURCE_BYTES)})`);
      return;
    }
    const prepared = await prepareImage(file);
    const intentId = await uploadPublic("portfolio", prepared.blob, "image/webp");
    const res = await registerMedia({
      intentId,
      width: prepared.width,
      height: prepared.height,
      thumbhash: prepared.thumbhash,
    });
    // โควตาเต็มมาเป็นค่าที่คืน ไม่ใช่ error ที่โยน (ข้อความของ error ถูกซ่อนใน production)
    if (!res.ok) throw new Error(res.error);
    await addPortfolioItem(res.id);
  }

  async function uploadVideo(file: File) {
    const prepared = await prepareVideo(file);
    if (!prepared.ok) {
      toast.error(
        prepared.reason === "too_long"
          ? fill(t.portfolioVideo.tooLong, { n: MAX_VIDEO_SECONDS })
          : prepared.reason === "too_big"
            ? t.media.tooBig
            : t.portfolioVideo.unreadable,
      );
      return;
    }
    const v = prepared.value;

    // ภาพปกก่อน — ถ้าอัปวิดีโอสำเร็จแต่ภาพปกพัง กริดจะเหลือกล่องเปล่า
    const posterIntentId = await uploadPublic("portfolio", v.poster, "image/webp");
    const intentId = await uploadPublic("portfolio", v.file, v.file.type);

    const res = await registerMedia({
      intentId,
      width: v.width,
      height: v.height,
      thumbhash: v.thumbhash,
      posterIntentId,
      durationSeconds: v.durationSeconds,
    });
    if (!res.ok) throw new Error(res.error);
    await addPortfolioItem(res.id);
  }

  async function addEmbed() {
    const parsed = parseEmbed(embedUrl);
    if (!parsed) {
      toast.error(t.portfolioVideo.badLink);
      return;
    }
    setBusy(true);
    try {
      await addPortfolioEmbed(embedUrl);
      setEmbedUrl("");
      onDone();
    } catch {
      toast.error(t.media.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "grid place-items-center rounded-xl border border-dashed p-8 text-center transition-colors",
          dragging && "border-primary bg-primary/5",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={[...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(",")}
          className="sr-only"
          id="upload-portfolio"
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <label
          htmlFor="upload-portfolio"
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2",
            busy && "pointer-events-none opacity-60",
          )}
        >
          {busy ? (
            <Loader2 className="size-6 animate-spin text-primary" />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {busy ? t.media.uploading : t.media.choose}
          </span>
          <span className="text-xs text-muted-foreground">
            {fill(t.portfolioVideo.hint, { n: MAX_VIDEO_SECONDS })}
          </span>
        </label>
      </div>

      {/* ลิงก์ภายนอกสำหรับรีลยาว ๆ ที่ไม่ควรกินโควตา */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2
            aria-hidden
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={embedUrl}
            onChange={(e) => setEmbedUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addEmbed();
              }
            }}
            placeholder={t.portfolioVideo.linkPlaceholder}
            aria-label={t.portfolioVideo.linkPlaceholder}
            className="pl-9"
          />
        </div>
        <Button variant="outline" disabled={busy || !embedUrl.trim()} onClick={() => void addEmbed()}>
          {t.portfolioVideo.addLink}
        </Button>
      </div>
    </div>
  );
}

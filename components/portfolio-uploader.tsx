"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
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
        if (ACCEPTED_VIDEO_TYPES.includes(file.type)) await uploadVideo(file);
        else if (ACCEPTED_IMAGE_TYPES.includes(file.type)) await uploadImage(file);
        else toast.error(t.media.wrongType);
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
    const blob = await upload(`portfolio/${crypto.randomUUID()}.webp`, prepared.blob, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
      contentType: "image/webp",
      clientPayload: JSON.stringify({ kind: "portfolio" }),
    });
    const { id } = await registerMedia({
      url: blob.url,
      pathname: blob.pathname,
      kind: "portfolio",
      width: prepared.width,
      height: prepared.height,
      thumbhash: prepared.thumbhash,
    });
    await addPortfolioItem(id);
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
    const poster = await upload(`portfolio/${crypto.randomUUID()}.webp`, v.poster, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
      contentType: "image/webp",
      clientPayload: JSON.stringify({ kind: "portfolio" }),
    });

    const video = await upload(`portfolio/${crypto.randomUUID()}`, v.file, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
      contentType: v.file.type,
      clientPayload: JSON.stringify({ kind: "portfolio" }),
    });

    const { id } = await registerMedia({
      url: video.url,
      pathname: video.pathname,
      kind: "portfolio",
      width: v.width,
      height: v.height,
      thumbhash: v.thumbhash,
      posterUrl: poster.url,
      posterPathname: poster.pathname,
      durationSeconds: v.durationSeconds,
    });
    await addPortfolioItem(id);
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

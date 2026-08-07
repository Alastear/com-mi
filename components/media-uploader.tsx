"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDict } from "@/lib/i18n/client";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_SOURCE_BYTES,
  prepareImage,
} from "@/lib/media/prepare";
import { registerMedia } from "@/lib/media/actions";
import type { PublicMediaKind } from "@/lib/media/kinds";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * อัปโหลดรูปตรงจากเบราว์เซอร์ไป Blob
 *
 * ลำดับ: ย่อ+แปลง WebP ในเครื่อง → ขอ token จาก /api/blob/upload → อัปโหลดตรง
 * → เรียก Server Action บันทึกลง DB (ยืนยันขนาดจริงฝั่งเซิร์ฟเวอร์)
 */
export function MediaUploader({
  kind,
  onUploaded,
  className,
  label,
  multiple = false,
}: {
  kind: PublicMediaKind;
  onUploaded: (mediaId: string) => void | Promise<void>;
  className?: string;
  label?: string;
  multiple?: boolean;
}) {
  const t = useDict();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [, startTransition] = useTransition();

  async function handleFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy(true);

    try {
      for (const file of Array.from(files).slice(0, multiple ? 20 : 1)) {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          toast.error(t.media.wrongType);
          continue;
        }
        if (file.size > MAX_SOURCE_BYTES) {
          toast.error(`${t.media.tooBig} (${formatBytes(MAX_SOURCE_BYTES)})`);
          continue;
        }

        const prepared = await prepareImage(file);

        const blob = await upload(`${kind}/${crypto.randomUUID()}.webp`, prepared.blob, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          contentType: "image/webp",
          clientPayload: JSON.stringify({ kind }),
        });

        const { id } = await registerMedia({
          url: blob.url,
          pathname: blob.pathname,
          kind,
          width: prepared.width,
          height: prepared.height,
          thumbhash: prepared.thumbhash,
        });

        startTransition(() => {
          void onUploaded(id);
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // toast บอกผู้ใช้แบบสั้น ส่วนสาเหตุจริงต้องอ่านออกตอน debug
      // (เคสที่เจอจริง: Blob store ตั้งเป็น private ทั้งที่โค้ดขอ public)
      console.error("[upload]", msg);
      toast.error(
        msg.includes("storage_quota_exceeded") ? t.media.quotaFull : t.media.failed,
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
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
        "grid place-items-center rounded-xl border border-dashed p-6 text-center transition-colors",
        dragging && "border-primary bg-primary/5",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple={multiple}
        className="sr-only"
        id={`upload-${kind}`}
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <label
        htmlFor={`upload-${kind}`}
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
          {busy ? t.media.uploading : (label ?? t.media.choose)}
        </span>
        <span className="text-xs text-muted-foreground">{t.media.hint}</span>
      </label>
    </div>
  );
}

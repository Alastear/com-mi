"use client";

import { quotaFullText } from "@/lib/billing/plans";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDict } from "@/lib/i18n/client";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_SOURCE_BYTES,
  prepareImage,
} from "@/lib/media/prepare";
import { registerMedia } from "@/lib/media/actions";
import { uploadPublic } from "@/lib/uploads/client";
import { uploadFailure } from "@/lib/uploads/errors";
import { ImageCropper, type CropTarget } from "@/components/image-cropper";
import type { PublicMediaKind } from "@/lib/media/kinds";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * อัปโหลดรูปตรงจากเบราว์เซอร์ไป R2
 *
 * ลำดับ: ย่อ+แปลง WebP ในเครื่อง → ขอ URL ที่เซ็นแล้ว → PUT ตรงไปถัง
 * → เรียก Server Action บันทึกลง DB (ยืนยันขนาดจริงฝั่งเซิร์ฟเวอร์)
 */
export function MediaUploader({
  kind,
  onUploaded,
  className,
  label,
  multiple = false,
  crop,
}: {
  kind: PublicMediaKind;
  onUploaded: (mediaId: string) => void | Promise<void>;
  className?: string;
  label?: string;
  multiple?: boolean;
  /**
   * ใส่แล้วจะเปิดหน้าต่างครอปก่อนอัป — ใช้กับรูปที่มีกรอบตายตัวอย่างแบนเนอร์กับรูปโปรไฟล์
   * ไม่ใส่ = อัปตามสัดส่วนเดิมของไฟล์ (ผลงานในพอร์ตควรคงสัดส่วนที่ศิลปินตั้งใจ)
   */
  crop?: CropTarget;
}) {
  const t = useDict();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);
  const [, startTransition] = useTransition();

  /**
   * ข้อความเดียวกันทั้งทางปกติและทางครอป — เดิมทางครอป (แบนเนอร์ รูปโปรไฟล์) บอก
   * "ลองใหม่" ทุกกรณี คนที่พื้นที่เต็มจึงกดลองซ้ำไปเรื่อย ๆ โดยไม่รู้ว่าเต็ม
   */
  function showFailure(err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    // toast บอกผู้ใช้แบบสั้น ส่วนสาเหตุจริงต้องอ่านออกตอน debug
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
  }

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

        // มีกรอบตายตัว = ให้คนเลือกเองก่อนว่าจะเอาส่วนไหน แล้วค่อยอัป
        if (crop) {
          setPendingCrop(file);
          return;
        }

        const prepared = await prepareImage(file);

        const intentId = await uploadPublic(kind, prepared.blob, "image/webp");

        const res = await registerMedia({
          intentId,
          width: prepared.width,
          height: prepared.height,
          thumbhash: prepared.thumbhash,
        });
        if (!res.ok) throw new Error(res.error);

        const { id } = res;
        startTransition(() => {
          void onUploaded(id);
        });
      }
    } catch (err) {
      showFailure(err);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /** อัป blob ที่ครอปมาแล้ว — ข้าม prepareImage เพราะครอปคืนขนาดสุดท้ายมาให้แล้ว */
  async function uploadCropped(blob: Blob) {
    setPendingCrop(null);
    setBusy(true);
    try {
      const intentId = await uploadPublic(kind, blob, "image/webp");
      const outW = crop?.outputWidth ?? 0;
      const res = await registerMedia({
        intentId,
        width: outW,
        height: crop ? Math.round(outW / crop.ratio) : 0,
        // ไม่คำนวณ thumbhash ให้รูปที่ครอปแล้ว — ต้องอ่านพิกเซลซ้ำอีกรอบเพื่อ placeholder
        // ที่แบนเนอร์กับรูปโปรไฟล์แทบไม่ได้ประโยชน์ เพราะโหลดเร็วอยู่แล้วและมี gradient รองอยู่
        thumbhash: "",
      });
      if (!res.ok) throw new Error(res.error);
      const { id } = res;
      startTransition(() => {
        void onUploaded(id);
      });
    } catch (err) {
      showFailure(err);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
    {crop ? (
      <ImageCropper
        file={pendingCrop}
        target={crop}
        onCancel={() => {
          setPendingCrop(null);
          setBusy(false);
          if (inputRef.current) inputRef.current.value = "";
        }}
        onCropped={uploadCropped}
      />
    ) : null}
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
    </>
  );
}

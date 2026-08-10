"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDict } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * ครอปรูปก่อนอัปโหลด — ลากเลื่อน + ย่อขยาย
 *
 * ครอปตรงนี้เลยแทนที่จะเก็บ "จุดที่อยากให้เห็น" ไว้ปรับทีหลัง เพราะเจ้าของบอกว่า
 * แบบหลังใช้งานยากกว่า: ต้องอัปก่อนถึงจะเห็นว่าตัดตรงไหน และไม่มีทางย่อขยาย
 * แลกมาด้วยการที่ครอปแล้วครอปซ้ำไม่ได้ ต้องอัปใหม่ — ซึ่งตรงกับที่คนคุ้นเคย
 * จากแอปอื่นอยู่แล้ว และเข้าใจง่ายกว่าการมีสองปุ่มที่ทำคนละครึ่งของเรื่องเดียวกัน
 *
 * ⚠️ ตัดจริงตั้งแต่ฝั่งเบราว์เซอร์ ไฟล์ที่อัปขึ้นไปจึงเป็นขนาดสุดท้ายแล้ว
 * ส่วนที่ถูกตัดทิ้งไม่เคยถูกส่งขึ้นเซิร์ฟเวอร์เลย — ประหยัดทั้งพื้นที่และเวลาอัป
 */

export type CropTarget = {
  /** สัดส่วนกรอบ = กว้าง ÷ สูง */
  ratio: number;
  /** ความกว้างของไฟล์ผลลัพธ์เป็นพิกเซล ความสูงคำนวณจากสัดส่วน */
  outputWidth: number;
  circle?: boolean;
};

const MAX_ZOOM = 4;

export function ImageCropper(props: {
  file: File | null;
  target: CropTarget;
  onCancel: () => void;
  onCropped: (blob: Blob) => void | Promise<void>;
}) {
  /**
   * ตัวในผูกกับ `key` ของไฟล์ — เปลี่ยนรูปแล้ว React ถอดของเก่าทิ้งแล้วสร้างใหม่
   * ซูมกับตำแหน่งจึงกลับไปตั้งต้นเองโดยไม่ต้อง `setState` ใน effect
   * (ซึ่งเป็นรูปแบบที่ React เตือน และอ่านยากกว่าเพราะต้องไล่ว่าอะไรรีเซ็ตอะไร)
   */
  return (
    <Dialog open={Boolean(props.file)} onOpenChange={(o) => (o ? null : props.onCancel())}>
      <DialogContent className="sm:max-w-lg">
        {props.file ? (
          <CropBody key={`${props.file.name}:${props.file.size}`} {...props} file={props.file} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CropBody({
  file,
  target,
  onCancel,
  onCropped,
}: {
  file: File;
  target: CropTarget;
  onCancel: () => void;
  onCropped: (blob: Blob) => void | Promise<void>;
}) {
  const t = useDict();
  const frame = useRef<HTMLDivElement>(null);
  const imgEl = useRef<HTMLImageElement>(null);

  // สร้างครั้งเดียวตอน mount — ตัวนอกการันตีว่าไฟล์เปลี่ยนแล้วคอมโพเนนต์นี้ถูกสร้างใหม่
  const [url] = useState(() => URL.createObjectURL(file));
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);

  /** ตำแหน่งอยู่ใน ref ไม่ใช่ state — ลากทีหนึ่งยิงหลายสิบเฟรม ไม่ควร re-render ทุกครั้ง */
  const offset = useRef({ x: 0, y: 0 });

  // คืนหน่วยความจำของ object URL ตอนปิด — ไม่แตะ state จึงไม่ชนกฎ
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  /** ขนาดที่รูปต้อง "คลุม" กรอบพอดีตอน zoom = 1 — เทียบเท่า object-cover */
  function baseScale() {
    const box = frame.current?.getBoundingClientRect();
    if (!box || !natural) return 1;
    return Math.max(box.width / natural.w, box.height / natural.h);
  }

  /** ห้ามลากจนเห็นขอบว่าง — บีบตำแหน่งให้รูปคลุมกรอบเสมอ */
  function clampOffset() {
    const box = frame.current?.getBoundingClientRect();
    if (!box || !natural) return;
    const s = baseScale() * zoom;
    const minX = box.width - natural.w * s;
    const minY = box.height - natural.h * s;
    offset.current = {
      x: Math.min(0, Math.max(minX, offset.current.x)),
      y: Math.min(0, Math.max(minY, offset.current.y)),
    };
  }

  function paint() {
    clampOffset();
    const el = imgEl.current;
    if (!el || !natural) return;
    const s = baseScale() * zoom;
    el.style.width = `${natural.w * s}px`;
    el.style.height = `${natural.h * s}px`;
    el.style.transform = `translate(${offset.current.x}px, ${offset.current.y}px)`;
  }

  useEffect(paint);

  function onPointerMove(e: React.PointerEvent) {
    if (e.buttons === 0) return;
    offset.current = {
      x: offset.current.x + e.movementX,
      y: offset.current.y + e.movementY,
    };
    paint();
  }

  /**
   * ย่อขยายโดยยึดจุดกึ่งกลางกรอบ ไม่ใช่มุมซ้ายบน
   * ไม่งั้นพอเลื่อนซูมรูปจะไหลออกนอกกรอบและผู้ใช้ต้องลากตามตลอด
   */
  function setZoomAnchored(next: number) {
    const box = frame.current?.getBoundingClientRect();
    if (!box || !natural) return setZoom(next);
    const before = baseScale() * zoom;
    const after = baseScale() * next;
    const cx = box.width / 2;
    const cy = box.height / 2;
    offset.current = {
      x: cx - ((cx - offset.current.x) / before) * after,
      y: cy - ((cy - offset.current.y) / before) * after,
    };
    setZoom(next);
  }

  async function confirm() {
    const box = frame.current?.getBoundingClientRect();
    if (!box || !natural || !file) return;
    setBusy(true);
    try {
      clampOffset();
      const s = baseScale() * zoom;

      /**
       * แปลงกรอบที่เห็นบนจอกลับไปเป็นพื้นที่บนรูปต้นฉบับ
       * แล้ววาดเฉพาะส่วนนั้นลงผืนผ้าใบขนาดผลลัพธ์ — ได้ทั้งครอปและย่อในขั้นตอนเดียว
       */
      const sx = -offset.current.x / s;
      const sy = -offset.current.y / s;
      const sw = box.width / s;
      const sh = box.height / s;

      const outW = target.outputWidth;
      const outH = Math.round(outW / target.ratio);

      const bitmap = await createImageBitmap(file);
      try {
        const canvas = new OffscreenCanvas(outW, outH);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH);
        const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.86 });
        await onCropped(blob);
      } finally {
        bitmap.close();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>{t.media.cropTitle}</DialogTitle>
          <DialogDescription>{t.media.cropHint}</DialogDescription>
        </DialogHeader>

        <div
          ref={frame}
          onPointerMove={onPointerMove}
          onWheel={(e) => {
            const next = Math.min(MAX_ZOOM, Math.max(1, zoom - e.deltaY * 0.002));
            setZoomAnchored(next);
          }}
          style={{ aspectRatio: String(target.ratio) }}
          className={cn(
            "relative w-full cursor-grab touch-none overflow-hidden bg-muted select-none active:cursor-grabbing",
            target.circle ? "mx-auto max-w-64 rounded-full" : "rounded-xl",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ปิด image optimization ไว้ (next.config.ts) */}
            <img
              ref={imgEl}
              src={url}
              alt=""
              draggable={false}
              onLoad={(e) =>
                setNatural({
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })
              }
              className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
            />
        </div>

        <div className="flex items-center gap-3">
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoomAnchored(Number(e.target.value))}
            aria-label={t.media.cropZoom}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button onClick={confirm} disabled={busy || !natural}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t.media.cropConfirm}
          </Button>
        </DialogFooter>
    </>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Move } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDict } from "@/lib/i18n/client";
import { setMediaFocal } from "@/lib/media/actions";
import { cn } from "@/lib/utils";

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * เลือกว่ารูปจะแสดงส่วนไหน โดยลากรูปในกรอบจริง
 *
 * ⚠️ **ไม่ได้ครอปรูปทิ้ง** — เก็บแค่ "จุดที่อยากให้เห็น" แล้ว `object-position` ไปยึดจุดนั้น
 * เหตุผลคือกรอบที่แสดงไม่ได้มีสัดส่วนเดียว แบนเนอร์สูง h-40 บนมือถือและ h-60 บนจอใหญ่
 * ถ้าครอปทิ้งที่สัดส่วนเดียว อีกขนาดจอก็ยังตัดผิดที่อยู่ดี — และแก้ทีหลังต้องอัปรูปใหม่
 *
 * ลากด้วย pointer event ตัวเดียวจบ ครอบทั้งเมาส์ นิ้ว และปากกา ไม่ต้องเขียน touch แยก
 *
 * ⚠️ ค่าระหว่างลากอยู่ใน ref แล้วเขียนลง style ของ `<img>` ตรง ๆ ไม่ผ่าน state —
 * pointermove ยิงระดับ 60 ครั้งต่อวินาที ถ้า setState ทุกครั้งคือ re-render ทั้งคอมโพเนนต์
 * ทุกเฟรมระหว่างลาก React state เก็บแค่ "ค่าที่จะบันทึก" ตอนปล่อยนิ้ว
 */
export function FocalPicker({
  mediaId,
  src,
  /** สัดส่วนกรอบตัวอย่าง ควรใกล้เคียงกับที่ใช้จริงบนหน้าร้าน */
  ratio,
  circle = false,
  initial,
}: {
  mediaId: string;
  src: string;
  ratio: number;
  circle?: boolean;
  initial?: { x: number; y: number } | null;
}) {
  const t = useDict();
  const router = useRouter();

  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const live = useRef(initial ?? { x: 50, y: 50 });

  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [saving, start] = useTransition();

  function apply(x: number, y: number) {
    live.current = { x, y };
    if (img.current) img.current.style.objectPosition = `${x}% ${y}%`;
  }

  /**
   * ลากขึ้น = อยากเห็นส่วนล่างของรูปมากขึ้น จึงต้องขยับจุดโฟกัสลง
   * ทิศทางจึงกลับด้านกับการเคลื่อนของนิ้ว ซึ่งตรงกับที่คนคาดเวลาลากรูปในกรอบ
   */
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons === 0) return;
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    apply(
      clamp(live.current.x - (e.movementX / box.width) * 100),
      clamp(live.current.y - (e.movementY / box.height) * 100),
    );
  }

  /** ปล่อยนิ้วแล้วค่อยแตะ state ครั้งเดียว — ปุ่มบันทึกจะได้โผล่ */
  function commit() {
    setPending({ ...live.current });
  }

  /** ปุ่มลูกศรต้องขยับได้ด้วย — ลากอย่างเดียวใช้ไม่ได้กับคนที่ไม่ได้ใช้เมาส์ */
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 10 : 2;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    apply(clamp(live.current.x + d[0]), clamp(live.current.y + d[1]));
    commit();
  }

  function save() {
    const value = pending;
    if (!value) return;
    start(async () => {
      const res = await setMediaFocal(mediaId, value);
      if (!res.ok) {
        toast.error(t.error.title);
        return;
      }
      setPending(null);
      toast.success(t.media.focalSaved);
      router.refresh();
    });
  }

  const start0 = initial ?? { x: 50, y: 50 };

  return (
    <div className="space-y-2">
      <div
        ref={frame}
        role="slider"
        tabIndex={0}
        aria-label={t.media.focalLabel}
        aria-valuetext={`${Math.round((pending ?? start0).x)}% ${Math.round((pending ?? start0).y)}%`}
        aria-valuenow={Math.round((pending ?? start0).y)}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerMove={onPointerMove}
        onPointerUp={commit}
        onPointerLeave={commit}
        onKeyDown={onKeyDown}
        style={{ aspectRatio: String(ratio) }}
        className={cn(
          "relative w-full cursor-grab touch-none overflow-hidden bg-muted select-none active:cursor-grabbing",
          circle ? "mx-auto max-w-40 rounded-full" : "rounded-xl",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ปิด image optimization ไว้ (next.config.ts) */}
        <img
          ref={img}
          src={src}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-cover"
          style={{ objectPosition: `${start0.x}% ${start0.y}%` }}
        />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="rounded-full bg-background/75 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
            <Move className="mr-1 inline size-3" />
            {t.media.focalHint}
          </span>
        </div>
      </div>

      {/* ปุ่มบันทึกโผล่เฉพาะตอนขยับแล้ว — ไม่มีอะไรให้บันทึกก็ไม่ต้องมีปุ่ม */}
      {pending ? (
        <Button size="sm" variant="outline" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t.media.focalSave}
        </Button>
      ) : null}
    </div>
  );
}

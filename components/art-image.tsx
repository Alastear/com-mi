import { cn } from "@/lib/utils";

/**
 * ภาพแทนผลงานสำหรับ prototype
 *
 * สร้าง mesh gradient แบบ deterministic จาก seed — seed เดิมได้ภาพเดิมเสมอ
 * ทำให้ prototype ดูมีชีวิตโดยไม่ต้องมีไฟล์ภาพจริงและไม่ต้องยิง request ออกนอก
 *
 * ของจริงคอมโพเนนต์นี้จะกลายเป็น <Image> + thumbhash placeholder
 * (ดู docs/01-architecture.md §5) โดย props ยังเหมือนเดิม
 */

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** ตัวสร้างเลขสุ่มแบบมี seed — ผลลัพธ์คงที่ทั้งฝั่ง server และ client (ไม่มี hydration mismatch) */
function rng(seed: number) {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

export function artGradient(seed: string): string {
  const next = rng(hash(seed));
  const baseHue = Math.floor(next() * 360);

  // เลือกคู่สีแบบ analogous + accent ตรงข้าม ให้ดูเป็นภาพวาดมากกว่าสุ่มมั่ว
  const hues = [
    baseHue,
    (baseHue + 25 + Math.floor(next() * 30)) % 360,
    (baseHue + 300 + Math.floor(next() * 40)) % 360,
    (baseHue + 180 + Math.floor(next() * 30)) % 360,
  ];

  const blobs = hues.map((hue, i) => {
    const x = Math.floor(next() * 100);
    const y = Math.floor(next() * 100);
    const size = 55 + Math.floor(next() * 45);
    const light = 55 + Math.floor(next() * 22) - i * 4;
    const chroma = 0.13 + next() * 0.11;
    return `radial-gradient(${size}% ${size}% at ${x}% ${y}%, oklch(${light / 100} ${chroma.toFixed(
      3,
    )} ${hue} / 0.92) 0%, transparent 68%)`;
  });

  const baseLight = 28 + Math.floor(next() * 14);
  blobs.push(`linear-gradient(${Math.floor(next() * 360)}deg, oklch(${baseLight / 100} 0.06 ${
    hues[0]
  }) 0%, oklch(${(baseLight + 10) / 100} 0.05 ${hues[2]}) 100%)`);

  return blobs.join(", ");
}

type ArtImageProps = {
  seed: string;
  alt: string;
  className?: string;
  /** width / height — ค่าเริ่มต้น 1 (จัตุรัส); ส่ง null เมื่อกำหนดความสูงเองผ่าน className */
  ratio?: number | null;
  rounded?: boolean;
  children?: React.ReactNode;
};

export function ArtImage({
  seed,
  alt,
  className,
  ratio = 1,
  rounded = true,
  children,
}: ArtImageProps) {
  return (
    <div
      role="img"
      aria-label={alt}
      className={cn(
        "relative isolate overflow-hidden bg-muted",
        rounded && "rounded-lg",
        className,
      )}
      style={{
        ...(ratio ? { aspectRatio: String(ratio) } : null),
        backgroundImage: artGradient(seed),
        backgroundSize: "cover",
      }}
    >
      {/* เกรนบาง ๆ ทำให้ไม่ดูเป็นกราเดียนต์เพียว ๆ */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      {children}
    </div>
  );
}

/**
 * รูปโปรไฟล์แบบวงกลม ใช้ seed เดียวกันกับ ArtImage
 *
 * ต้องมี `relative` ติดมาด้วยเสมอ: avatar มักถูกดึงขึ้นไปทับ banner ด้วย margin ติดลบ
 * แต่ `ArtImage` เป็น `position: relative` ส่วน avatar เป็น static
 * ตามลำดับการวาดของ CSS ตัวที่ positioned จะวาดทับตัวที่ไม่ positioned เสมอ
 * ไม่ว่าจะอยู่หลังใน DOM ก็ตาม → ครึ่งบนของ avatar จะโดน banner บัง
 */
export function ArtAvatar({
  seed,
  alt,
  className,
}: {
  seed: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={alt}
      className={cn("relative shrink-0 rounded-full bg-muted ring-1 ring-border", className)}
      style={{ backgroundImage: artGradient(seed), backgroundSize: "cover" }}
    />
  );
}

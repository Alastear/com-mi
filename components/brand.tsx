import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

/**
 * โลโก้ Commi — เวกเตอร์ที่แกะจาก public/logo-exp.png
 *
 * เรขาคณิตวัดจากต้นฉบับจริง (หน่วยใน viewBox 24×24):
 *   รัศมีกึ่งกลางเส้น 9 · ความหนาเส้น 4 (= 0.45R) · ปลายมน
 *   ช่องเปิด 120° จาก 326° ถึง 86° (0° = ขวา, เพิ่มตามเข็มเพราะแกน y ชี้ลง)
 *   จุด: offset (0.595R, 0.214R) จากศูนย์กลาง, รัศมี 0.8 × ความหนาเส้น
 *
 * ไฟล์ standalone อยู่ที่ public/logo.svg (ใช้กับ favicon / og / ที่อื่น)
 */
export function LogoMark({
  className,
  mono = false,
}: {
  className?: string;
  /** ใช้ currentColor แทนไล่สีม่วง — สำหรับวางบนพื้นสีเข้ม เช่นในปุ่ม */
  mono?: boolean;
}) {
  // id คงที่ได้ เพราะทุกที่นิยามไล่สีชุดเดียวกัน ต่อให้ซ้ำก็ให้ผลเหมือนกัน
  const paint = mono ? "currentColor" : "url(#commiViolet)";

  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden>
      {mono ? null : (
        <defs>
          <linearGradient id="commiViolet" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#A97CF2" />
            <stop offset="1" stopColor="#7A43DE" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M19.46 6.97A9 9 0 1 0 12.63 20.98"
        fill="none"
        stroke={paint}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="17.36" cy="13.93" r="3.19" fill={paint} />
    </svg>
  );
}

export function Logo({
  className,
  href = "/",
  showWordmark = true,
}: {
  className?: string;
  href?: Route;
  showWordmark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}
    >
      <LogoMark />
      {showWordmark ? <span>Commi</span> : <span className="sr-only">Commi</span>}
    </Link>
  );
}

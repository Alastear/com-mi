import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

/** โลโก้แบบ inline SVG — ไม่ต้องโหลดไฟล์เพิ่ม และเปลี่ยนสีตามธีมได้เอง */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-6", className)} aria-hidden>
      <rect width="24" height="24" rx="7" className="fill-primary" />
      <path
        d="M8.2 15.6c-1.5-1.1-2-3.1-1.1-4.8.9-1.8 3-2.6 4.9-1.9"
        stroke="currentColor"
        className="text-primary-foreground"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="15.4" cy="14.4" r="2.1" className="fill-primary-foreground" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: Route }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span>Commi</span>
    </Link>
  );
}

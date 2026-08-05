import { ArtAvatar } from "@/components/art-image";
import { cn } from "@/lib/utils";

/**
 * รูปโปรไฟล์ของผู้ใช้ที่ล็อกอินอยู่
 *
 * ถ้ามีรูปจาก Google ก็ใช้รูปนั้น (โหลดตรงจาก googleusercontent ไม่ผ่าน optimizer
 * เพราะเราปิด image optimization ไว้ — ดู next.config.ts)
 * ถ้าไม่มีก็ตกลงมาที่ gradient ที่สร้างจากอีเมล ซึ่งได้ภาพเดิมทุกครั้ง
 */
export function UserAvatar({
  user,
  className,
}: {
  // Better Auth คืน image เป็น `string | null | undefined` — รับให้ครบทั้งสามแบบ
  user: { name: string; email: string; image?: string | null };
  className?: string;
}) {
  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- รูปจาก Google ขนาดคงที่ ไม่ต้องผ่าน next/image
      <img
        src={user.image}
        alt={user.name}
        referrerPolicy="no-referrer"
        className={cn("relative shrink-0 rounded-full object-cover ring-1 ring-border", className)}
      />
    );
  }
  return <ArtAvatar seed={user.email} alt={user.name} className={className} />;
}

import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth-guard";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "ผู้ดูแลระบบ",
  // หน้าหลังบ้านของแพลตฟอร์มไม่ควรอยู่ในดัชนีค้นหาไม่ว่ากรณีใด
  robots: { index: false, follow: false },
};

/**
 * หลังบ้านของผู้ดูแลแพลตฟอร์ม
 *
 * ⚠️ **อยู่นอกกลุ่ม `(app)` โดยจำเป็น ไม่ใช่เพราะความชอบ**
 * `app/(app)/layout.tsx` เรียก `requireCreator()` ซึ่งเด้งไป `/onboarding`
 * ทุกครั้งที่ `handle` เป็น null — ผู้ดูแลที่ไม่เคยเปิดร้านจะติดลูปหน้าเปิดร้านตลอดกาล
 *
 * `requireAdmin()` อยู่ที่ layout เพื่อครอบทุกหน้าลูก แต่ **ไม่ใช่ด่านเดียว** —
 * ทุก Server Action ต้องเรียกเองซ้ำ เพราะ Server Function ไม่ใช่ route
 * layout จึงไม่ได้รันให้
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const t = getDictionary(await getLocale()).admin;

  return (
    <div className="min-h-dvh">
      <header className="border-b bg-muted/30">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <ShieldCheck className="size-4 text-primary" />
          <Link href="/admin" className="font-medium">
            {t.title}
          </Link>
          <Link href="/" className="ml-auto text-sm text-muted-foreground hover:text-foreground">
            {t.backToSite}
          </Link>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

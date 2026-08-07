import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth-guard";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // อ่าน session ที่ layout — header จะได้ไม่ต้องกระพริบปุ่ม "เข้าสู่ระบบ" ก่อน
  const session = await getSession();

  return (
    <>
      <SiteHeader user={session?.user ?? null} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}

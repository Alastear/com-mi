import { AppShell } from "@/components/app/app-shell";
import { requireCreator } from "@/lib/auth-guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  /**
   * ชั้นป้องกันจริง — proxy.ts เป็นแค่ UX gate เท่านั้น
   *
   * requireCreator() พาคนที่ยังไม่มี handle ไป /onboarding ก่อน
   * ไม่งั้นคนที่เพิ่งล็อกอินครั้งแรกจะไปโผล่ที่ dashboard ที่ยังตั้งค่าไม่เสร็จ
   * (/onboarding อยู่นอกกลุ่ม (app) จึงไม่วนลูป)
   */
  const { user } = await requireCreator();

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        handle: user.handle ?? null,
        plan: user.plan ?? "free",
      }}
    >
      {children}
    </AppShell>
  );
}

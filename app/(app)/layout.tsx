import { AppShell } from "@/components/app/app-shell";
import { requireCreator } from "@/lib/auth-guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  /**
   * ชั้นป้องกันจริง — proxy.ts เป็นแค่ UX gate เท่านั้น
   *
   * ทั้งกลุ่มนี้คือ "ฝั่งครีเอเตอร์" ซึ่งต้องเปิดร้านแล้วถึงจะเข้าได้
   * คนที่ล็อกอินแต่ยังไม่มีร้านไม่ได้ผิดอะไร เขาเป็นคนซื้อ — ที่ของเขาคือ /my/requests
   * มาถึงตรงนี้โดยไม่มี handle แปลว่ากดปุ่ม "เปิดร้านของฉัน" มา จึงพาไปตั้งชื่อร้านต่อ
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

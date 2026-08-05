import { AppShell } from "@/components/app/app-shell";
import { requireSession } from "@/lib/auth-guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // ชั้นป้องกันจริง — proxy.ts เป็นแค่ UX gate เท่านั้น
  const { user } = await requireSession();

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

import type { Metadata } from "next";
import { requireCreator } from "@/lib/auth-guard";
import { listInvitesForCreator } from "@/lib/queries/orders";
import { getServicesForPicker } from "@/lib/queries/creator";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { InvitesClient } from "./invites-client";

export const metadata: Metadata = {
  // หน้าจัดการส่วนตัว — ห้าม index
  robots: { index: false, follow: false },
};

export default async function InvitesPage() {
  const { user } = await requireCreator();
  const [invites, services] = await Promise.all([
    listInvitesForCreator(user.id),
    getServicesForPicker(user.id),
  ]);
  const t = getDictionary(await getLocale());

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:py-8">
      <h1 className="text-xl font-semibold tracking-tight">{t.invite.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.invite.subtitle}</p>

      <InvitesClient
        services={services}
        invites={invites.map((i) => ({
          id: i.id,
          token: i.token,
          email: i.email,
          serviceTitle: i.service?.title ?? "—",
          revokedAt: i.revokedAt,
          confirmedAt: i.confirmedAt,
          expiresAt: i.expiresAt,
          orderCode: i.order?.code ?? null,
          live: i.revisions[0]
            ? { totalCents: i.revisions[0].totalCents, depositCents: i.revisions[0].depositCents }
            : null,
          claim: i.claims[0]
            ? {
                // อีเมลคือข้อมูลชิ้นเดียวที่บอกได้จริงว่าใครมากด — ชื่อกับรูปแก้เองได้
                name: i.claims[0].user?.name ?? "",
                email: i.claims[0].user?.email ?? "",
                claimedAt: i.claims[0].claimedAt,
              }
            : null,
        }))}
      />
    </div>
  );
}

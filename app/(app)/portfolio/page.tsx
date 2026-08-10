import { requireCreator } from "@/lib/auth-guard";
import { getOwnShop } from "@/lib/queries/creator";
import { ensureShop } from "@/lib/shop/ensure";
import { effectivePlan, PLANS, type PlanId } from "@/lib/billing/plans";
import { PortfolioManager } from "./portfolio-manager";

export default async function PortfolioPage() {
  const { user } = await requireCreator();
  await ensureShop(user.id, user.name);

  const shop = await getOwnShop(user.id);
  /**
   * ผลงานหนึ่งชิ้นเป็นได้สามแบบ: รูป · วิดีโอที่อัปเอง · ลิงก์ภายนอก
   * ภาพปกของวิดีโออยู่ในแถว media แยก ผูกกลับด้วย `variantOf`
   */
  const posters = new Map(
    (shop?.portfolio ?? [])
      .flatMap((p) => (p.media?.variantOf ? [] : []))
      .map((m) => [m, m] as const),
  );
  void posters;

  const items = (shop?.portfolio ?? []).map((p) => ({
    id: p.id,
    mediaId: p.mediaId,
    title: p.title,
    embedRef: p.embedRef,
    url: p.media?.url ?? null,
    posterUrl: p.media?.posterUrl ?? null,
    durationSeconds: p.media?.durationSeconds ?? null,
    contentType: p.media?.contentType ?? null,
    width: p.media?.width ?? null,
    height: p.media?.height ?? null,
  }));

  const plan = effectivePlan((user.plan ?? "free") as PlanId);
  return <PortfolioManager items={items} max={PLANS[plan].limits.portfolio_items} />;
}

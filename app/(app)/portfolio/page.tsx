import { requireCreator } from "@/lib/auth-guard";
import { getOwnShop } from "@/lib/queries/creator";
import { ensureShop } from "@/lib/shop/ensure";
import { getLocale } from "@/lib/i18n/server";
import { PLANS } from "@/lib/billing/plans";
import { PortfolioManager } from "./portfolio-manager";

export default async function PortfolioPage() {
  const { user } = await requireCreator();
  await ensureShop(user.id, user.name, await getLocale());

  const shop = await getOwnShop(user.id);
  const items = (shop?.portfolio ?? []).map((p) => ({
    id: p.id,
    mediaId: p.mediaId,
    title: p.title,
    url: p.media.url,
    width: p.media.width,
    height: p.media.height,
  }));

  // TODO Phase 2: อ่านลิมิตจาก plan ของผู้ใช้จริงผ่าน entitlements
  return <PortfolioManager items={items} max={PLANS.free.limits.portfolio_items} />;
}

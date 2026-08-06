import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth-guard";
import { getOwnShop } from "@/lib/queries/creator";
import { ensureShop } from "@/lib/shop/ensure";
import { getLocale } from "@/lib/i18n/server";
import { ShopEditor } from "./shop-editor";

export default async function ShopPage() {
  const { user } = await requireCreator();

  // ผู้ใช้ที่ตั้ง handle ไว้ตั้งแต่ก่อนมีตาราง creator_page (หรือ onboarding ล้มกลางคัน)
  // จะยังไม่มีหน้าร้าน — สร้างให้ตรงนี้แทนที่จะโยน 404 ที่ผู้ใช้แก้เองไม่ได้
  await ensureShop(user.id, user.name, await getLocale());

  const shop = await getOwnShop(user.id);
  if (!shop) notFound();

  return (
    <ShopEditor
      handle={user.handle ?? ""}
      shop={{
        id: shop.id,
        bannerUrl: shop.banner?.url ?? null,
        avatarUrl: shop.avatar?.url ?? user.image ?? null,
        displayName: shop.displayName,
        tagline: shop.tagline,
        about: shop.about,
        status: shop.status,
        statusNote: shop.statusNote,
        slotsTotal: shop.slotsTotal,
        tos: shop.tos,
        isPublished: shop.isPublished,
      }}
    />
  );
}

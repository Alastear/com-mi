import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth-guard";
import { getOwnShop } from "@/lib/queries/creator";
import { ensureShop } from "@/lib/shop/ensure";
import { starterTos } from "@/lib/templates/starter-shop";
import { getLocale } from "@/lib/i18n/server";
import { ShopEditor } from "./shop-editor";

/** แปลงคอลัมน์คู่ให้เป็นจุดเดียว — null เมื่อยังไม่เคยตั้ง แล้วให้ object-cover จัดกึ่งกลางเอง */
function focalOf(m: { focalX: number | null; focalY: number | null } | null | undefined) {
  return m && m.focalX !== null && m.focalY !== null ? { x: m.focalX, y: m.focalY } : null;
}

export default async function ShopPage() {
  const { user } = await requireCreator();

  // ผู้ใช้ที่ตั้ง handle ไว้ตั้งแต่ก่อนมีตาราง creator_page (หรือ onboarding ล้มกลางคัน)
  // จะยังไม่มีหน้าร้าน — สร้างให้ตรงนี้แทนที่จะโยน 404 ที่ผู้ใช้แก้เองไม่ได้
  await ensureShop(user.id, user.name);

  const shop = await getOwnShop(user.id);
  if (!shop) notFound();

  return (
    <ShopEditor
      handle={user.handle ?? ""}
      starterTos={starterTos(await getLocale())}
      shop={{
        id: shop.id,
        bannerUrl: shop.banner?.url ?? null,
        avatarUrl: shop.avatar?.url ?? user.image ?? null,
        bannerMediaId: shop.bannerMediaId,
        avatarMediaId: shop.avatarMediaId,
        // จุดโฟกัสมีค่าก็ต่อเมื่อตั้งไว้ทั้งคู่ — ตั้งครึ่งเดียวไม่มีความหมาย
        bannerFocal: focalOf(shop.banner),
        avatarFocal: focalOf(shop.avatar),
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

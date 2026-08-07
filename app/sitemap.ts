import type { MetadataRoute } from "next";
import { listPublicShops } from "@/lib/queries/creator";
import { siteUrl } from "@/lib/site";

/**
 * แผนผังเว็บสำหรับ search engine
 *
 * ดึงจาก DB จริง ไม่ใช่ข้อมูลจำลอง — เดิมส่ง URL ของครีเอเตอร์ปลอมให้ Google เก็บ
 * ซึ่งกลายเป็น 404 ทุกอันเมื่อหน้าร้านเปลี่ยนไปอ่าน DB
 *
 * **ร้านตัวอย่างไม่เข้า sitemap** (`isDemo` ถูกกรองใน listPublicShops) — เปิดดูตรงได้
 * แต่ไม่ควรถูก index เป็นครีเอเตอร์จริง ไม่งั้นคนค้น Google เจอร้านที่ไม่มีคนอยู่
 *
 * TODO เมื่อเปิด cacheComponents: ครอบด้วย `use cache` + cacheLife('days')
 * ไม่งั้น bot ทุกตัวที่มาเก็บจะปลุก Neon (docs/01-architecture.md §2)
 */

/**
 * ⚠️ ต้องเป็น dynamic — ห้ามให้ Next prerender ตอน build
 *
 * `next build` ไม่โหลด .env.development.local และตอน deploy แรก env ยังไม่ถูก provision
 * ไฟล์นี้จะยิง DB ตั้งแต่ตอน build แล้วพังทั้ง build ด้วย "DATABASE_URL is not set"
 * (กับดักเดียวกับที่เคยทำให้ lib/auth.ts ต้อง lazy — docs/01-architecture.md §3)
 *
 * แลกกับการที่ bot ทุกตัวที่มาเก็บจะยิง query หนึ่งครั้ง ซึ่งรับได้เพราะนาน ๆ มาที
 * และจะหายไปเองเมื่อเปิด cacheComponents ตาม TODO ข้างบน
 */
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const staticRoutes = [
    "",
    "/explore",
    "/for-creators",
    "/pricing",
    "/legal/terms",
    "/legal/privacy",
  ].map(
    (path) => ({
      url: `${base}${path}`,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.6,
    }),
  );

  const shops = await listPublicShops(1000);

  // URL ตามหลักคือ /@handle — ต้องตรงกับที่ page เด้งไป ไม่งั้น Google เก็บตัวที่ถูก redirect
  const shopRoutes = shops.flatMap((shop) => {
    const handle = shop.user?.handle;
    if (!handle) return [];
    return [
      {
        url: `${base}/@${handle}`,
        changeFrequency: "daily" as const,
        priority: 0.8,
      },
    ];
  });

  return [...staticRoutes, ...shopRoutes];
}

import type { MetadataRoute } from "next";
import { creator, services } from "@/lib/mock/data";
import { siteUrl } from "@/lib/site";

const BASE = siteUrl();

/**
 * ของจริงดึงรายชื่อครีเอเตอร์ที่ publish แล้วจาก DB
 * และควรครอบด้วย 'use cache' + cacheLife('days') เพื่อไม่ให้ bot จุด DB ทุกครั้งที่มาเก็บ
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/pricing", "/explore", "/legal/terms", "/legal/privacy"].map(
    (path) => ({
      url: `${BASE}${path}`,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.6,
    }),
  );

  const creatorRoutes = [
    { url: `${BASE}/${creator.handle}`, changeFrequency: "daily" as const, priority: 0.8 },
    ...services.map((s) => ({
      url: `${BASE}/${creator.handle}/s/${s.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];

  return [...staticRoutes, ...creatorRoutes];
}

import type { MetadataRoute } from "next";
import { IS_STAGING, siteUrl } from "@/lib/site";

const BASE = siteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // หลังบ้านของครีเอเตอร์และหน้าฝั่งลูกค้าไม่ควรถูก index
      disallow: [
        "/dashboard",
        "/orders",
        "/services",
        "/portfolio",
        "/listings",
        "/clients",
        "/calendar",
        "/analytics",
        "/settings",
        "/my/",
        "/api/",
      ],
    },
    /**
     * รุ่นทดสอบไม่ประกาศ sitemap — ไม่ต้องชวนบอตมาไต่ทั้งเว็บ
     * แต่ยัง `allow` ไว้โดยตั้งใจ เพื่อให้บอตอ่าน `X-Robots-Tag: noindex` เจอ
     * (ดูเหตุผลเต็มที่ `IS_STAGING` ใน lib/site.ts)
     */
    ...(IS_STAGING ? {} : { sitemap: `${BASE}/sitemap.xml` }),
  };
}

import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

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
    sitemap: `${BASE}/sitemap.xml`,
  };
}

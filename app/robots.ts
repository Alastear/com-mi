import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://commi.app";

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

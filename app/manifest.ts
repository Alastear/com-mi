import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/site";

/**
 * ต้องมี manifest + service worker เพื่อให้ Web Push ทำงาน (ฟีเจอร์ Pro หลักของแผน)
 * และเพื่อให้ติดตั้งเป็น PWA ได้ — ทดแทนแอป native ที่ตั้งใจไม่ทำ (docs/00 §7)
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ระบบรับงาน commission`,
    short_name: SITE_NAME,
    description:
      "หน้าร้านรับงาน commission พร้อมระบบจัดการคิว ส่งงาน และเก็บเงิน สำหรับนักวาด นักตัดต่อ และคนทำ adopts",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#131316",
    theme_color: "#131316",
    lang: "th",
    categories: ["business", "productivity"],
  };
}

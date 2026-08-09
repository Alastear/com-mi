import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // มี lockfile หลายตัวใน parent directory — ระบุ root ชัดเจนกัน Turbopack เดาผิด
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },

  // TODO (Phase 0): เปิดเมื่อมี data layer จริง — ดู docs/01-architecture.md §2
  //   cacheComponents: true,
  //   หน้า public ทั้งหมดต้องใช้ 'use cache' + cacheTag แล้ว updateTag ตอนบันทึก
  //   ห้ามเรียก getLocale() ข้างใน 'use cache' — ให้รับ locale เป็น argument แทน

  typedRoutes: true,

  /**
   * รุ่นทดสอบต้องไม่เข้าดัชนี — ส่งหัวข้อนี้ทุก response ไม่ใช่แค่หน้า HTML
   * เพราะรูปและไฟล์อื่นก็ถูก index แยกได้
   */
  async headers() {
    if (process.env.SITE_NOINDEX !== "1") return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },

  images: {
    // เราย่อ/แปลง WebP ฝั่ง browser ก่อนอัปโหลดอยู่แล้ว (docs/01-architecture.md §5)
    // จึงไม่ต้องเสียโควตา Image Optimization ของ Vercel ซ้ำอีกชั้น
    unoptimized: true,
  },
};

export default nextConfig;

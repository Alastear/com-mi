import path from "node:path";
import type { NextConfig } from "next";

/**
 * หัวข้อความปลอดภัยพื้นฐาน — ส่งทุก response ทุกสภาพแวดล้อม
 *
 * ⚠️ ตั้งใจ **ไม่** ทำ CSP เต็มรูป มีแค่ `frame-ancestors` บรรทัดเดียว
 * CSP เต็มต้องไล่ nonce ให้ inline script ของ Next ทุกตัว และต้องรู้โดเมนรูป/วิดีโอ
 * ทุกเจ้า (Blob, YouTube, …) พลาดตัวเดียวหน้าร้านขาวทั้งหน้า — คนละงานกับตรงนี้
 *
 * - frame-ancestors + X-Frame-Options: ห้ามเว็บอื่นฝังหน้าเราใน iframe (clickjacking)
 *   เช่นซ้อนปุ่ม "ยืนยันรับเงิน" หรือ "ปล่อยไฟล์" ไว้ใต้ปุ่มหลอก ใส่ทั้งคู่เพราะ
 *   เบราว์เซอร์เก่าไม่รู้จัก frame-ancestors — เราเองไม่ได้ฝังหน้าตัวเองที่ไหนเลย
 *   (iframe YouTube คือเราฝังเขา ไม่ใช่เขาฝังเรา ไม่โดนผล)
 * - nosniff: response ของเรา (JSON จาก API, ไฟล์ใน public/) ต้องไม่ถูกเบราว์เซอร์
 *   เดาชนิดเป็น HTML/สคริปต์ — ⚠️ ไม่ครอบไฟล์ที่ผู้ใช้อัป เพราะไฟล์พวกนั้นเสิร์ฟจากโดเมน
 *   ของ store ไม่ใช่โดเมนเรา ถ้าย้าย media ไปโดเมนตัวเองต้องตั้งหัวข้อนี้ที่นั่นอีกที
 * - Referrer-Policy: ⚠️ ลิงก์เชิญ `/i/<token>` คือความลับ ถ้าหน้านั้นโหลดของข้ามโดเมน
 *   (รูปจาก Blob, YouTube) หรือมีคนกดลิงก์ออกไป URL เต็มพร้อม token จะติดไปใน Referer
 *   ค่านี้ส่งแค่ origin เมื่อข้ามโดเมน — เป็นค่าเริ่มต้นของเบราว์เซอร์ใหม่ ๆ อยู่แล้ว
 *   แต่ประกาศเองเพื่อไม่ต้องพึ่งว่าเบราว์เซอร์ของลูกค้าใหม่พอ
 * - Permissions-Policy: เว็บเราไม่ใช้กล้อง/ไมค์/ตำแหน่ง ปิดไว้เลยกันสคริปต์แปลกปลอม
 *   ถ้าวันหนึ่งจะสแกน QR ด้วยกล้อง ต้องมาแก้ `camera=()` ที่นี่ก่อน
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

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

  // ไม่บอกโลกว่าใช้ Next.js — ไม่ได้กันอะไรจริงจัง แต่ไม่มีเหตุผลต้องประกาศ
  poweredByHeader: false,

  async headers() {
    const headers = [...SECURITY_HEADERS];

    /**
     * รุ่นทดสอบต้องไม่เข้าดัชนี — ส่งหัวข้อนี้ทุก response ไม่ใช่แค่หน้า HTML
     * เพราะรูปและไฟล์อื่นก็ถูก index แยกได้
     * trim ด้วยเหตุผลเดียวกับ IS_STAGING ใน lib/site.ts
     */
    if (process.env.SITE_NOINDEX?.trim() === "1") {
      headers.push({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    }

    return [{ source: "/:path*", headers }];
  },

  images: {
    // เราย่อ/แปลง WebP ฝั่ง browser ก่อนอัปโหลดอยู่แล้ว (docs/01-architecture.md §5)
    // จึงไม่ต้องเสียโควตา Image Optimization ของ Vercel ซ้ำอีกชั้น
    unoptimized: true,
  },
};

export default nextConfig;

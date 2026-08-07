import { permanentRedirect } from "next/navigation";
import { normalizeHandle } from "@/lib/handles";
import type { Route } from "next";

/**
 * ส่ง `/somchai` ไป `/@somchai` ซึ่งเป็น URL ตามหลัก
 *
 * ต้องมีทางเดียวที่เป็นทางการ ไม่งั้น Google เห็นหน้าเดียวกันสองที่แล้วหั่นน้ำหนักลิงก์
 * และลิงก์เก่าที่ครีเอเตอร์แปะ bio ไว้ก่อนเปลี่ยนรูปแบบก็ยังใช้ได้ต่อ
 *
 * เรียก **หลัง** เช็คแล้วว่าร้านมีอยู่จริง ไม่งั้น path มั่ว ๆ ต้องเด้งสองต่อกว่าจะได้ 404
 * 308 ไม่ใช่ 307 — บอกทั้งคนและ bot ว่าย้ายถาวร
 *
 * `to` ต้องประกอบจาก handle ที่ normalize แล้ว **บวก path ที่เหลือทั้งหมด**
 * เคยพลาดมาแล้วตอนเด้งจาก layout: `/somchai/s/slug` กลายเป็น `/@somchai` เฉย ๆ
 */
export function redirectToCanonicalHandle(rawHandle: string, to: Route): void {
  let decoded = rawHandle;
  try {
    decoded = decodeURIComponent(rawHandle);
  } catch {
    // ลำดับ % ผิดรูป — ถือว่าไม่ใช่รูปแบบตามหลัก ให้เด้งไปตัวที่ถูก
  }
  if (!decoded.startsWith("@")) permanentRedirect(to);
}

export { normalizeHandle };

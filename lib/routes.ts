import type { Route } from "next";

/**
 * `typedRoutes` ตรวจสอบลิงก์ที่เป็น string literal ได้ครบ (เช่น "/pricing")
 * แต่ path ที่ประกอบจากข้อมูล runtime — `/${handle}` หรือ `/orders/${code}` —
 * TypeScript มองเป็น `string` กว้าง ๆ จึงไม่ผ่าน type ของ Route
 *
 * รวมการ cast ไว้ที่ฟังก์ชันเดียวแทนที่จะโรย `as Route` กระจายทั้งโปรเจกต์
 * → ยังได้ประโยชน์เต็มจาก typedRoutes กับลิงก์ static และมีจุดเดียวให้ตรวจเวลาแก้ route
 */
export function dynamicHref(path: string): Route {
  return path as Route;
}

/**
 * URL หน้าร้านตามหลักคือ `/@handle` — ต้องตรงกับ `shopUrl()` ใน lib/site.ts
 * ที่ปุ่มแชร์ใช้ ไม่งั้นลิงก์ที่ครีเอเตอร์ก็อปไปแปะ bio จะเปิดไม่ได้
 */
export const shopHref = (handle: string) => dynamicHref(`/@${handle}`);

export const serviceHref = (handle: string, slug: string) =>
  dynamicHref(`/@${handle}/s/${slug}`);

/** ออเดอร์เดียวกันมีสองที่อยู่: ครีเอเตอร์ดูที่ /orders/<code> · ลูกค้าดูที่ /my/requests/<code> */
export const orderHref = (code: string) => dynamicHref(`/orders/${code}`);
export const orderRequestHref = (code: string) => dynamicHref(`/my/requests/${code}`);

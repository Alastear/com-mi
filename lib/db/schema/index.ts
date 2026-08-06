/**
 * Schema ทั้งหมดของแอป
 *
 * auth — ตารางที่ Better Auth ต้องการ (Phase 0)
 * app  — ตารางฝั่งโดเมน: หน้าร้าน / เมนูรับงาน / ผลงาน / ไฟล์ (Phase 1a)
 *
 * ตารางออเดอร์ (order, message, payment_record, …) มาใน Phase 1b
 * ตามที่ออกแบบไว้ใน docs/02-data-model.md
 */
export * from "./auth";
export * from "./app";

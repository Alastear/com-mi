import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Neon + Drizzle
 *
 * ใช้ neon-http (stateless หนึ่ง query ต่อหนึ่ง request) ไม่ใช่ WebSocket
 * → ไม่มี connection ค้าง → Neon scale-to-zero ได้จริง → ประหยัด CU-hours
 * (ดู docs/01-architecture.md §4)
 *
 * ⚠️ สองกับดักที่ต้องระวัง:
 *   1. `neon()` จะ throw ถ้าไม่มี DATABASE_URL และ Next.js รันโค้ด top-level ตอน build
 *      → ต้อง lazy init ไม่งั้น `next build` พังตั้งแต่ deploy แรกก่อน env ถูก provision
 *   2. ห้ามห่อ client ด้วย `Proxy` เพื่อทำ lazy — pattern นี้พังกับ auth adapter
 *      ที่ตรวจ property ของ object ผลคือ request ค้างโดยไม่มี error ให้ดู
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema, casing: "snake_case" });
}

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export { schema };

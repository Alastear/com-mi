import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

/**
 * เรียก getAuth() ข้างในตัว handler ไม่ใช่ที่ top level
 * ไม่งั้น Next จะสร้าง auth instance (และต่อ DB) ตั้งแต่ตอน build
 */
export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}

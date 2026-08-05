import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, schema } from "@/lib/db";

/**
 * ⚠️ ต้อง lazy — ห้ามสร้าง instance ที่ top level
 *
 * `getDb()` จะ throw ถ้าไม่มี DATABASE_URL และ Next.js ประเมินโมดูลของ route
 * ตอน "Collecting page data" ระหว่าง build → `next build` พังทั้ง build
 * เกิดขึ้นจริงทั้งตอน build ในเครื่อง (production build ไม่โหลด .env.development.local)
 * และตอน deploy ครั้งแรกก่อน env ถูก provision
 */
let _auth: ReturnType<typeof createAuth> | null = null;

export function getAuth() {
  if (!_auth) _auth = createAuth();
  return _auth;
}

function createAuth() {
  return betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),

  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 วัน
    updateAge: 60 * 60 * 24, // ต่ออายุวันละครั้ง ไม่ใช่ทุก request → ลด write ลง Neon

    /**
     * ⭐ บรรทัดที่ประหยัดที่สุดในไฟล์นี้
     * เก็บ session ที่เซ็นแล้วไว้ในคุกกี้ 5 นาที → ทุก request ไม่ต้องยิง SELECT เข้า Neon
     * สำหรับแอปที่มี navigation ถี่ ลด DB read ได้ระดับ 80–90% (docs/01-architecture.md §3)
     */
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  user: {
    additionalFields: {
      /** ชื่อใน URL `/@handle` — ผู้ใช้ตั้งเองตอน onboarding */
      handle: { type: "string", required: false, input: false },
      /** free | pro | studio — เปลี่ยนได้จาก Stripe webhook เท่านั้น ห้ามรับจาก client */
      plan: { type: "string", required: false, defaultValue: "free", input: false },
      planUntil: { type: "date", required: false, input: false },
      role: { type: "string", required: false, defaultValue: "user", input: false },
    },
  },

  // nextCookies ต้องเป็น plugin ตัวสุดท้ายเสมอ — ทำให้ Server Action เซ็ตคุกกี้ได้
  plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

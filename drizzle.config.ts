import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit ไม่โหลด .env.local / .env.development.local ให้เอง (มีแต่ Next.js ที่ทำ)
 * ต้องรันผ่าน dotenv-cli เสมอ — ดู script `db:*` ใน package.json
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./lib/db/migrations",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // migration เป็นไฟล์ .sql ที่ commit ลง git และรีวิวได้ ไม่ใช้ push ตรงกับ production
  verbose: true,
  strict: true,
});

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ไม่ถูกตั้งค่า"); process.exit(1); }

const host = new URL(url).host;
console.log("host      :", host);
console.log("pooled    :", host.includes("-pooler") ? "ใช่" : "ไม่ใช่ (แนะนำให้ใช้ connection string แบบ pooled)");

const sql = neon(url);
const t0 = Date.now();
const [row] = await sql`select version(), current_database() as db, now() as now`;
console.log("latency   :", Date.now() - t0, "ms");
console.log("database  :", row.db);
console.log("postgres  :", String(row.version).split(" ").slice(0, 2).join(" "));
const tables = (await sql`select tablename from pg_tables where schemaname='public' order by 1`) as Array<{
  tablename: string;
}>;
console.log("tables    :", tables.length ? tables.map((t) => t.tablename).join(", ") : "(ว่าง)");

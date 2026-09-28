/**
 * ย้ายไฟล์ที่ยังอยู่บน Vercel Blob ไป R2 — รันครั้งเดียวตอนเปลี่ยนที่เก็บไฟล์
 *
 *   pnpm storage:migrate            ดูว่าจะย้ายอะไร (ไม่เขียนอะไรเลย)
 *   pnpm storage:migrate --apply    ย้ายจริง
 *
 * ทำอะไร:
 *   1. หาแถว `media` ที่ url / poster_url ยังชี้ไป *.blob.vercel-storage.com
 *   2. คัดลอกไฟล์ไป R2 **ด้วย key เดียวกับ pathname เดิม** — ถังที่ตรงกับ `access`
 *   3. ตรวจขนาดในถังปลายทางให้เท่าต้นทาง แล้วค่อยแก้แถว:
 *        public  → url / poster_url ชี้ไป R2_PUBLIC_BASE_URL
 *        private → url เป็น "" (ถังส่วนตัวไม่มี URL เปิดตรง — ดู lib/delivery/register.ts)
 *
 * ⚠️ ใช้ key เดิมโดยตั้งใจ: โค้ดชุดเก่าที่ยังรันอยู่ระหว่าง deploy ใช้ `pathname`
 * ไปขอ URL จาก Vercel Blob ส่วนโค้ดชุดใหม่ใช้ค่าเดียวกันเป็น key ใน R2
 * รันสคริปต์นี้ก่อน deploy ได้ ทั้งสองชุดยังเปิดไฟล์ได้ครบ
 *
 * ⚠️ ไม่ลบอะไรจาก Vercel Blob — เก็บไว้เป็นทางถอยอย่างน้อย 30 วัน
 * รันซ้ำได้: แถวที่ย้ายแล้วไม่ตรงเงื่อนไขข้อ 1 อีก และไฟล์ที่มีใน R2 แล้วไม่ถูกอัปซ้ำ
 */
import { neon } from "@neondatabase/serverless";
import { get } from "@vercel/blob";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const apply = process.argv.includes("--apply");
const e = process.env;
for (const name of [
  "DATABASE_URL",
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_PRIVATE_READ_WRITE_TOKEN",
  "R2_ACCOUNT_ID",
  "R2_PUBLIC_BUCKET",
  "R2_PUBLIC_ACCESS_KEY_ID",
  "R2_PUBLIC_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BASE_URL",
  "R2_PRIVATE_BUCKET",
  "R2_PRIVATE_ACCESS_KEY_ID",
  "R2_PRIVATE_SECRET_ACCESS_KEY",
]) {
  if (!e[name]?.trim()) throw new Error(`${name} is not set`);
}

const sql = neon(e.DATABASE_URL!);
const base = e.R2_PUBLIC_BASE_URL!.trim().replace(/\/+$/, "");
const endpoint = `https://${e.R2_ACCOUNT_ID!.trim()}.r2.cloudflarestorage.com`;
const mk = (prefix: "R2_PUBLIC" | "R2_PRIVATE") => ({
  bucket: e[`${prefix}_BUCKET`]!.trim(),
  client: new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: e[`${prefix}_ACCESS_KEY_ID`]!.trim(),
      secretAccessKey: e[`${prefix}_SECRET_ACCESS_KEY`]!.trim(),
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  }),
});
const stores = { public: mk("R2_PUBLIC"), private: mk("R2_PRIVATE") };

const VERCEL = "%.blob.vercel-storage.com/%";
const rows = (await sql`
  select id, access, pathname, url, poster_pathname, poster_url
  from media
  where url like ${VERCEL} or poster_url like ${VERCEL}
  order by created_at
`) as Array<{
  id: string;
  access: string;
  pathname: string;
  url: string;
  poster_pathname: string | null;
  poster_url: string | null;
}>;

console.log(`${rows.length} row(s) still on Vercel Blob${apply ? "" : " (dry run — add --apply to copy)"}`);

async function r2Size(which: "public" | "private", key: string): Promise<number | null> {
  const s = stores[which];
  try {
    const res = await s.client.send(new HeadObjectCommand({ Bucket: s.bucket, Key: key }));
    return res.ContentLength ?? 0;
  } catch (err) {
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** คัดลอกหนึ่งไฟล์ — คืนขนาดที่ยืนยันแล้วในถังปลายทาง */
async function copy(which: "public" | "private", pathname: string, url: string): Promise<number> {
  const token = which === "private" ? e.BLOB_PRIVATE_READ_WRITE_TOKEN! : e.BLOB_READ_WRITE_TOKEN!;
  const src = await get(url, { access: which, token, useCache: false });
  if (!src || src.statusCode !== 200) throw new Error(`source missing: ${pathname}`);

  const existing = await r2Size(which, pathname);
  if (existing === src.blob.size) {
    await src.stream.cancel();
    return existing;
  }

  const body = new Uint8Array(await new Response(src.stream).arrayBuffer());
  const s = stores[which];
  await s.client.send(
    new PutObjectCommand({
      Bucket: s.bucket,
      Key: pathname,
      Body: body,
      ContentType: src.blob.contentType,
      ...(which === "public" ? { CacheControl: "public, max-age=31536000, immutable" } : {}),
    }),
  );
  const size = await r2Size(which, pathname);
  if (size !== src.blob.size) throw new Error(`size mismatch after copy: ${pathname}`);
  return size;
}

let moved = 0;
for (const row of rows) {
  const which = row.access === "private" ? "private" : "public";
  const files = [
    { pathname: row.pathname, url: row.url },
    ...(row.poster_pathname && row.poster_url
      ? [{ pathname: row.poster_pathname, url: row.poster_url }]
      : []),
  ].filter((f) => f.url.includes(".blob.vercel-storage.com/"));

  console.log(`- ${row.id} [${which}] ${files.map((f) => f.pathname).join(", ")}`);
  if (!apply) continue;

  for (const f of files) {
    const size = await copy(which, f.pathname, f.url);
    console.log(`    copied ${f.pathname} (${size} B)`);
  }

  // แก้แถวหลังคัดลอกและยืนยันขนาดครบทุกไฟล์ของแถวแล้วเท่านั้น
  const url = which === "public" ? `${base}/${row.pathname}` : "";
  const posterUrl =
    which === "public" && row.poster_pathname ? `${base}/${row.poster_pathname}` : row.poster_url;
  await sql`update media set url = ${url}, poster_url = ${posterUrl} where id = ${row.id}`;
  moved += 1;
}

if (apply) console.log(`done: ${moved} row(s) now point at R2`);

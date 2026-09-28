/**
 * ตรวจว่า R2 ตั้งค่าถูกต้องครบทุกข้อที่โค้ดพึ่งอยู่ — `pnpm r2:check`
 *
 * ยิงตรงจาก Node ด้วยกุญแจเดียวกับที่แอปใช้ แต่ละข้อพิมพ์ ok / FAIL
 * ใช้ไฟล์ทดสอบใต้ `_healthcheck/` แล้วลบทิ้งเองตอนจบ ไม่แตะไฟล์จริง
 *
 * ข้อที่พังเงียบถ้าตั้งผิด (เห็นจากหน้าจอไม่ได้เลย):
 *   - กุญแจถังสาธารณะเปิดถังส่วนตัวได้ → ไฟล์ส่งมอบหลุดถ้ากุญแจหลุด
 *   - ถังส่วนตัวเปิดตรงได้โดยไม่เซ็น → ไฟล์ส่งมอบหลุดทันที
 *   - CORS ไม่ส่ง ETag ออกมา → อัปไฟล์ส่งมอบแบบเป็นชิ้นไม่ได้ทั้งระบบ
 *   - CORS ยอมทุกโดเมน → เว็บอื่นใช้ URL ที่เซ็นไว้ของเราได้
 */
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const e = process.env;
const need = (name: string) => {
  const v = e[name]?.trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
};
const endpoint = `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
const base = need("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
const APP_ORIGINS = ["https://com-mi.poruyrai.xyz", "http://localhost:3450"];
const mk = (prefix: string) => ({
  bucket: need(`${prefix}_BUCKET`),
  client: new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: need(`${prefix}_ACCESS_KEY_ID`),
      secretAccessKey: need(`${prefix}_SECRET_ACCESS_KEY`),
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  }),
});
const pub = mk("R2_PUBLIC");
const priv = mk("R2_PRIVATE");

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};
const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (err) {
    return (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? -1;
  }
};

const stamp = Date.now();
const pubKey = `_healthcheck/check-${stamp}.webp`;
const privKey = `_healthcheck/check-${stamp}`;
const body = new Uint8Array(1234).fill(7);

try {
  /* ── ถังสาธารณะ: อัปผ่าน URL ที่เซ็น แล้วเปิดจากโดเมนสาธารณะ ── */
  const H = {
    "content-type": "image/webp",
    "cache-control": "public, max-age=31536000, immutable",
    "if-none-match": "*",
  };
  const putUrl = await getSignedUrl(
    pub.client,
    new PutObjectCommand({
      Bucket: pub.bucket,
      Key: pubKey,
      ContentType: H["content-type"],
      ContentLength: body.length,
      CacheControl: H["cache-control"],
      IfNoneMatch: "*",
    }),
    { expiresIn: 300, signableHeaders: new Set(Object.keys(H).concat("content-length")) },
  );
  check("public: presigned PUT", (await fetch(putUrl, { method: "PUT", headers: H, body })).status === 200);
  check("public: overwrite refused (412)", (await fetch(putUrl, { method: "PUT", headers: H, body })).status === 412);
  check(
    "public: wrong size refused (403)",
    (await fetch(putUrl, { method: "PUT", headers: H, body: new Uint8Array(99) })).status === 403,
  );
  const got = await fetch(`${base}/${pubKey}`);
  check("public: readable at R2_PUBLIC_BASE_URL", got.status === 200, `${got.status}`);

  /* ── ถังส่วนตัว: multipart + ETag + URL ดาวน์โหลด ── */
  const mp = await priv.client.send(
    new CreateMultipartUploadCommand({ Bucket: priv.bucket, Key: privKey, ContentType: "application/zip" }),
  );
  const partUrl = await getSignedUrl(
    priv.client,
    new UploadPartCommand({
      Bucket: priv.bucket,
      Key: privKey,
      UploadId: mp.UploadId,
      PartNumber: 1,
      ContentLength: body.length,
    }),
    { expiresIn: 300, signableHeaders: new Set(["content-length"]) },
  );
  // ส่ง Origin แบบที่เบราว์เซอร์ส่ง — Expose-Headers มากับคำตอบจริง ไม่ได้มากับ preflight
  const part = await fetch(partUrl, { method: "PUT", body, headers: { Origin: APP_ORIGINS[0] } });
  const etag = part.headers.get("etag");
  check("private: presigned part PUT returns ETag", part.status === 200 && !!etag);
  check(
    "cors private: browser can read ETag (ExposeHeaders)",
    (part.headers.get("access-control-expose-headers") ?? "").toLowerCase().includes("etag"),
    part.headers.get("access-control-expose-headers") ?? "no expose header",
  );
  await priv.client.send(
    new CompleteMultipartUploadCommand({
      Bucket: priv.bucket,
      Key: privKey,
      UploadId: mp.UploadId,
      MultipartUpload: { Parts: [{ PartNumber: 1, ETag: etag ?? "" }] },
    }),
  );
  const getUrl = await getSignedUrl(
    priv.client,
    new GetObjectCommand({ Bucket: priv.bucket, Key: privKey, ResponseContentDisposition: 'attachment; filename="x.zip"' }),
    { expiresIn: 60 },
  );
  const dl = await fetch(getUrl);
  check(
    "private: presigned GET with filename",
    dl.status === 200 && (dl.headers.get("content-disposition") ?? "").startsWith("attachment"),
  );

  /* ── แยกสิทธิ์ ── */
  check(
    "isolation: public key cannot read private bucket",
    (await status(pub.client.send(new HeadObjectCommand({ Bucket: priv.bucket, Key: privKey })))) === 403,
  );
  check(
    "isolation: private key cannot read public bucket",
    (await status(priv.client.send(new HeadObjectCommand({ Bucket: pub.bucket, Key: pubKey })))) === 403,
  );
  const anon = await fetch(`${endpoint}/${priv.bucket}/${privKey}`);
  check("isolation: private bucket refuses unsigned GET", anon.status >= 400, `${anon.status}`);

  /* ── CORS ── */
  for (const [label, bucket, key] of [
    ["public", pub.bucket, pubKey],
    ["private", priv.bucket, privKey],
  ] as const) {
    for (const origin of [...APP_ORIGINS, "https://evil.example"]) {
      const res = await fetch(`${endpoint}/${bucket}/${key}`, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type,cache-control,if-none-match",
        },
      });
      const allowed = res.headers.get("access-control-allow-origin") === origin;
      const shouldAllow = origin !== "https://evil.example";
      check(`cors ${label}: ${origin} ${shouldAllow ? "allowed" : "refused"}`, allowed === shouldAllow);
    }
  }
} finally {
  await pub.client.send(new DeleteObjectsCommand({ Bucket: pub.bucket, Delete: { Objects: [{ Key: pubKey }] } }));
  await priv.client.send(new DeleteObjectsCommand({ Bucket: priv.bucket, Delete: { Objects: [{ Key: privKey }] } }));
}

console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) FAILED`);
process.exitCode = failed === 0 ? 0 : 1;

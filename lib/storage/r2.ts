import "server-only";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { attachmentDisposition, publicUrlFor } from "./keys";

/**
 * ทางเดียวที่ได้รับอนุญาตให้คุยกับ R2
 *
 * สองถัง สองกุญแจ — กุญแจแต่ละตัวถูกจำกัดสิทธิ์ไว้ที่ถังเดียวตั้งแต่ฝั่ง Cloudflare
 * (ทดสอบแล้ว: กุญแจถังสาธารณะอ่านถังส่วนตัวได้ 403 และกลับกันก็ 403)
 * โค้ดที่เผลอหยิบผิดถังจึงพังทันที แทนที่จะเขียนไฟล์ส่งมอบไปไว้ที่ที่ใครก็เปิดได้
 *
 *   public  — รูปหน้าร้าน ผลงาน ปกเมนู เปิดตรงจาก `R2_PUBLIC_BASE_URL`
 *   private — ไฟล์ส่งมอบ ไม่มีโดเมน ไม่มี r2.dev อ่านได้ผ่าน URL ที่เราเซ็นเท่านั้น
 *
 * ⚠️ `import "server-only"` — build พังทันทีถ้ามีใคร import ไฟล์นี้เข้า client
 * ⚠️ env หายต้องโยน error ไม่ใช่คืนค่าว่าง — บทเรียนจาก Vercel Blob ที่ token หาย
 *    แล้วตกไปใช้ store สาธารณะเงียบ ๆ ไฟล์ส่งมอบเปิดได้ทั้งโลกโดยไม่มี error ให้เห็น
 */

export type Bucket = "public" | "private";

function env(name: string): string {
  // trim — ค่าที่วางผ่าน `echo | vercel env add` เคยติด newline ท้ายมาแล้ว
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const clients = new Map<Bucket, { client: S3Client; bucket: string }>();

function store(which: Bucket) {
  let s = clients.get(which);
  if (!s) {
    const prefix = which === "public" ? "R2_PUBLIC" : "R2_PRIVATE";
    s = {
      bucket: env(`${prefix}_BUCKET`),
      client: new S3Client({
        region: "auto",
        endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env(`${prefix}_ACCESS_KEY_ID`),
          secretAccessKey: env(`${prefix}_SECRET_ACCESS_KEY`),
        },
        /**
         * ⚠️ ต้องปิด checksum อัตโนมัติ — SDK รุ่นใหม่ใส่ CRC32 ลงใน URL ที่เซ็น
         * แล้วเบราว์เซอร์ส่ง header นั้นมาไม่ได้ อัปโหลดจะได้ 403 ทุกครั้ง
         */
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
    };
    clients.set(which, s);
  }
  return s;
}

export function publicUrl(key: string): string {
  return publicUrlFor(env("R2_PUBLIC_BASE_URL"), key);
}

/** รูปทุกไฟล์มี key ไม่ซ้ำและไม่เคยถูกเขียนทับ — ให้ CDN กับเบราว์เซอร์จำไว้ได้ตลอด */
const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * URL อัปโหลดไฟล์สาธารณะหนึ่งไฟล์ พร้อม header ที่เบราว์เซอร์ต้องส่งมาให้ตรง
 *
 * ทุกค่าใน `headers` และขนาดไฟล์ถูกเซ็นไว้ — R2 ตอบ 403 ถ้าอะไรไม่ตรง (ทดสอบแล้ว):
 *   - ขนาดต่างจาก `bytes` แม้ไบต์เดียว → โควตาที่ตรวจตอนออก URL จึงเชื่อได้
 *   - ชนิดไฟล์ต่าง → อัป HTML ขึ้นโดเมนรูปของเราไม่ได้
 *   - ไม่ส่ง `if-none-match: *` → บังคับไม่ให้เขียนทับ (มีไฟล์อยู่แล้วได้ 412)
 *     ไม่งั้นถือ URL ไว้แล้วสลับรูปทีหลัง หลังจากรูปแรกผ่านการบันทึกไปแล้วได้
 */
export async function presignPublicPut(input: {
  key: string;
  contentType: string;
  bytes: number;
}): Promise<{ url: string; headers: Record<string, string> }> {
  const { client, bucket } = store("public");
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.bytes,
      CacheControl: IMMUTABLE,
      IfNoneMatch: "*",
    }),
    {
      expiresIn: 10 * 60,
      signableHeaders: new Set(["content-type", "content-length", "cache-control", "if-none-match"]),
    },
  );
  return {
    url,
    headers: { "content-type": input.contentType, "cache-control": IMMUTABLE, "if-none-match": "*" },
  };
}

/**
 * เริ่ม multipart upload ในถังส่วนตัว แล้วเซ็น URL ให้ทุกชิ้นในครั้งเดียว
 *
 * ขนาดของแต่ละชิ้นถูกเซ็นไว้ ผลรวมจึงเท่ากับขนาดที่ขอไว้เป๊ะ — โควตาที่ตรวจตอนขอจึงใช้ได้จริง
 * (Vercel Blob บังคับเพดานกับ multipart ไม่ได้ ต้องไปลบทิ้งหลังอัปเสร็จ)
 *
 * อายุ URL ยาว 6 ชั่วโมงโดยตั้งใจ — ไฟล์ 2 GB บนเน็ตมือถือใช้เวลาหลายชั่วโมงได้
 * URL ที่หลุดไปใช้ได้แค่ส่งไบต์ขนาดเท่าเดิมเข้า upload ที่ยังไม่เสร็จนี้ ไม่ได้อ่านอะไร
 */
export async function startPrivateMultipart(input: {
  key: string;
  contentType: string;
  sizes: number[];
}): Promise<{ uploadId: string; urls: string[] }> {
  const { client, bucket } = store("private");
  const created = await client.send(
    new CreateMultipartUploadCommand({ Bucket: bucket, Key: input.key, ContentType: input.contentType }),
  );
  const uploadId = created.UploadId;
  if (!uploadId) throw new Error("r2: no UploadId");

  const urls = await Promise.all(
    input.sizes.map((size, i) =>
      getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: bucket,
          Key: input.key,
          UploadId: uploadId,
          PartNumber: i + 1,
          ContentLength: size,
        }),
        { expiresIn: 6 * 60 * 60, signableHeaders: new Set(["content-length"]) },
      ),
    ),
  );
  return { uploadId, urls };
}

export async function completePrivateMultipart(input: {
  key: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}): Promise<void> {
  const { client, bucket } = store("private");
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: input.key,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: input.parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

/** ยกเลิก multipart ที่ค้าง — upload ที่ไม่มีอยู่แล้ว (เสร็จไปแล้วหรือถูกยกเลิกแล้ว) ไม่ถือว่าพัง */
export async function abortPrivateMultipart(key: string, uploadId: string): Promise<void> {
  const { client, bucket } = store("private");
  try {
    await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
  } catch (err) {
    if (isNotFound(err)) return;
    throw err;
  }
}

/** ขนาดและชนิดจริงของไฟล์ในถัง — ไม่มีไฟล์ = `null` */
export async function headObject(
  which: Bucket,
  key: string,
): Promise<{ bytes: number; contentType: string | null } | null> {
  const { client, bucket } = store(which);
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { bytes: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * ลบหลายไฟล์ในคำสั่งเดียว (สูงสุด 1000) — key ที่ไม่มีอยู่แล้วไม่ถือว่าพัง
 * แต่ถ้า R2 รายงานว่าลบบางไฟล์ไม่ได้ ต้องโยนออกไป ไม่งั้นผู้เรียกจะลบแถวใน DB
 * ทิ้งทั้งที่ไฟล์ยังอยู่ แล้วไฟล์นั้นก็ไม่มีใครรู้จักอีกเลย
 */
export async function deleteObjects(which: Bucket, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const { client, bucket } = store(which);
  const res = await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    }),
  );
  if (res.Errors?.length) {
    throw new Error(`r2 delete: ${res.Errors.map((e) => `${e.Key}:${e.Code}`).join(",").slice(0, 200)}`);
  }
}

export async function listObjects(
  which: Bucket,
  cursor?: string,
): Promise<{ objects: Array<{ key: string; lastModified: Date }>; cursor?: string }> {
  const { client, bucket } = store(which);
  const res = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: cursor, MaxKeys: 1000 }),
  );
  return {
    objects: (res.Contents ?? []).flatMap((o) =>
      o.Key && o.LastModified ? [{ key: o.Key, lastModified: o.LastModified }] : [],
    ),
    cursor: res.IsTruncated ? res.NextContinuationToken : undefined,
  };
}

/**
 * URL ดาวน์โหลดไฟล์ส่งมอบ — ใครถือก็โหลดได้จนหมดอายุ จึงต้องออกทีละครั้งและอายุสั้น
 * ตั้งชื่อไฟล์ตอนโหลดเป็นชื่อเดิมที่ครีเอเตอร์อัปมา (key ใน R2 เป็นแค่ id)
 */
export async function presignPrivateGet(input: {
  key: string;
  filename: string;
  expiresInSeconds: number;
}): Promise<string> {
  const { client, bucket } = store("private");
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ResponseContentDisposition: attachmentDisposition(input.filename),
    }),
    { expiresIn: input.expiresInSeconds },
  );
}

function isNotFound(err: unknown): boolean {
  if (!(err instanceof S3ServiceException)) return false;
  return err.$metadata.httpStatusCode === 404 || err.name === "NotFound" || err.name === "NoSuchKey" || err.name === "NoSuchUpload";
}

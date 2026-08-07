import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth-guard";
import { PLANS, type PlanId } from "@/lib/billing/plans";
import { isPublicKind, type MediaKind } from "@/lib/media/kinds";
import { ACCEPTED_VIDEO_TYPES, MAX_VIDEO_BYTES } from "@/lib/media/video";

/**
 * ออก token ให้เบราว์เซอร์อัปโหลดตรงไป Blob
 *
 * ไฟล์ไม่วิ่งผ่าน serverless function เลย → ไม่เสียค่า data transfer
 * และไม่ชนเพดาน request body 4.5 MB (docs/01-architecture.md §5)
 *
 * ⚠️ ที่นี่คือจุดเดียวที่เซิร์ฟเวอร์เห็น request ก่อนไฟล์ถูกเขียน
 *    การตรวจสิทธิ์และโควตาจึงต้องอยู่ใน onBeforeGenerateToken เท่านั้น
 *
 * ⚠️ ตั้งใจไม่ใช้ `onUploadCompleted` — callback นั้นถูกยิงจากเซิร์ฟเวอร์ Vercel
 *    มายัง URL สาธารณะของเรา จึง **ไม่ทำงานบน localhost** (ต้องมี tunnel)
 *    ถ้าผูกการสร้างแถวใน `media` ไว้กับมัน การอัปโหลดตอน dev จะเงียบและไม่มีข้อมูลลง DB
 *    → ให้ client เรียก Server Action `registerMedia` แทน ซึ่งยืนยันขนาดไฟล์จริงด้วย head()
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const session = await getSession();
        if (!session) throw new Error("unauthorized");

        const kind = (JSON.parse(clientPayload ?? "{}") as { kind?: MediaKind }).kind;
        /**
         * ⚠️ ยอมเฉพาะชนิดที่อยู่ store **สาธารณะ** เท่านั้น
         *
         * เส้นทางนี้ออก token ให้ store สาธารณะ ถ้าปล่อยชนิดอย่าง `final` หรือ
         * `payment_proof` ผ่าน ไฟล์ส่งมอบกับสลิปโอนเงินจะไปอยู่ที่ที่ใครมี URL ก็โหลดได้
         * และจะไม่มี error ให้เห็นเลย — อัปโหลดสำเร็จปกติทุกอย่าง
         * ไฟล์ส่วนตัวมีเส้นทางของตัวเองที่ตรวจสิทธิ์ระดับออเดอร์
         */
        if (!kind || !isPublicKind(kind)) throw new Error("invalid kind");

        const plan = (session.user.plan ?? "free") as PlanId;
        const limits = (PLANS[plan] ?? PLANS.free).limits;

        // โควตาพื้นที่: รวมจากแถวใน media (ถูกและเร็วกว่าไล่นับไฟล์ใน Blob store)
        const [used] = await getDb()
          .select({ total: sql<string>`coalesce(sum(${schema.media.bytes}), 0)` })
          .from(schema.media)
          .where(eq(schema.media.ownerUserId, session.user.id));

        if (Number(used?.total ?? 0) >= limits.storage_bytes) {
          throw new Error("storage_quota_exceeded");
        }

        /**
         * รูปถูกย่อและแปลงเป็น WebP มาแล้วเสมอ ส่วนวิดีโอตัวอย่าง **ไม่ถูกแปลง**
         * (transcode ในเบราว์เซอร์กินเวลาหลายนาทีบนมือถือและผลไม่แน่นอน)
         * จึงคุมด้วยขนาดกับความยาวแทน และรับเฉพาะพอร์ตโฟลิโอ
         */
        const isPortfolioVideo = kind === "portfolio";
        return {
          allowedContentTypes: isPortfolioVideo
            ? ["image/webp", ...ACCEPTED_VIDEO_TYPES]
            : ["image/webp"],
          maximumSizeInBytes: isPortfolioVideo
            ? Math.min(limits.file_size_bytes * 2, MAX_VIDEO_BYTES)
            : Math.min(limits.file_size_bytes, 12 * 1024 * 1024),
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: session.user.id, kind }),
        };
      },
    });

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload_failed";
    console.error("[blob/upload]", message);
    return Response.json({ error: message }, { status: 400 });
  }
}

import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { after } from "next/server";
import { emailNotification, shouldEmail } from "@/lib/email/notify";
import type { NotificationData, NotificationType } from "./types";

/**
 * สร้างการแจ้งเตือน
 *
 * ออกแบบให้ **ล้มเหลวเงียบ ๆ ได้** — ถูกเรียกต่อท้ายการกระทำที่สำคัญกว่ามัน
 * (เปลี่ยนสถานะออเดอร์ ยืนยันเงินเข้า) ถ้าเขียนแจ้งเตือนไม่สำเร็จแล้วโยน error
 * ขึ้นไป การกระทำหลักที่ทำสำเร็จไปแล้วจะดูเหมือนพัง ทั้งที่ข้อมูลจริงถูกต้อง
 * ผู้ใช้ก็จะกดซ้ำ ซึ่งแย่กว่าการไม่ได้รับแจ้งเตือนหนึ่งครั้ง
 *
 * `data` บังคับรูปตามชนิด (`NotificationData`) — ลืมส่งยอดเงินของรายการเงิน = tsc ไม่ผ่าน
 * ⚠️ `entityType`/`entityId` ต้องชี้ออเดอร์ (หรือคำเชิญ) ของเรื่องนั้นเสมอ
 * อีเมลอ่านชื่อลูกค้า ชื่อร้าน ชื่องาน และยอดเงินจากตรงนั้น ไม่มี = ไม่มีอีเมล
 */
export async function notify<T extends NotificationType>(input: {
  userId: string;
  type: T;
  url: string;
  data: NotificationData[T];
  entityType: "order" | "invite";
  entityId: string;
  actorUserId?: string | null;
}): Promise<void> {
  // ไม่ต้องแจ้งเตือนตัวเองว่าตัวเองทำอะไร
  if (input.actorUserId && input.actorUserId === input.userId) return;

  try {
    await getDb().insert(schema.notification).values({
      id: newId("ntf"),
      userId: input.userId,
      type: input.type,
      data: input.data,
      url: input.url,
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId: input.actorUserId ?? null,
    });
  } catch (err) {
    // เขียน log ไว้ให้ตามได้ แต่ห้ามให้กระทบการกระทำหลัก
    console.error("[notify] เขียนแจ้งเตือนไม่สำเร็จ", input.type, err);
  }

  /**
   * อีเมลไปอยู่หลัง response — `after()` รันเมื่อ Next ส่งคำตอบกลับไปแล้ว
   * ถ้าเรียกตรงนี้เลย ผู้ใช้จะรอ API ของ Resend ทุกครั้งที่กดปุ่ม
   * ทั้งที่งานจริงบันทึกลง DB เสร็จไปก่อนหน้านั้นแล้ว
   *
   * เรียกเฉพาะชนิดที่คุ้มค่าส่ง — ข้อความในเธรดถี่เกินกว่าจะส่งทุกครั้ง
   * ลิงก์ในอีเมลไม่ได้ใช้ `url` ของแจ้งเตือน ชั้นอีเมลคิดเองจากฝั่งของผู้รับ
   */
  if (shouldEmail(input.type, input.data)) {
    after(async () => {
      try {
        await emailNotification({
          userId: input.userId,
          type: input.type,
          data: input.data,
          entityType: input.entityType,
          entityId: input.entityId,
        });
      } catch (err) {
        // หลัง response แล้วไม่มีใครรับ error นี้ — log ไว้ให้ตามได้
        console.error("[notify] ส่งอีเมลไม่สำเร็จ", input.type, err);
      }
    });
  }
}

/** จำนวนที่ยังไม่อ่าน — ใช้ partial index ที่ครอบเงื่อนไขนี้พอดี */
export async function unreadCount(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(schema.notification)
    .where(and(eq(schema.notification.userId, userId), isNull(schema.notification.readAt)));
  return row?.n ?? 0;
}

/** รายการล่าสุดสำหรับ dropdown — จำกัดจำนวนตั้งแต่ใน query */
export async function recentNotifications(userId: string, limit = 12) {
  return getDb().query.notification.findMany({
    where: eq(schema.notification.userId, userId),
    orderBy: [desc(schema.notification.createdAt)],
    limit,
  });
}

/** ทำเครื่องหมายอ่านทั้งหมด — เขียนเฉพาะแถวที่ยังไม่อ่าน */
export async function markAllRead(userId: string): Promise<void> {
  await getDb()
    .update(schema.notification)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notification.userId, userId), isNull(schema.notification.readAt)));
}

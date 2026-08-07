import { getSession } from "@/lib/auth-guard";
import { recentNotifications, unreadCount } from "@/lib/notifications/create";

/**
 * ปลายทางที่กระดิ่งใช้ poll
 *
 * ตั้งใจ **ไม่ใช้ SSE/WebSocket** — Vercel Fluid Compute คิดเงินตาม
 * active CPU + memory ที่จองไว้ การเปิดสตรีมค้างแปลว่ามี function ค้าง
 * ต่อผู้ใช้หนึ่งคนที่เปิดแท็บทิ้งไว้ ซึ่งแพงกว่าประโยชน์มาก (docs/01 §6)
 *
 * ตอบด้วย ETag — ถ้าไม่มีอะไรใหม่ เบราว์เซอร์ได้ 304 ตัวเปล่า
 * ไม่ต้องส่ง payload ซ้ำ ส่วนฝั่ง client ถอยจังหวะ poll เองเมื่อเงียบ
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });

  const [unread, items] = await Promise.all([
    unreadCount(session.user.id),
    recentNotifications(session.user.id, 12),
  ]);

  /**
   * ETag ต้องเปลี่ยนเมื่อ "มีอันใหม่" หรือ "จำนวนที่ยังไม่อ่านเปลี่ยน"
   * ใช้ id ของอันล่าสุด (เรียงตามเวลาในตัว) คู่กับจำนวน — พอสำหรับทั้งสองกรณี
   * และไม่ต้อง hash อะไรให้เปลืองแรง
   */
  const etag = `W/"${items[0]?.id ?? "0"}-${unread}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return Response.json(
    {
      unread,
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        data: n.data,
        url: n.url,
        read: n.readAt !== null,
        createdAt: n.createdAt.toISOString(),
      })),
    },
    {
      headers: {
        ETag: etag,
        // ข้อมูลส่วนตัว — ห้าม CDN หรือ proxy ระหว่างทางเก็บไว้
        "Cache-Control": "private, no-store",
      },
    },
  );
}

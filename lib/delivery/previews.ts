"use server";

import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth-guard";
import { isOrderCode } from "@/lib/orders/code";
import { presignPrivateGet } from "@/lib/storage/r2";
import { lockOrder } from "@/lib/orders/lock";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { affectedRows } from "@/lib/uploads/intent";
import { notify } from "@/lib/notifications/create";
import { newId } from "@/lib/db/id";

export async function listWorkPreviews(code: string) {
  const session = await getSession();
  if (!session || !isOrderCode(code)) return [];
  const db = getDb();
  const order = await db.query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: { id: true, clientUserId: true, approvedPreviewId: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order || (order.clientUserId !== session.user.id && order.page.userId !== session.user.id)) return [];
  const files = await db.query.media.findMany({
    where: and(eq(schema.media.orderId, order.id), eq(schema.media.kind, "wip"), eq(schema.media.isWatermarked, true)),
    columns: { id: true, filename: true, pathname: true, createdAt: true },
    orderBy: [desc(schema.media.createdAt), desc(schema.media.id)], limit: 30,
  });
  return Promise.all(files.map(async f => ({
    id: f.id, filename: f.filename, createdAt: f.createdAt.toISOString(),
    approved: order.approvedPreviewId === f.id,
    url: await presignPrivateGet({ key: f.pathname, filename: f.filename, inline: true, expiresInSeconds: 300 }),
  })));
}

export async function approveWorkPreview(code: string, mediaId: string): Promise<boolean> {
  const session = await getSession();
  if (!session || !isOrderCode(code) || typeof mediaId !== "string" || mediaId.length > 64) return false;
  const db = getDb();
  const order = await db.query.order.findFirst({ where: and(eq(schema.order.code, code), eq(schema.order.clientUserId, session.user.id)), columns: { id: true, approvedPreviewId: true }, with: { page: { columns: { userId: true } } } });
  if (!order) return false;
  if (order.approvedPreviewId === mediaId) return true;
  const [, updated] = await db.batch([
    lockOrder(order.id),
    db.execute(sql`with approved as (update "order" o set approved_preview_id = ${mediaId}, updated_at = now()
      where o.id = ${order.id} and o.client_user_id = ${session.user.id} and o.status = 'in_review'
      and o.approved_preview_id is distinct from ${mediaId}
      and ${mediaId} = (select m.id from media m where m.order_id = o.id and m.kind = 'wip' and m.is_watermarked = true order by m.created_at desc, m.id desc limit 1)
      returning o.id)
      insert into message (id, order_id, sender_user_id, body, attachment_media_ids, is_system_event, event_type, event_data, read_by_client_at)
      select ${newId("msg")}, approved.id, ${session.user.id}, '', jsonb_build_array(${mediaId}::text), true,
        'work_preview_approved', jsonb_build_object('actor', 'client', 'previewId', ${mediaId}::text), now()
      from approved returning id`),
  ]);
  if (!affectedRows(updated)) return false;
  await notify({ userId: order.page.userId, actorUserId: session.user.id, type: "work_preview_approved", data: { code }, url: `/orders/${code}`, entityType: "order", entityId: order.id });
  revalidatePath(`/my/requests/${code}`); revalidatePath(`/orders/${code}`);
  return true;
}

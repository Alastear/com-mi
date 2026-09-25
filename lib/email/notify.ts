import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { fill, getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { SITE_NAME } from "@/lib/site";
import { emailLayout, sendEmail } from "./send";
import {
  emailKindFor,
  orderFacts,
  renderEmail,
  type EmailFacts,
  type EmailKind,
} from "./templates";
import type { NotificationData, NotificationType } from "@/lib/notifications/types";

/**
 * ส่งอีเมลคู่กับการแจ้งเตือนในเว็บ
 *
 * ⚠️ เรียกผ่าน `after()` เท่านั้น — งานนี้ยิง DB และเรียก API ภายนอก
 * ถ้าอยู่ในเส้นทางหลัก ผู้ใช้จะรอทั้งสองอย่างทั้งที่งานจริงเสร็จไปแล้ว
 *
 * ชนิดไหนส่งอีเมลตัดสินที่ `emailKindFor()` (lib/email/templates.ts) ที่เดียว —
 * ข้อความแชทไม่ส่ง ส่วนที่ส่งคือเหตุการณ์ที่อีกฝ่ายต้องลงมือทำหรือเรื่องเงิน
 */
export function shouldEmail<T extends NotificationType>(
  type: T,
  data: NotificationData[T],
): boolean {
  return emailKindFor(type, data) !== null;
}

type EmailInput<T extends NotificationType> = {
  userId: string;
  type: T;
  data: NotificationData[T];
  entityType?: string;
  entityId?: string;
};

export async function emailNotification<T extends NotificationType>(
  input: EmailInput<T>,
): Promise<void> {
  const kind = emailKindFor(input.type, input.data);
  if (!kind) return;

  if (!input.entityId || (input.entityType !== "order" && input.entityType !== "invite")) {
    console.error("[email] ไม่รู้ว่าเป็นเรื่องของออเดอร์/คำเชิญไหน:", input.type);
    return;
  }

  const db = getDb();
  const [recipient, facts] = await Promise.all([
    db.query.user.findFirst({
      columns: { email: true, locale: true },
      where: eq(schema.user.id, input.userId),
    }),
    input.entityType === "order"
      ? loadOrderFacts(input.entityId, input.userId)
      : loadInviteFacts(input.entityId, input.userId),
  ]);
  if (!recipient?.email) return;
  if (!facts) {
    console.error("[email] หาข้อมูลไม่เจอหรือผู้รับไม่เกี่ยวข้อง:", input.type, input.entityId);
    return;
  }

  /**
   * ภาษาของ **ผู้รับ** ไม่ใช่ของคนที่กด — คนละคนกันเสมอในอีเมลพวกนี้
   * ไม่เคยรู้ภาษา (บัญชีเก่า ไม่เคยกดเปลี่ยน) = ภาษาไทย
   */
  const locale: Locale = isLocale(recipient.locale) ? recipient.locale : DEFAULT_LOCALE;

  await deliver(recipient.email, kind, input.data as Record<string, unknown>, facts, locale);
}

async function deliver(
  to: string,
  kind: EmailKind,
  data: Record<string, unknown>,
  facts: EmailFacts,
  locale: Locale,
): Promise<void> {
  const rendered = renderEmail({ kind, data, facts, locale });
  if (!rendered.ok) {
    // ไม่ส่งดีกว่าส่งเรื่องผิดคนหรือข้อความแหว่ง — แต่ต้องรู้ว่าเกิด
    console.error("[email] ไม่ส่ง:", kind, rendered.reason, rendered.detail ?? "");
    return;
  }

  const { subject, body, ctaLabel, path } = rendered.email;
  const { html, text } = emailLayout({
    heading: subject,
    body,
    ctaLabel,
    ctaPath: path,
    footer: fill(getDictionary(locale).email.footer, { site: SITE_NAME }),
  });

  await sendEmail({ to, subject, html, text });
}

/**
 * ทุกอย่างที่อีเมลของออเดอร์ต้องใช้ ในคำสั่งเดียว
 *
 * ผู้รับต้องเป็นลูกค้าหรือเจ้าของร้านของออเดอร์นี้เท่านั้น — นอกนั้นคืน null ไม่ส่ง
 * ฝั่งของผู้รับ (`role`) เป็นตัวเลือกข้อความและลิงก์ ไม่ใช่ผู้เรียกบอกมา
 */
async function loadOrderFacts(orderId: string, recipientId: string): Promise<EmailFacts | null> {
  const row = await getDb().query.order.findFirst({
    where: eq(schema.order.id, orderId),
    columns: {
      code: true,
      clientUserId: true,
      currency: true,
      totalCents: true,
      depositCents: true,
      amountPaidCents: true,
    },
    with: {
      client: { columns: { name: true } },
      page: { columns: { displayName: true, userId: true } },
      service: { columns: { title: true } },
      payments: {
        columns: { amountCents: true, verifiedAt: true, rejectedAt: true, voidedAt: true },
      },
      // ใบที่ยังกดยอมรับได้ มีได้ใบเดียว (order_quote_live_idx)
      quotes: {
        columns: { totalCents: true, depositCents: true },
        where: (q, { and, isNull }) => and(isNull(q.supersededAt), isNull(q.acceptedAt)),
        limit: 1,
      },
    },
  });
  if (!row) return null;

  const role =
    row.clientUserId === recipientId
      ? "client"
      : row.page?.userId === recipientId
        ? "creator"
        : null;
  if (!role) return null;

  return { entity: "order", role, order: orderFacts(row) };
}

/**
 * คำเชิญที่เพิ่งมีคนกดรับ — ยังไม่มีออเดอร์ ข้อมูลอยู่ที่คำขอที่ยังเปิดอยู่กับฉบับที่ตกลง
 *
 * ถ้าลูกค้าถอนตัวไปแล้วก่อนอีเมลออก ก็ไม่มีอะไรให้ยืนยัน — ไม่ส่ง
 */
async function loadInviteFacts(inviteId: string, recipientId: string): Promise<EmailFacts | null> {
  const row = await getDb().query.orderInvite.findFirst({
    where: eq(schema.orderInvite.id, inviteId),
    columns: { id: true },
    with: {
      page: { columns: { displayName: true, userId: true } },
      service: { columns: { title: true } },
      claims: {
        where: (c, { and, isNull }) => and(isNull(c.rejectedAt), isNull(c.withdrawnAt)),
        limit: 1,
        columns: { id: true },
        with: {
          user: { columns: { name: true, email: true } },
          revision: { columns: { totalCents: true, depositCents: true } },
        },
      },
    },
  });
  const claim = row?.claims[0];
  if (!row || !claim || row.page?.userId !== recipientId) return null;

  return {
    entity: "invite",
    role: "creator",
    invite: {
      service: row.service?.title?.trim() || null,
      clientName: claim.user?.name?.trim() || null,
      clientEmail: claim.user?.email ?? "",
      shopName: row.page?.displayName?.trim() || null,
      currency: "THB",
      totalCents: claim.revision?.totalCents ?? 0,
      depositCents: claim.revision?.depositCents ?? 0,
    },
  };
}

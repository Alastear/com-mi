import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { fill, getDictionary } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { SITE_NAME } from "@/lib/site";
import { formatMoney } from "@/lib/format";
import { emailLayout, sendEmail } from "./send";
import type { NotificationType } from "@/lib/notifications/types";

/**
 * ส่งอีเมลคู่กับการแจ้งเตือนในเว็บ
 *
 * ⚠️ เรียกผ่าน `after()` เท่านั้น — งานนี้ยิง DB หนึ่งครั้งและเรียก API ภายนอก
 * ถ้าอยู่ในเส้นทางหลัก ผู้ใช้จะรอทั้งสองอย่างทั้งที่งานจริงเสร็จไปแล้ว
 *
 * **ไม่ใช่ทุกแจ้งเตือนที่ควรส่งอีเมล** — ข้อความในเธรดถี่เกินกว่าจะส่งทุกครั้ง
 * แพ็กเกจฟรีตามแผน (docs/01 §6) ได้ digest วันละครั้ง ส่วน Pro ได้ทันที
 * ระหว่างที่ยังไม่มีระบบ digest จึงส่งเฉพาะเหตุการณ์ที่ "พลาดแล้วเสียงาน":
 * ออเดอร์ใหม่ · แจ้งโอนเงิน · ยืนยันเงินเข้า
 */
const EMAIL_WORTHY: readonly NotificationType[] = [
  "order_created",
  "payment_reported",
  "payment_confirmed",
  // ครีเอเตอร์บันทึกยอดในนามลูกค้า — ลูกค้าต้องได้รู้แม้ไม่ได้เปิดเว็บอยู่
  // เพราะเป็นรายการที่มีผลต่อเงินและปลดล็อกไฟล์งานได้
  "payment_recorded_by_creator",
];

export function shouldEmail(type: NotificationType): boolean {
  return EMAIL_WORTHY.includes(type);
}

type EmailInput = {
  userId: string;
  type: NotificationType;
  data: Record<string, string | number>;
  path: string;
};

export async function emailNotification(input: EmailInput): Promise<void> {
  if (!shouldEmail(input.type)) return;

  const recipient = await getDb().query.user.findFirst({
    columns: { email: true, name: true },
    where: eq(schema.user.id, input.userId),
  });
  if (!recipient?.email) return;

  /**
   * ภาษายังยึด default ไปก่อน — ภาษาที่ผู้ใช้เลือกเก็บใน cookie
   * ซึ่งอ่านไม่ได้จากตรงนี้เพราะโค้ดนี้รันหลัง response ออกไปแล้ว
   * TODO Phase 2: เก็บ `user.locale` ตอน onboarding แล้วอ่านจากตรงนั้น
   */
  const locale: Locale = DEFAULT_LOCALE;
  const t = getDictionary(locale);
  const e = t.email;

  const subject = fill(
    input.type === "order_created"
      ? e.orderCreatedSubject
      : input.type === "payment_reported"
        ? e.paymentReportedSubject
        : input.type === "payment_recorded_by_creator"
          ? e.paymentRecordedSubject
          : e.paymentConfirmedSubject,
    input.data,
  );

  const amount =
    typeof input.data.amount === "number"
      ? formatMoney(input.data.amount, "THB", locale)
      : String(input.data.amount ?? "");

  const body = fill(
    input.type === "order_created"
      ? e.orderCreatedBody
      : input.type === "payment_reported"
        ? e.paymentReportedBody
        : input.type === "payment_recorded_by_creator"
          ? e.paymentRecordedBody
          : e.paymentConfirmedBody,
    { ...input.data, amount },
  );

  const { html, text } = emailLayout({
    heading: subject,
    body,
    ctaLabel: e.viewOrder,
    ctaPath: input.path,
    footer: fill(e.footer, { site: SITE_NAME }),
  });

  await sendEmail({ to: recipient.email, subject, html, text });
}

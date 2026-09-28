import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";

/**
 * รูปของรีวิวที่ส่งลงคอมโพเนนต์ฝั่ง client บนหน้าออเดอร์ (`components/app/order-review.tsx`)
 *
 * แปลงที่ server ทั้งหมด: ตัดวันเวลาดิบออก เหลือแค่ธงกับข้อความที่ฟอร์แมตแล้ว
 * อยู่ไฟล์ธรรมดา ไม่ใช่ในไฟล์ `"use client"` — ฟังก์ชันจากไฟล์นั้นถูกเรียกจาก server component ไม่ได้
 */
export type OrderReviewView = {
  rating: number;
  body: string;
  /** null = ร้านยังไม่ตอบ */
  reply: string | null;
  edited: boolean;
  repliedBeforeEdit: boolean;
  /** คิดจากนาฬิกาฝั่ง server แล้ว (`getReviewForOrder`) — ไม่เทียบเวลาเองตอน render */
  editable: boolean;
  /** วันสุดท้ายที่แก้ได้ ฟอร์แมตที่ server — เขตเวลาของเบราว์เซอร์จะได้ไม่ทำให้ HTML สองฝั่งไม่ตรงกัน */
  editableUntilText: string;
};

export function toOrderReviewView(
  row: {
    rating: number;
    body: string;
    creatorReply: string;
    creatorRepliedAt: Date | null;
    updatedAt: Date | null;
    editable: boolean;
    editableUntil: Date;
    repliedBeforeEdit: boolean;
  },
  locale: Locale,
): OrderReviewView {
  return {
    rating: row.rating,
    body: row.body,
    reply: row.creatorRepliedAt ? row.creatorReply : null,
    edited: row.updatedAt !== null,
    repliedBeforeEdit: row.repliedBeforeEdit,
    editable: row.editable,
    editableUntilText: formatDate(row.editableUntil, locale),
  };
}

import type { PaymentRow } from "@/components/app/payment-panel";

type PaymentRecordRow = {
  id: string;
  amountCents: number;
  method: string;
  paidAt: Date;
  verifiedAt: Date | null;
  note: string;
};

/**
 * แปลงแถว payment_record เป็น DTO ที่ส่งข้ามไปฝั่ง client ได้
 *
 * ตัด `verifiedByUserId` และ `proofMediaId` ทิ้ง — ฝั่ง UI ต้องรู้แค่ว่า
 * "ยืนยันแล้วหรือยัง" ไม่ต้องรู้ว่าใครกดหรือไฟล์สลิปคือไฟล์ไหน
 */
export function toPaymentRows(records: PaymentRecordRow[]): PaymentRow[] {
  return records.map((p) => ({
    id: p.id,
    amountCents: p.amountCents,
    method: p.method,
    paidAt: p.paidAt.toISOString(),
    verified: p.verifiedAt !== null,
    note: p.note,
  }));
}

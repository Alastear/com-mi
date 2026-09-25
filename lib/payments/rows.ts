import type { PaymentRow } from "@/components/app/payment-panel";
import { paymentState } from "./money";

type PaymentRecordRow = {
  id: string;
  amountCents: number;
  method: string;
  paidAt: Date;
  verifiedAt: Date | null;
  rejectedAt: Date | null;
  rejectReason: string;
  voidedAt: Date | null;
  voidReason: string;
  note: string;
};

/**
 * แปลงแถว payment_record เป็น DTO ที่ส่งข้ามไปฝั่ง client ได้
 *
 * ตัด `verifiedByUserId` / `rejectedByUserId` / `voidedByUserId` และ `proofMediaId` ทิ้ง —
 * ฝั่ง UI ต้องรู้แค่ว่ารายการอยู่สถานะไหน ไม่ต้องรู้ว่าใครกดหรือไฟล์สลิปคือไฟล์ไหน
 *
 * เหตุผลที่ครีเอเตอร์เขียนตอนปฏิเสธ/ยกเลิก **ส่งไปทั้งสองฝั่งโดยตั้งใจ**
 * ช่องกรอกบอกครีเอเตอร์ไว้แล้วว่าลูกค้าจะเห็น
 */
export function toPaymentRows(records: PaymentRecordRow[]): PaymentRow[] {
  return records.map((p) => {
    const state = paymentState(p);
    return {
      id: p.id,
      amountCents: p.amountCents,
      method: p.method,
      paidAt: p.paidAt.toISOString(),
      state,
      reason: state === "rejected" ? p.rejectReason : state === "voided" ? p.voidReason : "",
      note: p.note,
    };
  });
}

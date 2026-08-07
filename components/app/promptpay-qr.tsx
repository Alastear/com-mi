import { encode } from "uqr";
import { AlertTriangle } from "lucide-react";
import { promptPayPayload } from "@/lib/payments/promptpay";
import type { PromptPayType } from "@/lib/payments/promptpay-id";
import { formatPromptPayId } from "@/lib/payments/promptpay-id";
import { formatMoney } from "@/lib/format";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

/**
 * QR PromptPay ของออเดอร์หนึ่งใบ
 *
 * เป็น Server Component ล้วน — payload สร้างฝั่งเซิร์ฟเวอร์จากหมายเลขที่ครีเอเตอร์
 * บันทึกไว้ ไม่ได้รับมาจาก client เลย ไม่งั้นมีคนแก้ปลายทางแล้วเงินไปผิดบัญชี
 *
 * วาดเป็น SVG จากเมทริกซ์ตรง ๆ ไม่ใช้ canvas — คมทุกความละเอียด สแกนจากจอได้
 * และไม่ต้องส่ง JavaScript ไปฝั่ง client เลยสักบรรทัด
 *
 * ⚠️ **คำเตือนเรื่องเรียกเงินคืนไม่ได้ต้องอยู่ติดกับ QR เสมอ**
 * นี่คือจุดที่ผู้ใช้ตัดสินใจโอน ไม่ใช่หน้า help ที่ไม่มีใครเปิด (docs/00 §5.2.1)
 */
export function PromptPayQR({
  type,
  id,
  payeeName,
  amountSatang,
  locale,
}: {
  type: PromptPayType;
  id: string;
  payeeName: string | null;
  amountSatang: number;
  locale: Locale;
}) {
  const t = getDictionary(locale);
  const payload = promptPayPayload({ type, id, amountSatang });
  const qr = encode(payload, { ecc: "M", border: 2 });

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-xl bg-white p-3">
        <svg
          viewBox={`0 0 ${qr.size} ${qr.size}`}
          width={220}
          height={220}
          shapeRendering="crispEdges"
          role="img"
          aria-label={t.payment.qrAlt}
        >
          <rect width={qr.size} height={qr.size} fill="#fff" />
          {qr.data.map((row, y) =>
            row.map((on, x) =>
              on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#000" /> : null,
            ),
          )}
        </svg>
      </div>

      <div className="text-center">
        <p className="tabular text-lg font-semibold">
          {formatMoney(amountSatang, "THB", locale)}
        </p>
        <p className="tabular text-sm text-muted-foreground">{formatPromptPayId(type, id)}</p>
        {payeeName ? <p className="text-sm text-muted-foreground">{payeeName}</p> : null}
      </div>

      {/*
        ข้อความนี้ห้ามย้ายไปที่อื่นและห้ามย่อ — เป็นราคาที่ผู้ใช้ต้องรู้ก่อนกดโอน
        ของโมเดลที่แพลตฟอร์มไม่ถือเงิน ไม่มีใครเรียกคืนให้ได้ทั้งเราและธนาคาร
      */}
      <p className="flex max-w-xs items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs leading-relaxed text-warning">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{t.payment.irreversible}</span>
      </p>

      <p className="max-w-xs text-center text-xs text-muted-foreground">
        {t.payment.checkPayeeName}
      </p>
    </div>
  );
}

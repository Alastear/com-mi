import { normalizePromptPayId, type PromptPayType } from "./promptpay-id";

/**
 * สร้าง payload ของ Thai QR Payment (มาตรฐาน EMVCo) สำหรับ PromptPay
 *
 * ⚠️ **ถ้าไฟล์นี้ผิด เงินของคนอื่นจะไปผิดบัญชีจริง**
 *
 * ✅ ยืนยันด้วยการสแกนจริงแล้ว (7 ส.ค. 2026)
 *    สแกน QR ที่สร้างจากไฟล์นี้ด้วยแอปธนาคารจริง → แอปอ่านออก ขึ้นชื่อผู้รับถูกคน
 *    และยอด ฿1.00 ตรงตามที่ระบุในช่อง 54 → โอนสำเร็จ
 *
 * **แก้ไฟล์นี้เมื่อไร ต้องสแกนยืนยันใหม่ทุกครั้ง** `pnpm test` พิสูจน์ได้แค่ว่า
 * "สร้างสตริงตามสเปก" ไม่ได้พิสูจน์ว่า "ธนาคารอ่านแล้วชี้ไปบัญชีที่ถูกต้อง"
 * สองอย่างนี้ต่างกัน และอย่างหลังคือสิ่งที่ทำให้เงินไปถึงคนที่ควรได้
 *
 * โครงสร้างเป็น TLV ซ้อนกัน: แต่ละช่องคือ id 2 หลัก + ความยาว 2 หลัก + ค่า
 * ปิดท้ายด้วย CRC-16/CCITT-FALSE ที่คำนวณครอบทุกอย่างรวม "6304" ของตัวมันเอง
 */

/** id 2 หลัก + ความยาว 2 หลัก + ค่า — ความยาวนับเป็นจำนวนตัวอักษร ไม่ใช่ไบต์ */
function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

/**
 * CRC-16/CCITT-FALSE — poly 0x1021, init 0xFFFF, ไม่กลับบิต, xorout 0
 *
 * ค่าตรวจมาตรฐาน: crc16("123456789") === 0x29B1 (มีเทสต์คุมไว้)
 * ถ้าเผลอใช้ตัวแปรอื่นของ CRC-16 (ARC, MODBUS, XMODEM) จะได้เลขคนละตัว
 * และธนาคารจะปฏิเสธ QR ทั้งใบ — ซึ่งยังดีกว่าเงินไปผิดบัญชี แต่ก็ยังพัง
 */
export function crc16ccitt(input: string): number {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/**
 * แปลงหมายเลขให้อยู่ในรูปที่ PromptPay ใช้
 *
 * เบอร์โทร: ตัด 0 นำหน้าแล้วเติมรหัสประเทศ 66 จากนั้น pad ศูนย์ให้ครบ 13 หลัก
 *   0812345678 → 66812345678 → 0066812345678
 * เลขบัตรประชาชน / เลขผู้เสียภาษี: ใช้ 13 หลักตามเดิม
 */
function formatTarget(type: PromptPayType, id: string): string {
  const digits = normalizePromptPayId(id);
  if (type === "phone") {
    const national = digits.replace(/^0/, "");
    return `0000${66}${national}`.slice(-13);
  }
  return digits;
}

export type PromptPayPayloadInput = {
  type: PromptPayType;
  id: string;
  /** ยอดเงินหน่วยสตางค์ — ไม่ใส่ = QR แบบให้ผู้จ่ายกรอกยอดเอง */
  amountSatang?: number | null;
};

export function promptPayPayload({ type, id, amountSatang }: PromptPayPayloadInput): string {
  const target = formatTarget(type, id);

  // เบอร์โทรใช้ sub-id 01, เลขบัตร/ผู้เสียภาษีใช้ 02
  const accountTag = type === "phone" ? "01" : "02";

  const merchantAccount = tlv("29", tlv("00", "A000000677010111") + tlv(accountTag, target));

  /**
   * 01 = "12" เมื่อ QR ใช้ได้ครั้งเดียว (มียอดกำกับ) และ "11" เมื่อใช้ซ้ำได้
   * ตรงกับพฤติกรรมที่ต้องการ: QR ของออเดอร์หนึ่งใบมียอดตายตัว ใช้จบแล้วจบ
   */
  const isDynamic = typeof amountSatang === "number" && amountSatang > 0;

  let payload =
    tlv("00", "01") +
    tlv("01", isDynamic ? "12" : "11") +
    merchantAccount +
    tlv("53", "764") + // สกุลเงิน THB ตาม ISO 4217
    (isDynamic ? tlv("54", satangToAmount(amountSatang!)) : "") +
    tlv("58", "TH"); // ประเทศ

  // CRC ต้องคำนวณครอบ "6304" ของตัวเองด้วย จึงต่อท้ายก่อนแล้วค่อยคิด
  payload += "6304";
  return payload + crc16ccitt(payload).toString(16).toUpperCase().padStart(4, "0");
}

/**
 * สตางค์ → ข้อความยอดเงินสองตำแหน่ง
 * ทำจากจำนวนเต็มล้วน ไม่แตะ float — 290000 → "2900.00"
 * (`(290000/100).toFixed(2)` ก็ได้ผลเดียวกันในเคสนี้ แต่พังกับตัวเลขบางค่า)
 */
function satangToAmount(satang: number): string {
  const s = Math.max(0, Math.round(satang));
  return `${Math.floor(s / 100)}.${String(s % 100).padStart(2, "0")}`;
}

/** ตรวจว่าสตริงที่ได้มา CRC ถูกต้องไหม — ใช้ในเทสต์และเวลาไล่ปัญหา */
export function isValidPayload(payload: string): boolean {
  if (payload.length < 8) return false;
  const body = payload.slice(0, -4);
  const given = payload.slice(-4).toUpperCase();
  if (!body.endsWith("6304")) return false;
  return crc16ccitt(body).toString(16).toUpperCase().padStart(4, "0") === given;
}

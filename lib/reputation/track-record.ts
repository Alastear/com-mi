/**
 * ประวัติร้าน — ตรรกะล้วน ๆ ไม่แตะ DB (ตัวคิวรีอยู่ที่ lib/queries/reputation.ts)
 *
 * ทำไมต้องมี: แพลตฟอร์มไม่ถือเงิน (ไม่มี escrow) ลูกค้าโอนตรงเข้าบัญชีครีเอเตอร์
 * สิ่งเดียวที่ช่วยลูกค้าตัดสินใจก่อนโอนคือ "ร้านนี้เคยทำงานจบจริงแค่ไหน"
 * ตัวเลขนี้จึงต้องไม่โกหกทั้งทางดีและทางร้าย และร้านต้องลบของไม่ดีออกเองไม่ได้
 *
 * ⚠️ **นับเฉพาะออเดอร์ที่ร้านเคยยืนยันรับเงิน** (`PAID_ONCE_SQL` — รวมที่ยกเลิกการยืนยันทีหลัง)
 * ออเดอร์ที่ร้านไม่เคยอ้างว่าได้เงินไม่นับ — กันยอด "งานเสร็จ" จากออเดอร์ทดลอง/ค้างที่ไม่มีใครจ่าย
 * ⚠️ **แต่ไม่ได้พิสูจน์ว่ามีเงินย้ายมือจริง**: การยืนยันเป็นคำพูดของครีเอเตอร์ฝ่ายเดียว
 * (`recordPayment` ของครีเอเตอร์นับทันทีโดยไม่มีสลิป) ครีเอเตอร์ที่มีบัญชีที่สองปั๊มตัวเลขได้ฟรี
 * — ดูหมายเหตุ "สิ่งที่ตัวเลขนี้พิสูจน์ไม่ได้" ใน lib/queries/reputation.ts
 */

/**
 * งานเสร็จที่มีเงินเข้าขั้นต่ำก่อนโชว์ตัวเลข
 *
 * ต่ำกว่านี้ตัวเลขแกว่งเกินจะมีความหมาย: งานเดียวที่ช้าวันเดียวทำให้ "ส่งตรงเวลา 50%"
 * กับร้านที่ตั้งใจทำงาน และ "100%" จากงานสองชิ้นก็ดูน่าเชื่อเกินจริง
 * ร้านใหม่จึงเห็นแค่ "ร้านใหม่" — ไม่ใช่ตัวเลขศูนย์ ๆ ที่อ่านเหมือนร้านแย่
 */
export const TRACK_RECORD_MIN_COMPLETED = 5;

/** ผลดิบจาก SQL — ชื่อฟิลด์ตรงกับ `getShopTrackRecord()` */
export type TrackRecordRaw = {
  /** งานที่ `completed` และร้านเคยยืนยันเงิน */
  completed: number;
  /** ในนั้น มีกี่งานที่มีทั้งกำหนดส่งและเวลาส่งมอบ (ตัวหารของ "ส่งตรงเวลา") */
  timed: number;
  /**
   * ส่งมอบไม่เกินกำหนดส่ง (เทียบระดับเวลา)
   * ⚠️ "ส่งมอบ" ไม่ใช่ event `delivered` — event นั้นรอลูกค้าจ่ายครบก่อน ความช้าในการโอนงวดท้าย
   * ของลูกค้าจะกลายเป็นความช้าของร้าน นิยามจริงอยู่ที่ `HANDOVER_AT` ใน lib/queries/reputation.ts
   */
  onTime: number;
  /** ค่ากลางของเวลาจากลูกค้าแจ้งโอนมัดจำ (หรือตอนสั่ง) ถึงส่งมอบ — วินาที, null = ไม่มีข้อมูล */
  medianSeconds: number | null;
  /** ออเดอร์ที่ร้านเคยยืนยันเงินแล้วแต่ **ร้าน** เป็นคนกดยกเลิก */
  creatorCancelled: number;
  reviewCount: number;
  /** ค่าเฉลี่ยดาว — null เมื่อยังไม่มีรีวิว */
  ratingAvg: number | null;
};

export type TrackRecord =
  | {
      locked: true;
      /** ใช้บอกเจ้าของร้านว่าอีกกี่งานจะปลดล็อก — ห้ามโชว์ให้คนนอกเห็น */
      completed: number;
      reviewCount: number;
    }
  | {
      locked: false;
      completed: number;
      /** 0–100 ปัดเป็นจำนวนเต็ม — null เมื่อไม่มีงานไหนมีกำหนดส่งให้เทียบ */
      onTimePercent: number | null;
      turnaround: Turnaround | null;
      creatorCancelled: number;
      /** null เมื่อยังไม่มีรีวิว — ไม่โชว์ "0.0 ดาว" */
      rating: { average: number; count: number } | null;
    };

/**
 * เวลาทำงานในรูปที่หน้าจอเอาไปแปลต่อ
 *   under_day — ไม่ถึงวัน (ไม่เขียนว่า "0 วัน" ซึ่งอ่านเหมือนข้อมูลเสีย)
 *   days      — ปัดเป็นวันเต็มที่ใกล้ที่สุด
 */
export type Turnaround = { kind: "under_day" } | { kind: "days"; days: number };

const DAY_SECONDS = 86_400;

export function turnaroundFrom(seconds: number | null): Turnaround | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < DAY_SECONDS) return { kind: "under_day" };
  return { kind: "days", days: Math.round(seconds / DAY_SECONDS) };
}

/**
 * เปอร์เซ็นต์ส่งตรงเวลา — ปัดลง ไม่ใช่ปัดใกล้สุด
 *
 * ปัดใกล้สุดทำให้ 199/200 (99.5%) ขึ้นเป็น "100%" ซึ่งเป็นคำกล่าวอ้างที่ไม่จริง
 * ตัวเลขที่ลูกค้าใช้ตัดสินใจโอนเงินต้องไม่เอียงไปทางร้าน
 */
export function onTimePercent(onTime: number, timed: number): number | null {
  if (timed <= 0) return null;
  const clamped = Math.min(Math.max(onTime, 0), timed);
  return Math.floor((clamped / timed) * 100);
}

/** ค่าเฉลี่ยดาวปัดทศนิยมหนึ่งตำแหน่ง — ปัดลงด้วยเหตุผลเดียวกับเปอร์เซ็นต์ (4.96 ไม่ใช่ "5.0") */
export function roundRating(avg: number): number {
  return Math.floor(avg * 10) / 10;
}

export function summarizeTrackRecord(raw: TrackRecordRaw): TrackRecord {
  if (raw.completed < TRACK_RECORD_MIN_COMPLETED) {
    return { locked: true, completed: raw.completed, reviewCount: raw.reviewCount };
  }
  return {
    locked: false,
    completed: raw.completed,
    onTimePercent: onTimePercent(raw.onTime, raw.timed),
    turnaround: turnaroundFrom(raw.medianSeconds),
    creatorCancelled: raw.creatorCancelled,
    rating:
      raw.reviewCount > 0 && raw.ratingAvg !== null
        ? { average: roundRating(raw.ratingAvg), count: raw.reviewCount }
        : null,
  };
}

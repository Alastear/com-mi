/**
 * ชนิดของไฟล์ที่อัปโหลดได้
 *
 * แบ่งตาม **store ที่ไฟล์ต้องไปอยู่** ไม่ใช่ตามหน้าที่ใช้งาน
 * เพราะโหมด access ของ Blob store กำหนดตอนสร้างและเปลี่ยนทีหลังไม่ได้
 */

/** ไฟล์ที่คนทั่วไปเปิดดูซ้ำเยอะ — อยู่ store สาธารณะ ติด CDN cache ได้ */
export const PUBLIC_MEDIA_KINDS = ["avatar", "banner", "portfolio", "service_cover"] as const;

/**
 * ไฟล์ที่ต้องกันคนอื่น — อยู่ store ส่วนตัว อ่านได้ผ่าน signed URL เท่านั้น
 *
 * `final` คือไฟล์ส่งมอบ ซึ่งเป็นด่านเดียวที่กันงานหลุดก่อนจ่ายเงินครบ
 * `payment_proof` คือสลิปโอนเงิน มีเลขบัญชีและชื่อจริงของคนโอนอยู่
 * `reference` คือไฟล์อ้างอิงจากลูกค้า ซึ่งอาจเป็นภาพส่วนตัวหรือ OC ที่ยังไม่เปิดเผย
 * `wip` อยู่ฝั่ง private ด้วย — ภาพระหว่างทำที่หลุดออกไปคือรายได้ที่หายไปของครีเอเตอร์
 */
export const PRIVATE_MEDIA_KINDS = ["reference", "wip", "final", "payment_proof"] as const;

export const MEDIA_KINDS = [...PUBLIC_MEDIA_KINDS, ...PRIVATE_MEDIA_KINDS] as const;

export type PublicMediaKind = (typeof PUBLIC_MEDIA_KINDS)[number];
export type PrivateMediaKind = (typeof PRIVATE_MEDIA_KINDS)[number];
export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * ⚠️ ต้องเรียกก่อนออก token ของ store สาธารณะเสมอ
 *
 * ถ้าลืม ลูกค้าจะขอ token ของ store สาธารณะให้ไฟล์ `final` ได้
 * แล้วไฟล์ส่งมอบจะไปอยู่ที่ที่ใครมี URL ก็โหลดได้ โดยไม่มีอะไรผิดพลาดให้เห็นเลย
 */
export function isPrivateKind(kind: string): kind is PrivateMediaKind {
  return (PRIVATE_MEDIA_KINDS as readonly string[]).includes(kind);
}

export function isPublicKind(kind: string): kind is PublicMediaKind {
  return (PUBLIC_MEDIA_KINDS as readonly string[]).includes(kind);
}

/**
 * ที่อยู่ของไฟล์ส่งมอบในถังส่วนตัว — ไฟล์ทุกไฟล์ของออเดอร์เดียวกันอยู่ใต้ prefix เดียวกัน
 *
 * key ทั้งก้อนถูกเลือกฝั่งเซิร์ฟเวอร์ใน `startDeliveryUpload` (lib/uploads/actions.ts)
 * เบราว์เซอร์ไม่เคยส่ง path มาเอง — สมัย Vercel Blob ต้องเทียบ prefix กันสามที่
 * (client, route ออก token, register) และเคยเพี้ยนจนอัปไฟล์ส่งมอบไม่ได้ทั้งระบบมาแล้ว
 *
 * ใช้ `code` ไม่ใช่ `order.id` — อ่าน key ในถังแล้วรู้ทันทีว่าเป็นของออเดอร์ไหน
 * code ไม่ซ้ำกันทั้งระบบ path จึงผูกกับออเดอร์เดียวเสมอ
 */
export function deliveryPrefix(code: string): string {
  return `deliveries/${code}/`;
}

export function isDeliveryPath(pathname: string, code: string): boolean {
  return pathname.startsWith(deliveryPrefix(code));
}

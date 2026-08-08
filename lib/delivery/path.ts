/**
 * ที่อยู่ของไฟล์ส่งมอบใน Blob store — **กฎเดียว ใช้ร่วมกันทุกฝั่ง**
 *
 * `pathname` มาจากเบราว์เซอร์และเซิร์ฟเวอร์แก้ไม่ได้ (handleUpload เอาไปใส่ token ตรง ๆ)
 * การปฏิเสธจึงเป็นเครื่องมือเดียวที่มี และต้องมีสามที่ที่เห็นตรงกันเป๊ะ ๆ:
 *   1. ฝั่ง client ตอนเรียก `upload()`
 *   2. `/api/blob/delivery-upload` ตอนออก token
 *   3. `registerDeliveryFile()` ตอนบันทึกลง DB
 *
 * เคยเขียนแยกกันสามที่แล้วเพี้ยนจริงมาแล้วสองรอบ:
 *   - client ส่ง `deliveries/_/…` แต่ route ขอ `deliveries/<order.id>/…` → 403 ทุกครั้ง
 *   - พอแก้ route ให้ใช้ code แล้ว ก็ยังเหลือ register ที่เช็ค id อยู่ → ไฟล์ขึ้น store
 *     ได้แต่ไม่มีแถว media ชี้ถึง กลายเป็นไฟล์กำพร้าที่ต้องตามลบเอง
 *
 * ใช้ `code` ไม่ใช่ `order.id` เพราะเบราว์เซอร์รู้จักออเดอร์จาก code เท่านั้น
 * ความปลอดภัยเท่ากัน: ทั้งสองฝั่ง server ยืนยันสิทธิ์ในออเดอร์ของ code นั้นก่อนเทียบ path
 * และ code ไม่ซ้ำกันทั้งระบบ path จึงผูกกับออเดอร์เดียวเสมอ
 */
export function deliveryPrefix(code: string): string {
  return `deliveries/${code}/`;
}

export function isDeliveryPath(pathname: string, code: string): boolean {
  return pathname.startsWith(deliveryPrefix(code));
}

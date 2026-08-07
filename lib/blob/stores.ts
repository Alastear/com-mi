import "server-only";

/**
 * ทางเดียวที่ได้รับอนุญาตให้อ่าน token ของ Blob store
 *
 * `import "server-only"` ทำให้ build พังทันทีถ้ามีใครเผลอ import ไฟล์นี้
 * เข้า client component — token ของ store ส่วนตัวคือกุญแจของไฟล์ส่งมอบทั้งหมด
 *
 * ⚠️ **โยน error เมื่อไม่มีค่า ห้ามคืน undefined**
 * `put(..., { token: undefined })` ไม่ error แต่ตกไปใช้ store สาธารณะเงียบ ๆ
 * (ทดสอบกับของจริงแล้ว: ไฟล์ไปโผล่ที่ store สาธารณะ และ anonymous GET ได้ 200)
 * แปลว่า env หายไปตัวเดียวใน branch เดียว = ไฟล์งานของลูกค้าเปิดอ่านได้ทั้งโลก
 * โดยไม่มีอะไรผิดพลาดให้เห็นเลย — ต้องพังดัง ๆ ตั้งแต่แรกแทน
 */

export function publicBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  return token;
}

export function privateBlobToken(): string {
  const token = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_PRIVATE_READ_WRITE_TOKEN is not set");
  return token;
}

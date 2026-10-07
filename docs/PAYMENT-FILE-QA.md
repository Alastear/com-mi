# Payment and file QA — 7 ตุลาคม 2026

ใช้ local production build port 3450 และ `.env.local` ที่เจ้าของยืนยันว่าเป็นระบบทดสอบ
ปิด EMAIL_FROM/RESEND_API_KEY ใน server process ใช้บัญชี fixture และ signed sessions เท่านั้น
ไม่มีการโอนเงินจริงหรือเรียก Stripe checkout

## ผลตรวจ

- R2 healthcheck ผ่าน 16 ข้อ: presigned public upload, ปฏิเสธ overwrite/ขนาดผิด,
  public read, private multipart upload/ETag/download, แยกกุญแจสอง bucket,
  unsigned S3 denial และ CORS สำหรับ localhost/โดเมนเว็บ/โดเมนที่ไม่อนุญาต
- Creator บันทึกมัดจำผ่าน UI แล้ว amount_paid_cents ตรง ledger; void แล้วหักยอดกลับ
- ยืนยัน pending bank_transfer และ reject pending true_wallet ผ่าน UI แล้วตรวจ DB
  รายการ pending เหล่านี้สร้างเป็น fixture ไม่ใช่หลักฐานว่าโอนผ่านธนาคาร/Wallet จริง
- ก่อนยอมรับตัวอย่าง: ลูกค้าไม่มีปุ่มแจ้งจ่ายงวดสุดท้าย และ creator ยืนยันยอดสุดท้ายไม่ได้
- รายงาน CRM ใช้ query จริง: รวมเฉพาะ verified ที่ไม่ rejected/voided, pending ไม่นับ,
  หลายรายการเงินไม่ทำให้จำนวนงานซ้ำ และ USD ไม่ปนยอดรวม THB แต่มีในประวัติรายงาน
- อัปโหลด PNG ผ่าน UI เป็นภาพ WebP ฝังลายน้ำใน private R2; ตรวจภาพแสดงจริงใน browser
- ลูกค้ากด Cancel ใน dialog ยอมรับตัวอย่างแล้ว approved_preview_id ยังว่าง;
  กด Approve work แล้วบันทึกจริง จากนั้น creator ยืนยันยอดที่เหลือได้จนเต็ม 1,000 บาทจำลอง
- อัปโหลดไฟล์ต้นฉบับและเตรียมส่งมอบผ่าน UI: จ่ายครบแต่ยังไม่ release ลูกค้ายังดาวน์โหลดไม่ได้
- กดส่งมอบแล้วลูกค้าดาวน์โหลดได้ ตรวจชื่อไฟล์และ bytes ตรง PNG ต้นฉบับทุกไบต์
- ร้านอื่นไม่เห็นปุ่มเงินหรือดาวน์โหลด; มือถือ 390px ชื่อไฟล์ยาวและปุ่มไม่ล้นแนวนอน
- ไม่พบ browser pageerror ในรอบที่ผ่าน; lint และ TypeScript ของสคริปต์ผ่าน

พบ timeout ในรอบอัปโหลดภาพตัวอย่างครั้งแรก (ไม่มีแถว wip ภายใน 60 วินาที)
รอบถัดไปเพิ่ม diagnostic และรอ toast สำเร็จแล้วผ่านทุกขั้น โดยไม่ได้แก้โค้ดแอป
ตรวจต่อพบ hydration race ในชุดทดสอบและเพิ่มการป้องกัน/กู้คืนในแอปแล้ว
fault injection ส่ง PUT ล้มและคำตอบ registration หายหลัง commit ผ่าน ดู [UPLOAD-RECOVERY.md](UPLOAD-RECOVERY.md)
ยังไม่มี trace ของเหตุการณ์แรก จึงไม่อ้างว่าทุก timeout มาจากสาเหตุเดียวกัน

## Cleanup

ใช้ run ID `qa-20261007-payment`; ลบเฉพาะ R2 keys ที่ media/upload_intent ผูกกับ
ออเดอร์และเจ้าของ fixture นี้ ยกเลิก multipart ที่ค้าง แล้วลบ media/intents/sessions
จากนั้น `seed-fixtures clean` ล้างร้าน ผู้ใช้ ออเดอร์และ payment records สำเร็จ
ภาพหลักฐานอยู่ใน temp directory ของระบบ `com-mi-payment-qa`

## รันซ้ำ

ต้องมี Edge และ Playwright test API; ตั้ง PLAYWRIGHT_MODULE เป็น path ของ playwright/test.js
หากติดตั้งอยู่นอก repository และเปิด local app โดยปิดการส่งอีเมลก่อน

```sh
pnpm db:fixtures create qa-payment-01 --target-env .env.local --confirmed-local-test
node --import tsx scripts/check-payment-browser.mts qa-payment-01 --target-env .env.local --confirmed-local-test
pnpm db:fixtures clean qa-payment-01 --target-env .env.local --confirmed-local-test
```

## ยังไม่รับรอง

- การโอนเงินจริง, Stripe/Connect และการหักค่าธรรมเนียมจริง
- retry ระหว่างเครือข่ายล้มเหลว, ไฟล์ใหญ่หลาย part, URL หมดอายุ และ money/action concurrency
- การทดสอบยิง Server Action โดยตรงข้าม UI ทุกบทบาท (รอบนี้ตรวจ UI + DB และใช้ action จริง)
- private r2.dev ปิดหรือไม่ และ lifecycle rules: S3 healthcheck ตรวจสองเรื่องนี้ไม่ได้
- restore DB/storage จาก backup: ยังไม่มีปลายทางกู้คืนแยกและ backup ที่ระบุสำหรับ drill
- OAuth login และ staging isolation

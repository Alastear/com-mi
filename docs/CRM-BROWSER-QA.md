# CRM browser QA — 7 ตุลาคม 2026

ทดสอบ production build บน local port 3450 กับ DB จาก `.env.local` ที่เจ้าของยืนยันว่าใช้ทดสอบ
ใช้ Edge แบบ headless ผ่าน Playwright ที่ติดตั้งไว้แล้ว หลังเครื่องมือ browser ในแอป timeout
ปิด EMAIL_FROM/RESEND_API_KEY ใน process ของ server ไม่มีการส่งอีเมลหรือชำระเงินจริง

## ขอบเขต

- บัญชี fixture สองร้านและบัญชีลูกค้า แยก browser contexts พร้อม signed session จริง
- ผู้ไม่ล็อกอินถูกส่งไป sign-in; CRM planned ยังปิด; non-admin ไม่เห็น rollout controls
- เปลี่ยนสถานะและเพิ่มร้านผ่าน UI/Server Action จริง แล้วตรวจ audit ใน DB
- รายชื่อลูกค้า ค้นหาไม่พบ ประวัติงาน และบันทึกโน้ต/แท็กพร้อมโหลดกลับ
- validation เมื่อใส่ 11 แท็ก; submit ด้วย Enter และ Tab ไปปุ่มบันทึก
- สองแท็บถือ version ต่างกัน: แท็บเก่าบันทึกไม่ได้ ร่างยังอยู่ และโหลดค่าล่าสุดได้
- ร้านอื่นไม่เห็นโน้ตของร้านแรก; บัญชีลูกค้าและ client ID ที่ไม่มีความสัมพันธ์เข้า editor ไม่ได้
- มือถือ 390×844 ภาษาไทยทั้ง light/dark ไม่มี horizontal overflow; desktop ภาษาอังกฤษ
- revoke cohort และ pause กันการบันทึกจาก editor ที่เปิดไว้แล้ว พร้อมคงโน้ตแบบอ่านอย่างเดียว
- ถอด admin role แล้ว session เดิมไม่เห็นหน้าควบคุม
- ตรวจ browser pageerror ตลอดการทดสอบ

ภาพหน้าจอใช้ข้อมูล fixture เท่านั้น ตรวจดู layout ด้วยตาเพิ่มเติมจาก assertions
ผล: ผ่าน 13 กลุ่มทดสอบและไม่พบ browser pageerror; TypeScript และ lint ของสคริปต์ผ่าน
คืนค่าและล้าง fixture `qa-20261007-browser` แล้ว ตรวจซ้ำ user ของชุดนี้, CRM rollout และ audit เหลือ 0
ไม่ครอบคลุม OAuth login, payment ledger หลายรายการ, R2 upload/download, restore drill,
request ที่เริ่มเขียนก่อน pause หรือ load/performance/concurrency จำนวนมาก
ไม่ใช่การรับรอง staging isolation หรือการเปิดฟีเจอร์ทั้งหมดใน COMING-SOON-PLAN

## รันซ้ำ

ต้องใช้ DB ทดสอบที่ยังไม่มี CRM rollout/cohort/audit และสร้าง fixture ใหม่
สคริปต์จะหยุดก่อนแก้ไขหากพบข้อมูล rollout เดิม ใช้ local app URL เท่านั้น
ต้องมี Playwright test API และ Edge ติดตั้งแล้ว; ไม่มีการดาวน์โหลด browser อัตโนมัติ
ตั้ง `PLAYWRIGHT_MODULE` เป็น path ของ `playwright/test.js` หากใช้ installation ภายนอก repo
ตั้ง `CRM_QA_OUTPUT` เป็น directory เก็บ screenshots (ค่าเริ่มต้น directory ชั่วคราวของระบบใต้ `com-mi-crm-qa/<run-id>`)

```sh
pnpm db:fixtures create qa-browser-01 --target-env .env.local --confirmed-local-test
node --import tsx scripts/check-crm-browser.mts qa-browser-01 --target-env .env.local --confirmed-local-test
pnpm db:fixtures clean qa-browser-01 --target-env .env.local --confirmed-local-test
```

สคริปต์คืน rollout, fixture role และ session ใน finally; cleanup ปฏิเสธการลบ rollout
หากมี audit ของผู้อื่นเกิดระหว่างทดสอบ หลังจากนั้นใช้ fixture clean เพื่อล้าง orders/notes/users
การสร้าง session ทดสอบไม่ได้ทดสอบกระบวนการล็อกอิน OAuth ของผู้ใช้

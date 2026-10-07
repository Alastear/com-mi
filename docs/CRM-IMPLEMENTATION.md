# CRM-01 — รายชื่อและประวัติลูกค้า

เริ่ม 5 ตุลาคม 2026 ต่อจาก COMING-SOON-PLAN

## โค้ดที่เพิ่ม

- `/clients`: ค้นหาชื่อ, เรียงตามออเดอร์ล่าสุด, แบ่งหน้าละ 20 คน และ empty state
- `/clients/[id]`: ประวัติงานเฉพาะร้านพร้อมลิงก์ออเดอร์ แบ่งหน้าละ 20 งาน
- ยอดรับจาก payment_record ที่ verified และไม่ rejected/voided; นับแยกต่อออเดอร์ก่อนรวม
  เพื่อไม่ให้หลาย payment ทำให้จำนวนงานเพิ่มซ้ำ สรุปหน้ารายชื่อเฉพาะ THB ตามข้อความที่แสดง
- หน้าประวัติแสดงสกุลเงินของแต่ละออเดอร์ ไม่รวมสกุลเงินเข้าด้วยกัน
- จำกัดข้อมูลด้วยร้านที่อ่านจาก session และตรวจ capability ก่อน query ทุกครั้ง
  detail ตรวจความสัมพันธ์ร้าน/ลูกค้าก่อนอ่านชื่อ ไม่ส่ง email, payment target หรือ private note
- สถานะ loading/error/retry และข้อความ TH/EN; URL ค้นหาจำกัดความยาวและ escape wildcard
- นำ MOCK_CLIENTS ออกจากหน้า ไม่แสดงข้อมูลสมมติเป็นลูกค้าของผู้ใช้

## สถานะเปิดใช้งาน

ยังคง `crm` เป็น `implemented: true / planned` โดยไม่มี rollout record จะไม่เปิดใช้งาน
เพิ่ม private notes/tags และ private rollout store แล้ว แต่ยังขาดหลักฐาน UI QA ครบ
หน้า clients จึงอธิบายว่ายังไม่เปิด และเชื่อมกลับออเดอร์; เข้าหน้า detail ตรงไม่ได้
ไม่มี role bypass หรือ env switch สำหรับเปิดข้อมูลโดยข้าม guard

## ตรวจแล้วและยังค้าง

- Tests ของ filter/pagination ผ่าน รวมอักขระไทย, wildcard, page ผิดรูป และขอบเขต offset
- PostgreSQL EXPLAIN ผ่านทั้ง list/history กับ schema ที่กำหนดใน env โดยใช้ ID สมมติ
  ไม่ใช้ ANALYZE, ไม่ execute อ่านลูกค้าหรือเปลี่ยนข้อมูล จึงไม่ใช่หลักฐาน performance หรือ isolation
- เพิ่มเคส query จริงใน `db:fixtures-check` สำหรับ fixture สองร้าน/สองลูกค้า
  รันผ่านกับ DB ทดสอบจาก `.env.local` เมื่อ 7 ตุลาคม 2026 ตามการยืนยันของเจ้าของระบบ
- เคสหลาย payment/void/reject และแยก currency ผ่านกับ ledger จำลองบน local test DB ดู PAYMENT-FILE-QA.md; ยังไม่ได้ทดสอบการโอนเงินจริง
- ต้องตรวจ query plan ด้วยข้อมูลขนาดเหมาะสมก่อนตัดสินใจเพิ่ม index; ใช้ index เดิมก่อน
- UI QA สองร้าน/บัญชีลูกค้า มือถือ light/dark TH/EN คีย์บอร์ด stale-tab และ pause/revoke ผ่านบน local test DB เมื่อ 7 ตุลาคม 2026 ดู [CRM-BROWSER-QA.md](CRM-BROWSER-QA.md)

## CRM-02 — โน้ตและแท็ก

- เพิ่มตาราง `client_profile` ด้วย migration `0028_shiny_scrambler` (apply บน DB ทดสอบแล้ว)
- primary key คู่ร้าน/ลูกค้า ทำให้ลูกค้าคนเดียวมีโน้ตของแต่ละร้านแยกกัน
- โน้ตสูงสุด 4,000 ตัวอักษร แท็กสูงสุด 10 รายการ รายการละ 30 ตัวอักษร ตัดแท็กซ้ำ
- ตรวจ owner/capability และความสัมพันธ์จากออเดอร์ก่อนบันทึก ไม่รับ shop ID จาก client
- optimistic version ป้องกันแท็บเก่าเขียนทับ เมื่อชนกันให้คัดลอกร่างก่อนโหลดข้อมูลล่าสุด
- อ่านข้อมูลเดิมได้เมื่อ pause/downgrade ตาม policy; การแก้ไขยังต้องผ่าน full capability gate
- แสดงแท็กในรายชื่อลูกค้า ไม่มีโน้ต/แท็กใน query หน้าร้านหรือ payload ฝั่งลูกค้า
- เพิ่ม staging checks โดยใช้ SQL builder เดียวกับ action: insert, stale update, update ปกติ,
  ข้ามร้าน, ลูกค้าคนเดียวต่างร้าน และตรวจ rollback ของทั้ง note/probe
- Tests CRM/capability ผ่าน 16 ข้อ; build ผ่านหลังล้าง `.next` ที่ Windows ลบไม่ได้

ต้อง apply migration 0028 บน staging ก่อนใช้ fixture/check รุ่นนี้
รัน migrations 0028–0029 และ SQL mutation tests กับ DB ทดสอบจริงแล้วเมื่อ 7 ตุลาคม 2026:
ownership ข้ามร้าน, version เก่า, query จำนวนงาน และ transaction rollback ผ่าน
fixture `qa-20261007-crm` ถูกล้างแล้ว ตรวจซ้ำไม่เหลือ user/shop/order ของชุดนี้
ยังไม่ปลดป้ายเร็ว ๆ นี้; UI QA และ payment ledger matrix แบบจำลองผ่านตามรายงานแล้ว ส่วน staging isolation ยังไม่ผ่านการตรวจรับ

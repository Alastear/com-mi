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

ยังคง `crm` เป็น `implemented: false / planned` เพราะเป็นส่วน list/detail ของ CRM
ยังไม่มี private notes/tags, private rollout store และหลักฐาน staging QA ครบ
หน้า clients จึงอธิบายว่ายังไม่เปิด และเชื่อมกลับออเดอร์; เข้าหน้า detail ตรงไม่ได้
ไม่มี role bypass หรือ env switch สำหรับเปิดข้อมูลโดยข้าม guard

## ตรวจแล้วและยังค้าง

- Tests ของ filter/pagination ผ่าน รวมอักขระไทย, wildcard, page ผิดรูป และขอบเขต offset
- PostgreSQL EXPLAIN ผ่านทั้ง list/history กับ schema ที่กำหนดใน env โดยใช้ ID สมมติ
  ไม่ใช้ ANALYZE, ไม่ execute อ่านลูกค้าหรือเปลี่ยนข้อมูล จึงไม่ใช่หลักฐาน performance หรือ isolation
- เพิ่มเคส query จริงใน `db:fixtures-check` สำหรับ fixture สองร้าน/สองลูกค้า
  ยังไม่ได้รันเพราะ staging ยังไม่พร้อม
- ต้องเพิ่มเคสเงินจริงหลาย payment/void/reject และตรวจยอดกับ ledger บน staging
- ต้องตรวจ query plan ด้วยข้อมูลขนาดเหมาะสมก่อนตัดสินใจเพิ่ม index; ใช้ index เดิมก่อน
- ยังต้อง UI QA สองบัญชี/มือถือ/ธีม/คีย์บอร์ด, CRM-02 notes/tags และ FND-03 rollout

ชุดนี้ไม่มี migration และยังไม่ปลดป้ายเร็ว ๆ นี้

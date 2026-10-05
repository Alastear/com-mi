# FND tooling — เตรียมส่งขึ้น main

วันที่ 5 ตุลาคม 2026

## ขอบเขตชุดนี้

- Preflight ที่บังคับระบุไฟล์ target/baseline ก่อน seed/reset/cleanup ไม่มี env fallback
- Fixture สองร้าน/สองลูกค้า TH/EN ออเดอร์แปดรายการ พร้อม manifest ตาม run ID
- Transactional create/clean, ตรวจ ownership/ข้อมูลนอกชุด/ไฟล์ก่อน cleanup และกำหนด lock timeout
- คำสั่งตรวจ PostgreSQL rollback และ context query เดียวกับ capability guard
- คู่มือ staging และปรับ backlog ให้ตรงกับสิ่งที่ทำแล้ว

## ผลตรวจในเครื่อง

- [x] ชุด unit/regression tests ทั้งหมดผ่าน
- [x] TypeScript ผ่าน
- [x] Production build ผ่านหลังแยก context loader
- [x] CLI ที่ไม่ระบุ env หยุดก่อนสร้าง DB client
- [x] ไม่มี migration ใหม่และไม่มีคำสั่ง seed รันจาก build/deploy
- [x] ไม่เปลี่ยนสถานะ capability planned หรือเปิดฟีเจอร์ให้ผู้ใช้จริง

## เงื่อนไขที่ยังไม่ผ่าน

- [ ] Staging target และ production baseline ที่ตรวจ isolation ผ่าน
- [ ] รัน create → check → clean บน staging รวม retry และ concurrency
- [ ] Session/browser QA สองบัญชี รวม permission ของไฟล์และ money flow
- [ ] Restore DB/storage drill และผลตรวจ resource permissions

มีเพียง `.env.local` ณ รอบเตรียมนี้ จึงยังไม่ได้เขียน/ล้าง fixture ลง DB จริง
ชุดโค้ดนี้เตรียมสำหรับ deploy เครื่องมือพื้นฐานได้ แต่ยังไม่ปิด FND-01,
FND-02 integration หรือเปิด rollout ของฟีเจอร์ใน COMING-SOON-PLAN

## การส่งขึ้นและถอยกลับ

main เชื่อมกับ Vercel และ push จะกระตุ้น deployment อัตโนมัติ
โค้ด app เปลี่ยนเฉพาะการแยก context query โดยยังอ่าน user ID จาก server session
และตรวจ owner/plan/suspension/cohort เช่นเดิม สคริปต์ทำงานเมื่อเรียกเองเท่านั้น
หากต้องย้อนโค้ด ให้ revert commit ของชุดนี้โดยไม่ลบ fixture หรือแก้ schema
การย้อนสคริปต์จะถอด preflight ออก จึงห้ามใช้ seed/reset รุ่นเก่ากับ production

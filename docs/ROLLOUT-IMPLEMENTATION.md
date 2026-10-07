# FND-03 — CRM rollout

ปรับปรุง 7 ตุลาคม 2026

## โค้ดที่พร้อมตรวจ

- `/admin/rollouts` ตรวจ admin ทั้งหน้าและ Server Action; หน้า admin หลักมีลิงก์และรหัสร้านให้ค้นหา
- สถานะ CRM ทั้งระบบ: internal / beta / paused; ไม่มีปุ่ม live หรือย้อนเป็น planned
- สมาชิกต่อร้าน: internal / beta / revoked เก็บในตารางส่วนตัว ไม่ส่งออกหน้าสาธารณะ
- ทุก mutation ต้องมีเหตุผลและ version ปัจจุบัน; role admin ถูกอ่านซ้ำใน SQL
- เปลี่ยนค่าและ append audit ใน SQL statement เดียว เก็บ actor, before, after, reason และเวลา
  conflict ไม่เปลี่ยนค่าและไม่เพิ่ม audit ไม่มี action แก้ไขหรือลบ audit
- อ่านสถานะและ membership ใหม่จาก DB ทุกครั้ง ไม่ใช้ session เป็นแหล่งสิทธิ์แพ็กเกจ/cohort
- internal ใช้แก้ไขได้เฉพาะ APP_ENV staging/development และสมาชิก internal
- beta เปิดการแก้ไขเฉพาะสมาชิกที่อนุญาต; production ไม่ใช้ internal membership เป็นทางลัด
- paused/revoked หยุดการแก้ไข ข้อมูลเดิมของร้านยังอ่านได้ตาม policy
  หากเปลี่ยน global เป็น internal บน production จะทำงานเป็น paused เพื่อไม่ซ่อนข้อมูลเก่า
- ไม่มีการเพิ่มสมาชิกหรือเปิดสถานะในฐานข้อมูลจริงในรอบนี้

## ความหมาย registry

CRM เป็น `implemented: true / planned` เพื่อให้ server ใช้โค้ดจริงเมื่อ rollout อนุญาต
ไม่มี rollout record = ไม่เปิดใช้งาน การตั้งค่า DB ไม่ปลดฟีเจอร์ที่ implemented=false
public registry ยัง planned จึงคงป้ายเร็ว ๆ นี้สำหรับคนทั่วไป การเปิด live ต้องเป็น code release
ที่ตรวจข้อความ pricing/nav/settings พร้อมกัน ไม่ใช่ปุ่ม admin

## Migration และการตรวจรับ

ต้อง apply 0028 (client_profile) และ 0029 (rollout/cohort/audit) ก่อน deploy โค้ดชุดนี้
ยังไม่ได้ apply เพราะไม่มี staging ที่ผ่าน isolation preflight
ห้าม push แล้วคาดว่าตารางจะถูกสร้างอัตโนมัติจาก build

Tests CRM/capability 20 ข้อผ่าน และ full unit/regression suite ผ่าน
ยังต้องพิสูจน์ SQL mutation + audit atomicity, stale admin tab, role revocation,
pause ขณะมี request ค้าง, two-shop isolation และ UI บน staging ก่อนเปิด beta
การ pause ไม่ยกเลิก request ที่ตรวจสิทธิ์ผ่านไปแล้วและกำลังเขียนอยู่ ต้องตรวจเคสนี้ใน QA
ยังไม่ถือว่า FND-01/03 หรือ closed beta ผ่านการตรวจรับครบ

ขั้นตอนทดลอง: เตรียม staging → migrations → fixture → grant internal ให้ร้าน fixture
→ เปลี่ยน global เป็น internal → ทดสอบ CRM → ทดสอบ pause/revoke/downgrade
พร้อมเก็บหลักฐานตาม [STAGING-SETUP.md](STAGING-SETUP.md)

Rollback: ตั้ง paused ก่อนถอยโค้ด; เก็บตารางและ audit ไว้ ไม่ drop/ลบข้อมูล

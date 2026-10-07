# FND — ผลเริ่ม implementation และวิธีทำงานต่อ

อัปเดต 7 ตุลาคม 2026: เพิ่ม FND-03 private store, admin controls และ audit แล้ว
ดู [สถานะ rollout ล่าสุด](ROLLOUT-IMPLEMENTATION.md) โค้ด CRM เป็น implemented=true/planned
แต่ยังไม่มีการเปิดใช้จริง ส่วนรายละเอียดรอบแรกด้านล่างเป็นประวัติก่อนการเปลี่ยนแปลงนี้

## เพิ่มคำสั่ง integration check — 5 ตุลาคม 2026

`pnpm db:fixtures-check <run-id> --target-env .env.staging.local --production-env .env.production.audit.local`
พร้อมรันหลัง staging ผ่าน preflight และสร้าง fixture แล้ว ดู [คู่มือตั้งค่า](STAGING-SETUP.md)
ตรวจ context query เดียวกับ server guard, owner/cross-shop/planned gate, order ownership
และ rollback ของ neon-http transaction เมื่อเกิด unique constraint failure
ยังไม่ได้รันคำสั่งนี้กับ PostgreSQL จริง จึงยังไม่ถือว่าผ่าน integration
Tests ของ capability/environment ผ่าน 26 ข้อ; TypeScript และ lint ผ่าน
เพิ่มการตรวจ child record ID, ไฟล์ที่ผูกกับออเดอร์ และข้อความนอกชุดก่อน cleanup
เพื่อหยุดเมื่อการล้างอาจกระทบข้อมูลนอก manifest

ปรับปรุง 4 ตุลาคม 2026 · ต่อจาก [COMING-SOON-PLAN.md](COMING-SOON-PLAN.md)

## ส่งมอบรอบแรก

- **FND-02: โครงกลางและ unit tests เสร็จ; รอ integration บน staging** มี registry 13 ขอบเขต และสถานะ `planned / internal / beta / live / paused` แยก `implemented` ออกจากสถานะและสิทธิ์แพ็กเกจ เปลี่ยนสถานะอย่างเดียวเปิดของที่ยังไม่มีไม่ได้
- เมนู desktop/mobile, ตารางราคา 11 แถว, ข้อดี Pro, Settings, For creators และหน้า preview ใช้ mapping เดียวกัน ป้ายรองรับไทย/อังกฤษ; internal ไม่เปิดเผยรายชื่อผู้ทดสอบ
- Server guard สำหรับฟีเจอร์ใหม่อ่านเจ้าของร้าน แพ็กเกจ วันหมดอายุ และ suspension จากฐานข้อมูลใหม่ทุกครั้ง ใช้เฉพาะ user ID จาก session และไม่ให้แพ็กเกจหรือสิทธิ์ admin ข้าม ownership
- มี policy เก็บทางอ่านข้อมูลเดิมของเจ้าของหลัง pause/downgrade/cohort removal ขณะที่การสร้างใหม่ยังต้องผ่านทุกด่าน
- **FND-01: มีเครื่องมือตรวจ config แล้ว แต่ staging ยังไม่ผ่าน** ไม่มีการสร้าง fixture, migrate, เขียน DB หรือเปลี่ยน secret จริงในรอบนี้
- **FND-03: ยังไม่เสร็จ** ยังไม่มี private cohort store, หน้าจัดการ rollout, audit การเปลี่ยนสถานะ หรือ emergency switch ที่เปลี่ยนได้โดยไม่ deploy

ทั้ง 13 ฟีเจอร์ยังเป็น `implemented: false / planned` เหมือนเดิม ไม่ได้เปิด CRM, analytics, ประมูล หรือฟีเจอร์อื่นจากงานรอบนี้ ส่วนระบบรับงาน/มัดจำ/ส่งไฟล์เดิมคงใช้ guard เดิม ไม่มีการอ้างว่าทดสอบธุรกรรมจริงครบแล้ว

## โครงสร้างและขอบเขตของด่านตรวจสิทธิ์

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/capabilities/registry.ts` | metadata ที่เปิดเผยได้ และ mapping ของจุดแสดงผล ไม่มี user ID หรือ secret |
| `lib/capabilities/policy.ts` | กติกาที่ทดสอบได้โดยไม่ต่อ DB แยก release, cohort, package, ownership และ suspension |
| `lib/capabilities/authorize.ts` | บังคับผล policy; ปฏิเสธด้วย error code ก่อน caller ทำงาน |
| `lib/capabilities/server.ts` | `server-only` wrapper อ่าน session และสิทธิ์ปัจจุบันจาก DB |
| `lib/environment/beta-readiness.ts` | ตรวจ config แบบ offline; ไม่ติดต่อบริการและไม่ส่งค่าของ secret กลับมา |

เรียก `requireCapability("crm", creatorPageId)` ภายในทุก query/action ของ CRM ที่จะทำต่อ ก่อนอ่านข้อมูลเฉพาะฟีเจอร์หรือเขียนข้อมูล แล้วจำกัด SQL ด้วย `creatorPageId` ที่คืนมาด้วยเสมอ การผ่าน guard ไม่ใช่สิทธิ์อ่าน resource ID ของร้านอื่น และไม่แทน quota, state transition, upload ACL หรือเงื่อนไขใน SQL ที่ป้องกันการแข่งขันพร้อมกัน

ข้อกำหนดตอนนำไปใช้:

1. `can()` ใน billing ตรวจแค่แพ็กเกจ ไม่ใช่ด่านอนุญาตฟีเจอร์; ห้ามใช้แทน `requireCapability()`
2. `read_existing` ใช้กับ record เดิมที่ผูกกับร้านเท่านั้น ไม่ใช้กับสร้าง export/report, ส่งข้อความ, ออก upload URL หรือ endpoint ที่มี side effect ต้องตรวจสิทธิ์ resource เพิ่มด้วย
3. suspended user/shop ถูกปฏิเสธแม้เป็นการอ่านเดิม; การเรียกจากฝั่งลูกค้าต้องมี participant/order guard ของตัวเอง wrapper รอบนี้เป็น **creator scope**
4. หมดอายุแพ็กเกจจะนับเป็น Free ก่อนนำ `BETA_FREE_PRO` มาคิด; สิทธิ์ beta ไม่ข้าม planned หรือ cohort
5. ค่า cohort ฝั่ง server เป็น `false` ทั้งคู่จนกว่า FND-03 เสร็จ ไม่มี env override ให้แอบเปิดฟีเจอร์ และไม่มี endpoint ให้ client ส่ง cohort หรือ plan มาเอง
6. เปลี่ยน `implemented/status` ได้ผ่าน code review และ deploy เท่านั้นในรอบนี้; กรณี paused อ่านเดิมได้ตาม policy แต่ยังไม่มีฟีเจอร์จริงให้นำไป pause การเปลี่ยนสถานะจากหน้าผู้ดูแลต้องรอ audit store
7. หน้า LockedFeature ยังครอบภาพจำลองเสมอ แม้มีคนเปลี่ยน flag; ต้องแทนด้วย UI/query จริงที่ตรวจสิทธิ์แล้วก่อน release
8. เริ่ม THM/BRF ต้องแยกสิทธิ์ preset ฟรีออกจาก custom editor ของ Pro พร้อมทดสอบทั้งสองฝั่ง; registry รอบนี้ระบุ entitlement ของ **ส่วนปรับแต่งขั้นสูง** ตาม billing เดิม ส่วน REF/LST ไม่มี paid gate แต่ยังต้องมี quota/ACL ตอนสร้างจริง
9. ก่อน live ต้องตรวจข้อความของ bundle ด้วย เช่น การ์ด Pro “สถิติ + CRM” ต้องรอทั้งสองอย่าง และแถวราคา “สถิติและ export” ต้องรอ analytics กับ CSV คนละ mapping กัน

## ตรวจความพร้อมของ staging

ใช้ไฟล์ target ที่มีค่าครบในตัวเองและไฟล์ production baseline ที่เจ้าของระบบยืนยันแหล่งที่มาแล้ว เก็บทั้งสองไฟล์นอก git; ตัวอย่างนี้เป็นชื่อไฟล์ ไม่ใช่ค่าจริง:

```sh
pnpm beta:check .env.staging.local .env.production.audit.local
```

target ต้องระบุ `APP_ENV=staging` (หรือ `development` สำหรับ localhost), `SITE_NOINDEX=1`, URL auth/app ตรงกัน, DB แยก host/branch, R2 สอง bucket/สองชุด credential ที่แยกจาก production, auth secret และ cron secret แยกด้วย baseline ต้องระบุ `APP_ENV=production` ห้ามตั้ง label นี้ให้ไฟล์ที่ไม่ทราบแหล่งที่มาเพียงเพื่อให้ตรวจผ่าน

สคริปต์ไม่รวมค่า fallback จาก `.env.local` หรือ environment ของ shell เพราะอาจเติม resource ของ production ลงใน config ทดสอบโดยไม่รู้ตัว มอง Neon แบบ pooled/direct ที่ host เดียวกันว่าไม่แยก แม้ credentials หรือชื่อ database ต่างกัน ตรวจ bucket/keys ทั้งสองฝั่งเพื่อจับการสลับ public/private ด้วย

ยังไม่มีระบบดักอีเมลทดสอบ จึงให้ `EMAIL_FROM` ว่างใน staging รอบนี้; งาน OTP/email integration ต้องรอ sink หรือข้อจำกัด recipient ที่ทดสอบได้ก่อน ไม่ให้ส่งไปหาลูกค้าจริงโดยไม่ตั้งใจ

เครื่องมือนี้เป็น preflight แบบเรียกเอง; ตั้งแต่ 5 ตุลาคม 2026 สคริปต์ seed-session,
seed-orders, seed-demo และ reset-creator บังคับใช้ preflight เดียวกันก่อนสร้าง DB client
รวม `--clean` และการรันไฟล์โดยตรงด้วย โดยไม่อ่าน fallback จาก shell หรือ `.env.local`
คำสั่ง migrate, storage migration และ admin ยังเป็นเครื่องมือดูแลระบบแยกต่างหาก
ไม่ได้ครอบด้วย guard นี้ และไม่ควรถือว่าผ่าน staging โดยอัตโนมัติ

```sh
pnpm db:seed-session --target-env .env.staging.local --production-env .env.production.audit.local
pnpm db:seed-orders --target-env .env.staging.local --production-env .env.production.audit.local
pnpm db:clean-session --target-env .env.staging.local --production-env .env.production.audit.local
```

seed-orders เลือกเฉพาะร้าน demo ของ `e2e_user_0001`, client `e2e_user_0002`
และ service ของร้านนั้น; cleanup จำกัด ID ชุดเดิมและเจ้าของ ไม่ลบด้วย email wildcard
เพิ่ม `db:fixtures` แบบ run ID แล้ว มี creator 2/client 2, ภาษา TH/EN, service 2,
order 8 ในสถานะ requested/accepted/in_progress/in_review พร้อมข้อความยาวและรายการราคา
ยอดรับเงินทุกงานเป็นศูนย์ ไม่มี payment ปลอม ร้านเป็น demo และไม่เผยแพร่
ไม่สร้าง session, ไม่ส่งข้อความภายนอก และยังไม่มีไฟล์จริงใน R2

```sh
pnpm db:fixtures create qa-run-01 --target-env .env.staging.local --production-env .env.production.audit.local
pnpm db:fixtures manifest qa-run-01 --target-env .env.staging.local --production-env .env.production.audit.local
pnpm db:fixtures clean qa-run-01 --target-env .env.staging.local --production-env .env.production.audit.local
```

manifest แสดงรายการ ID และรหัสออเดอร์แบบ deterministic โดยไม่มี token/secret
ใช้ run ID เดิมเพื่อรันซ้ำโดยไม่ reset สถานะที่ผู้ทดสอบแก้ไปแล้ว; ใช้ run ID ใหม่เพื่อสร้างชุดใหม่
create/clean อยู่ใน transaction และตรวจ ownership ก่อนเขียน ใช้ table locks บน staging
เพื่อไม่ให้ข้อมูลเปลี่ยนระหว่างตรวจ จึงควรรันช่วงที่ไม่มีการทดสอบอื่นกำลังเขียนข้อมูล
cleanup ใช้ ID ตรงจาก manifest และปฏิเสธเมื่อพบร้าน/service/order เพิ่มนอกชุดหรือ media/upload intent
ต้องจัดการไฟล์ตาม lifecycle ก่อนล้างบัญชี เพื่อไม่ทิ้ง object ใน storage

Tests offline ผ่าน 15 ข้อ, lint และ TypeScript ผ่าน; ทดสอบ CLI ที่ไม่ระบุ env แล้วหยุดก่อนเชื่อม DB
ยังไม่ได้พิสูจน์ transaction/rollback/concurrency บน PostgreSQL หรือรัน seed/reset จริง
เพราะยังไม่มีหลักฐาน staging isolation งานต่อไปคือ integration ดังกล่าว ตามด้วย session
สำหรับ QA สองบัญชีและไฟล์จำลองผ่าน upload lifecycle จริง

### ผลตรวจเครื่องที่ใช้พัฒนาในรอบนี้

`pnpm beta:check` ที่อ่านเฉพาะ `.env.development.local`: **ผ่าน 6/32 ข้อ และจบด้วย exit code 1 ตามที่ควรเป็น** รายงานไม่มีค่า secret

- target ขาด R2 config ในตัวเอง ขณะที่การรัน dev ปกติสามารถหยิบค่าจาก `.env.local`
- ยังไม่มี `APP_ENV` / `SITE_NOINDEX` ใน target และยังไม่ผ่านเกณฑ์ URL ที่กำหนด
- เปิด email sender อยู่ ยังไม่ใช่สภาพแวดล้อมที่ปิด outbound email สำหรับ fixture
- ไม่ได้ให้ production baseline ที่ยืนยันแล้ว จึงยังสรุปไม่ได้ว่า DB/secret/buckets แยกจริง

ผ่าน config ทุกข้อก็ **ยังไม่ใช่การรับรองพร้อม beta** ต้องพิสูจน์ resource permission, OAuth callback, restore DB/ไฟล์, cron, การแยกข้อมูลระหว่างร้าน และงานรับเงิน/ส่งไฟล์ต่อไป

## การตรวจรอบนี้

- ชุดทดสอบ 499 ข้อผ่าน รวมเพิ่ม 18 ข้อสำหรับ policy, authorization wrapper, mapping และ staging preflight
- Unit tests ครอบ planned แม้ beta Pro, status ถูกเปลี่ยนแต่ implementation ยังไม่มี, internal/beta membership, ข้ามร้าน, suspension, วันหมดอายุแพ็กเกจ, unknown plan, pause/downgrade/read-existing และ config ที่ใช้ production ซ้ำ
- Authorization wrapper ทดสอบด้วย context loader จำลอง ไม่ใช่ DB integration หรือ authenticated browser E2E; ต้องมี staging จึงพิสูจน์ SQL กับข้อมูลสองร้านจริงได้
- Lint, typecheck และ production build (webpack) ผ่าน; typecheck กับ build ต้องรันแยกกันเพราะทั้งคู่จัดการ `.next/types`
- Browser smoke test `/pricing` และ `/for-creators` ภาษา TH/EN ที่ 320, 768, 1920 px: ไม่พบ horizontal overflow, ราคาแสดงป้าย 11 แถวครบ, หน้าแนะนำแสดง 3 ป้ายครบ และไม่พบ console error/warning
- รอบนี้ไม่ทดสอบหลังล็อกอินด้วย session จำลอง เพราะ staging ยังไม่แยกยืนยัน; Settings/nav/preview ผ่าน compile และ mapping tests แต่ยังไม่ใช่ authenticated browser test

## งานถัดไปตามลำดับ

1. **FND-01:** ยืนยัน target/baseline, แยก resource และ email sink, จากนั้นสร้าง creator 2 / client 2 และบันทึก restore drill พร้อมเวลาที่ใช้จริง
2. **FND-03:** private rollout/cohort store + audit append-only + kill switch + ข้อตกลง read-only/downgrade รายฟีเจอร์ โดยไม่ส่ง allowlist ออก client
3. **REL-01:** ทดลอง event/outbox ที่ commit พร้อมการเปลี่ยนงาน และทดสอบ crash/concurrency บน staging ก่อนนำไปต่อ Discord
4. **CRM-01:** เปลี่ยนหน้า preview เป็นรายชื่อลูกค้าจริง ตรวจ ownership ใน query มี pagination และเปิดเฉพาะ cohort หลังผ่าน staging

ข้อ 1 เป็นเงื่อนไขก่อน seed/migration/integration tests และก่อนเปิด capability บน production ส่วน pure policy และเอกสารทำแยกก่อนได้โดยไม่มีผลกับข้อมูลจริง

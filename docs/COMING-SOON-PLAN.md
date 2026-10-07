# แผนพัฒนาฟีเจอร์ “เร็ว ๆ นี้” ของ com-mi

จัดทำ: 4 ตุลาคม 2026 · ตรวจจาก source ณ commit `0ddb97e`
สถานะ: **เริ่ม FND แล้ว — ยังไม่ได้เปิดใช้ฟีเจอร์ทั้ง 13 ขอบเขต**

ความคืบหน้า: [ผล implementation รอบพื้นฐาน](FOUNDATION-IMPLEMENTATION.md) — registry/UI mapping และ server guard พร้อม unit tests; FND-01 ยังไม่ผ่าน staging และ FND-03 มี private rollout store/admin/audit แล้ว รอ staging QA (ดู ROLLOUT-IMPLEMENTATION.md)

### เตรียมเริ่มงาน — ตรวจซ้ำ 5 ตุลาคม 2026

ฐานโค้ดล่าสุด `91171de` เพิ่มไฟล์ตัวอย่างมีลายน้ำ การอนุมัติตัวอย่างก่อนรับเงินงวดสุดท้าย
ช่องทางแจ้งโอนธนาคาร/Wallet และกระดิ่งร่วมหน้าแรกแล้ว รายละเอียดใน
[ผลแก้ไขการใช้งาน](latest-usage-fixes.md) งานเหล่านี้ไม่ถือว่า REL หรือ milestone เสร็จ
เพราะ `notify()` ยังเป็น best effort และยังไม่มี outbox/worker ที่กู้การส่งค้างได้

**งานแรกที่หยิบทำ: FND-01 — fixture runner ที่บังคับตรวจสภาพแวดล้อมก่อนเชื่อมต่อ**
ความคืบหน้า 5 ตุลาคม: เพิ่ม `loadFixtureEnvironment` และครอบ seed/reset เดิมแล้ว
รวม cleanup; tests ป้องกัน missing config, production/shared resources และ secret leakage ผ่าน
เพิ่ม fixture runner แบบ run ID แล้วสำหรับสองร้าน/สองลูกค้าและออเดอร์ 8 รายการ
พร้อม manifest/create/clean; ยังไม่ผ่าน PostgreSQL integration และยังไม่มี session/ไฟล์จำลอง
เตรียม `db:fixtures-check` สำหรับ owner isolation และ transaction rollback แล้ว
พร้อม [ขั้นตอนตั้งค่า staging](STAGING-SETUP.md); ยังไม่รายงานว่า DB tests ผ่านจนกว่าจะรันจริง
เริ่ม CRM-01 list/detail จากออเดอร์จริงแล้ว พร้อม search/pagination และ owner/capability guard
เพิ่ม CRM-02 โน้ต/แท็กส่วนตัวและ optimistic version พร้อม migration 0028 แล้ว
ดู [CRM-IMPLEMENTATION.md](CRM-IMPLEMENTATION.md); ยังไม่เปิดใช้งานจริงเพราะรอ staging QA; FND-03 มีโค้ด rollout แล้ว
ทำทีละชุดตามลำดับนี้ โดยคงทั้ง 13 capability เป็น planned จนผ่านเกณฑ์ของแต่ละฟีเจอร์:

| ลำดับ | ชุดงานที่เริ่มได้ | ผลส่งมอบ / เกณฑ์จบ |
|---|---|---|
| 1 | FND-01: แยก preflight สำหรับ fixture และตรวจสคริปต์ seed เดิม | ต้องระบุ target และ production baseline ชัดเจน; ไม่มี fallback env; ถ้าไม่ผ่านต้องหยุดก่อนสร้าง DB client; ทดสอบ missing config, resource ซ้ำ และ target production |
| 2 | FND-01: fixture แบบรันซ้ำและล้างเฉพาะชุดได้ | creator 2 / client 2, ร้าน demo, TH/EN, งานหลายสถานะ; มี run ID และรายการ ID ที่สร้าง; ไม่ลบด้วย email wildcard; ไม่ส่งอีเมลหรือ notification ภายนอก |
| 3 | FND-01/02: staging integration และแกนงานเดิม | พิสูจน์สิทธิ์ข้ามร้าน, เงิน/ไฟล์, preview ใหม่ล้าง approval, payment retry และ unread; บันทึกผล restore DB/ไฟล์ก่อนปิด FND-01 |
| 4 | FND-03: private rollout store | spec → additive schema → server loader → admin mutation/audit; ทดสอบ cohort removal, pause, downgrade และ stale tab; ไม่ส่ง cohort list ออก client |
| 5 | REL-01: atomic event/outbox prototype | เขียน state และ event ใน transaction เดียวบน neon-http; พิสูจน์ rollback, duplicate key และ concurrent write บน staging ก่อนย้าย action จริง |
| 6 | REL-02/03 → DSC; CRM → ANL/EXP | เริ่มตาม dependency และเกณฑ์ตรวจรับเดิม ไม่เปิดหลายงานใหญ่พร้อมกัน |

**สถานะสภาพแวดล้อมที่ตรวจได้:** `node --import tsx scripts/check-beta-readiness.mts .env.local`
ผ่าน 16/32 ข้อ (offline, exit 1 ตามที่ควรเป็น) มี DB/R2/auth config แต่ยังขาดการระบุ
non-production, noindex, origin ที่ผ่านเงื่อนไข และการปิด outbound email; ยังไม่มี
production baseline ที่ยืนยันเพื่อเทียบ DB/secret/bucket จึงยังพิสูจน์ isolation ไม่ได้
ผลนี้ไม่ได้แปลว่าค่า production ผิด แต่แปลว่าไฟล์นี้ยังใช้รับรอง staging ไม่ได้

DB ที่ผู้ใช้เพิ่มให้เชื่อมต่อและรัน migrations 0026–0027 แล้ว แต่การเชื่อมต่อสำเร็จ
ไม่ใช่หลักฐานว่าเป็น staging และไม่ควร seed ข้อมูลจำลองลงเป้าหมายนี้จนกว่าจะตรวจแยกได้
ยังไม่ได้สร้าง fixture หรือรัน integration สองบัญชีในรอบเตรียมงานนี้

สิ่งที่ต้องเตรียมก่อนข้อ 2–3: `.env.staging.local` ที่ครบในตัวเอง และ
`.env.production.audit.local` ที่เจ้าของยืนยันว่าเป็น baseline จริง โดยเก็บนอก Git
ตาม [เงื่อนไข staging](FOUNDATION-IMPLEMENTATION.md#ตรวจความพร้อมของ-staging)
จากนั้นรัน `pnpm beta:check .env.staging.local .env.production.audit.local`
และตรวจ permission/restore ของ resource จริง การเขียน preflight, pure tests และ spec
เริ่มได้ก่อนมี credentials เหล่านี้ ส่วน worker cadence/งบค่อยตัดสินก่อนเปิด sender ภายนอก

การตรวจรับแต่ละชุด: unit tests ตาม invariant, lint/typecheck/build และ staging tests
เมื่อมี DB/ไฟล์เกี่ยวข้อง พร้อมระบุเคสที่ยังไม่ทดสอบ ทุก push เข้า main จะกระตุ้น Vercel
จึงต้องให้โค้ดที่ยังไม่พร้อมอยู่หลัง server capability guard และไม่เอาป้าย soon ออกล่วงหน้า

แผนนี้ต่อจาก [แผน Beta และเตรียมขาย](../PLAN.md) และ [แผน UI / responsive](HOMEPAGE-ART-DIRECTION.md) ใช้แทนลำดับเก่าใน [roadmap เดิม](05-roadmap.md) เฉพาะฟีเจอร์ที่ระบุด้านล่าง วันที่และระยะเวลาเป็นประมาณการเพื่อจัดคิว ไม่ใช่กำหนดส่งที่ประกาศกับผู้ใช้

## 1. ข้อเสนอหลัก

เริ่มจาก **ระบบแจ้งเตือนที่ส่งซ้ำได้เมื่อผิดพลาด → Discord → ลูกค้า → สถิติจากงานจริง** เพราะช่วยให้ครีเอเตอร์ทำงานประจำวันได้ดีขึ้น และต่อยอดข้อมูลที่ระบบมีแล้ว จากนั้นทำธีม/ฟอร์ม/Push/คิวรอ ส่วนขาย Adopts แบบราคาคงที่ต้องมาก่อนประมูล และระบบแบ่งงานหลายงวดต้องแยกเป็นโครงการที่มีการทดสอบเงินและไฟล์อย่างจริงจัง

ช่วง beta ไม่จำเป็นต้องปลดป้ายทั้งหมดพร้อมกัน ความพร้อมของ loop รับงาน–รับเงิน–ส่งไฟล์และรายการบล็อกเปิด beta ใน PLAN.md ยังมาก่อนฟีเจอร์ใหม่ รอบวางแผนจัดทำ backlog และรอบ implementation แรกเริ่มพื้นฐาน FND โดยยังไม่เปลี่ยนราคา หรือสวิตช์ `BETA_FREE_PRO` และไม่เปิดฟีเจอร์ planned

## 2. รายการที่ตรวจพบจริง

พบ 11 แถว `soon: true` ในตารางราคา และอีก 2 ขอบเขตที่ถูกรวมในคำโฆษณา ได้แก่ไฟล์อ้างอิงและ export รวมเป็น **13 ขอบเขตงาน** โดย 3 หน้าหลังบ้านเป็นภาพจำลอง ไม่ใช่ระบบที่ทำเสร็จแล้วแต่ถูกล็อก

| ID | ฟีเจอร์ / จุดที่เห็น | มีอะไรแล้ว | ส่วนที่ยังขาด | รุ่นเป้าหมาย |
|---|---|---|---|---|
| THM | ธีมหน้าร้าน: Settings / Pricing | `creator_page.theme` เป็น JSON; มี theme สว่าง/มืดของแอป | editor, validation, preview และการนำธีมร้านมาใช้ | R2 |
| BDG | ซ่อนแบดจ์แพลตฟอร์ม: Pricing | มีข้อความ “สร้างด้วย com-mi” | preference, server entitlement และ renderer | R2 คู่ THM |
| BRF | ฟอร์มบรีฟ: Pricing / For creators | ฟอร์มตายตัว `BRIEF_FIELDS`, `order_answer` | preset ที่เลือกได้จริง, builder, version และ schema validation | R2 |
| REF | แนบไฟล์อ้างอิง: For creators | มีระบบ media/upload และไฟล์ส่งมอบ | private attachment ของบรีฟ/งาน, ACL, quota, retention | R2 หลัง BRF |
| MIL | แบ่งงานหลายงวด: Pricing | deposit + ยอดคงเหลือและ payment records | milestone agreement, allocation, approval/revision/release ต่อช่วง | R4 |
| PUSH | Web Push: Settings / Pricing / For creators | มี manifest และ in-app notification | service worker, subscription, permission UI, sender | R2 หลัง REL |
| DSC | Discord: Settings / Pricing / For creators | มี notification event / email template | channel config, secret storage, sender, retry, test delivery | R1 หลัง REL |
| LST | ลงขาย Adopts/YCH: `/listings`, Pricing | หน้าจำลอง `MOCK_LISTINGS`; `active_listings` ในแผน | schema, editor, public listing, reservation, order integration | R3a |
| AUC | ประมูล: `/listings`, Pricing / For creators | ภาพจำลองราคา/จำนวน bid | atomic bid, close/extend, winner, payment expiry | R3b หลัง LST |
| WTL | คิวรอ / แจ้งเมื่อเปิด: Pricing | `ShopStatus = waitlist` เป็นสถานะร้าน | subscriber, consent, campaign, reservation/claim | R3a |
| CRM | ลูกค้า: `/clients`, Pricing | order ผูก creator/client; หน้า `MOCK_CLIENTS` | query จริง, pagination, private notes/tags, detail view | R1 |
| ANL | สถิติ: `/analytics`, Pricing | dashboard รวมยอดรับเงินจริงระดับพื้นฐาน | นิยาม metric/ช่วงเวลา, query, กราฟและตารางจริง, traffic pipeline | R1 แล้วขยาย R3 |
| EXP | export: ข้อความแถวสถิติใน Pricing | มีชื่อ feature `export` | CSV schema, permission, injection protection, download flow | R1 คู่ ANL |

หลักฐานใน repo:

- [ตารางแพ็กเกจและป้าย soon](../lib/billing/plans.ts): `COMPARISON`, `PRO_BULLETS`, `FEATURES`
- [Settings](../app/(app)/settings/page.tsx), [For creators](../app/(marketing)/for-creators/page.tsx), [ข้อความ TH/EN](../lib/i18n/dictionaries.ts)
- [Clients](../app/(app)/clients/page.tsx), [Analytics](../app/(app)/analytics/page.tsx), [Listings](../app/(app)/listings/page.tsx), [LockedFeature](../components/locked-feature.tsx)
- [Schema หน้าร้าน](../lib/db/schema/app.ts), [Schema งาน/เงิน](../lib/db/schema/order.ts), [Schema แจ้งเตือน](../lib/db/schema/notification.ts)
- [ฟอร์มสั่งงานปัจจุบัน](../components/service-order-flow.tsx), [สร้างคำขอ](../lib/orders/create.ts), [notification ปัจจุบัน](../lib/notifications/create.ts)

### สิ่งที่ห้ามตีความจากชื่อฟีเจอร์

- มี `theme` ใน DB ไม่เท่ากับมีธีมหน้าร้าน และการสลับ light/dark ของทั้งแอปไม่ใช่ custom theme ของร้าน
- ฟอร์มบรีฟปัจจุบันเป็นชุดตายตัว; แถว “3 preset / fully custom” เป็นทิศทางแพ็กเกจที่ยังติด soon ไม่ใช่ preset สามชุดที่ตรวจพบว่าเลือกได้แล้ว
- `waitlist` ปัจจุบันเป็นสถานะ ไม่ได้เก็บคนรอหรือส่ง broadcast
- มัดจำและเงินส่วนที่เหลือมีแล้ว แต่ยังไม่ใช่ milestone หลายงวด
- จำนวนเงิน/ลูกค้า/กราฟ/ประมูลในสามหน้าที่ล็อกเป็นภาพจำลอง ห้ามนำไปใช้เป็น baseline วัดผลหรือสัญญาการขาย
- `can(plan, feature)` ตรวจสมาชิกของแผน ไม่ได้ยืนยันว่าฟีเจอร์นั้นสร้างแล้ว; ต้องมี implementation availability แยกต่างหาก

## 3. ลำดับและเงื่อนไขเปิดใช้

| รุ่น | ผลลัพธ์ที่ต้องได้ | Dependency | เงื่อนไขก่อนปล่อย |
|---|---|---|---|
| R0 | สภาพแวดล้อมทดสอบ + capability registry + วิธีปล่อยเป็นกลุ่ม | รายการ P0 ใน PLAN.md | staging แยกข้อมูล/secret, ทดสอบสิทธิ์ข้ามร้าน, rollback/restore พร้อม |
| R1 | แจ้งเตือนเชื่อถือได้, Discord, ลูกค้าจริง, สถิติงาน+CSV | R0; REL ก่อน DSC | invariant เงินตรง, ไม่มีข้อมูลข้ามร้าน, ส่งซ้ำแล้วไม่เพิ่ม event ซ้ำ |
| R2 | ธีม/แบดจ์, custom brief, private references, Web Push | R0; REF หลัง BRF; PUSH หลัง REL | version งานเก่าไม่เปลี่ยน, ไฟล์เป็น private, fallback ของ browser ใช้ได้ |
| R3a | คิวรอ และ listing ราคาคงที่ | REL, quota/capacity ที่ enforce จริง, order integration | claim พร้อมกันไม่เกินช่อง; เปิด/ปิด/หมดอายุแล้วสถานะตรง |
| R3b | ประมูล + traffic analytics ที่นิยามชัด | LST, REL, job cadence ที่รองรับ | ทดสอบ concurrent bid/close/winner/expiry และนโยบายไม่ชำระเงิน |
| R4 | Milestones | money ledger + payment/release QA และ feedback ความต้องการ | สมการยอดงวดถูกทุกสถานะ ไม่ปล่อยไฟล์ที่ไม่ครบเงื่อนไข |

**เส้นทางพึ่งพาหลัก:** R0 → REL → DSC/PUSH/WTL; order/payment queries → CRM/ANL/EXP; BRF → REF; capacity + order integration → LST → AUC; payment/release invariants → MIL

ไม่เริ่มตามลำดับเลขเพียงอย่างเดียว: หากยังไม่ผ่านเกณฑ์ Beta ใน PLAN.md ให้แก้ gate นั้นก่อน และเลือกได้เพียงหนึ่งงานใหญ่ที่อยู่ระหว่างทำต่อผู้พัฒนาแต่ละคน

## 4. พื้นฐานร่วมก่อนเริ่มฟีเจอร์ (FND / REL)

### FND — ความพร้อมและสิทธิ์

- [x] สร้าง capability registry ที่ server ใช้ตัดสินสิทธิ์ และมี public metadata สำหรับ UI: `planned | internal | beta | live | paused`; map ทั้ง 13 ขอบเขตกับ pricing row, nav และ feature key เดิมอย่างชัดเจน
- [x] มี policy และ unit tests ให้การเข้าถึงผ่าน 3 เรื่องแยกกัน: สร้างพร้อมแล้วหรือยัง, อยู่ใน cohort ที่เปิดหรือไม่, แพ็กเกจ/เจ้าของมีสิทธิ์หรือไม่; beta Pro ไม่ปลดฟีเจอร์ planned
- [ ] planned แสดงคำอธิบาย, internal ใช้บัญชีทดสอบ, beta เปิดเฉพาะกลุ่ม, live จึงเอาป้าย soon ออก; paused หยุดการกระทำใหม่แต่รักษาทางอ่านงานเดิม
- [ ] เช็ก owner และ capability ใน query/Server Action ทุกจุด ไม่เชื่อ role, pageId หรือ plan จาก client; mutation ที่มีผลจริงอ่านสิทธิ์ที่เป็นปัจจุบัน
- [ ] กำหนด seed บน staging ที่มี creator 2 คน / client 2 คน, order หลายสถานะ, ข้อความยาว, TH/EN และไฟล์จำลอง; ไม่มีการ seed production
- [ ] ตั้ง index ตาม query ที่ใช้จริง ตรวจ query plan/จำนวนแถว และ pagination ตั้งแต่ CRM/analytics รุ่นแรก
- [ ] migration ใช้เพิ่ม schema ก่อน ปล่อยโค้ดที่อ่านเก่าได้ แล้วค่อย backfill/บังคับ constraint; rollback code ไม่ลบข้อมูลที่ฟีเจอร์ใหม่สร้างไปแล้ว

**หลักฐาน FND รอบแรก:** `lib/capabilities/` และ `pnpm beta:check`; ด่านตรวจฝั่ง server พร้อมให้ query/action ใหม่เรียกใช้ แต่ยังไม่ถือว่าผ่าน integration กับ DB จริง รายละเอียดและสิ่งที่ต้องเตรียมอยู่ใน [FOUNDATION-IMPLEMENTATION.md](FOUNDATION-IMPLEMENTATION.md)

### REL — ส่งแจ้งเตือนให้ตามงานได้

ปัจจุบัน `notify()` เขียน notification แบบ best effort แล้วส่งอีเมลผ่าน `after()`; เป็นพื้นฐานที่ใช้ได้แต่ยังไม่มี outbox ที่ฟื้นงานส่งค้างได้ จึงทำส่วนนี้ก่อนเพิ่มช่องทางส่ง

- [ ] ออกแบบ `domain_event` / `notification_delivery` / `notification_preference` (ชื่อเสนอ ยังไม่ใช่ schema ที่มีแล้ว)
- [ ] บันทึก event ในการเขียนธุรกรรมเดียวกับการเปลี่ยนงาน/เงิน มี `eventId` และ unique key จากชนิด event + entity + version; transaction rollback แล้วต้องไม่มี event
- [ ] ใช้ atomic SQL / `db.batch()` ที่เข้ากับ `neon-http` ปัจจุบัน ไม่สมมติว่า interactive transaction ใช้ได้; prototype พร้อม failure/concurrency test ก่อนย้าย action จริง
- [ ] แยก delivery ต่อ event/recipient/channel มี unique constraint, `pending/sending/sent/retry/dead`, attempt count, nextAttemptAt, lease expiry และ lastErrorCode
- [ ] worker claim งานแบบ atomic; process ตายแล้ว lease หมดอายุและกลับมาลองต่อได้; timeout/429/5xx ใช้ backoff + jitter และมีเพดาน
- [ ] การตอบรับจาก provider ไม่เท่ากับผู้ใช้อ่านแล้ว แยก accepted/delivered เมื่อมีหลักฐาน; ห้ามสัญญา exactly-once ภายนอกเมื่อ provider ไม่รองรับ idempotency
- [ ] กรณี provider รับแล้วแต่บันทึก sent ไม่สำเร็จอาจส่งซ้ำ: ใช้ provider idempotency ถ้ามี, dedupe/tag ฝั่งช่องทางที่รองรับ, บันทึกความไม่แน่นอนและไม่ replay ทั้งคิวแบบเหมารวม
- [ ] ตรวจผู้รับ สิทธิ์ และ preference อีกครั้งก่อนส่ง; การยกเลิก/เปลี่ยนบัญชี/หยุดช่องทางต้องหยุดข้อความที่ยังค้างด้วย
- [ ] แยก security/account notice จาก order update และ marketing; การปิดช่องทางไม่ทำให้ข้อมูลในหน้าออเดอร์หาย
- [ ] ตั้ง heartbeat, backlog age และ dead-letter view; retry ด้วยสิทธิ์ admin และ audit trail โดยไม่แสดง secret/body ส่วนตัวใน logs
- [ ] ย้าย event ทีละชนิด มี ownership ของ sender เพียงเส้นทางเดียวต่อ event เพื่อไม่ส่งทั้งแบบเดิมและแบบใหม่พร้อมกัน

กำหนดเป้าหมายภายในเริ่มต้น: 95% ของ event ทดสอบถูก provider รับภายใน 60 วินาทีเมื่อ provider ปกติ และไม่มีคิวค้างโดยไร้สัญญาณเตือน ปรับจาก load test ก่อนนำไปใช้เป็นคำสัญญาต่อผู้ใช้

`vercel.json` ปัจจุบันมี cleanup วันละครั้ง จึงยังใช้ยืนยันคำว่า “แจ้งทันที” ไม่ได้ ต้องเลือก cadence/worker ที่รองรับและยืนยันงบก่อนเปิด DSC/PUSH ส่วน Vercel Cron อาจรันซ้ำ พลาดรอบ หรือรันทับกัน และไม่มี retry อัตโนมัติเมื่อ invocation ล้มเหลว จึงต้องมีทั้ง lease และการไล่งานค้างในระบบเอง ตาม [เอกสาร Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

## 5. รายละเอียดแต่ละฟีเจอร์

### DSC — Discord notification

**รุ่นแรก:** ครีเอเตอร์เชื่อม webhook หนึ่งปลายทาง เลือกเหตุการณ์หลัก ดูสถานะการเชื่อมต่อ ทดสอบส่ง และยกเลิกเชื่อมต่อได้

- UI: Settings → Notifications → เชื่อมต่อ → แสดงตัวอย่างข้อความและช่องทาง → ทดสอบ → เปิดใช้; ห้ามส่ง test อัตโนมัติทันทีที่วาง URL
- ข้อมูลเสนอ: `notification_channel(ownerUserId, kind, encryptedTarget, keyVersion, status, lastSuccessAt, lastErrorCode)`; แสดง URL แบบปิดบังและไม่ส่ง secret กลับ browser หลังบันทึก
- จำกัดปลายทางตาม webhook URL รูปแบบที่รองรับ ตรวจ server-side, ไม่ตาม redirect ไป URL อื่น; ไม่ทำเป็นระบบยิง arbitrary URL
- ส่งเฉพาะข้อมูลขั้นต่ำ เช่น ประเภทเหตุการณ์ รหัสงาน และลิงก์ที่ยังต้องตรวจสิทธิ์; ค่าเริ่มต้นไม่ส่ง brief, ชื่อลูกค้าเต็ม, ข้อความคุย, slip หรือ signed download URL
- ปิด mention จากข้อความผู้ใช้, ไม่มี `@everyone`; dedupe ต่อ event/channel และหยุดปลายทางที่ถูกลบ
- เมื่อ 429 ใช้ `Retry-After`/`retry_after`; ไม่ hardcode อัตราส่งจากความจำ ตาม [Discord Rate Limits](https://docs.discord.com/developers/topics/rate-limits)
- **ตรวจรับ:** 2 ร้านไม่เห็น config กัน, URL ถูกลบแล้วแสดง disconnected, 429 ไม่ทำคิววน, disable แล้วงานค้างไม่ถูกส่ง, reconnect ไม่ส่งประวัติทั้งก้อน
- ยังไม่ทำ: bot สั่งเปลี่ยนสถานะงาน, OAuth bot install, ส่งไฟล์แนบ และหลายเซิร์ฟเวอร์ต่อร้าน

### CRM — ลูกค้าและประวัติการทำงาน

**รุ่นแรก:** รายชื่อลูกค้าที่เคยมีงานกับร้านจริง ค้นชื่อ ดูงานที่กำลังทำ/จบแล้ว ยอดรับเงินที่ยืนยัน และโน้ต/แท็กส่วนตัว

- Query ผูก `creatorPageId + clientUserId` จาก session และ relationship ใน order; ไม่มี directory ลูกค้าทั้งแพลตฟอร์ม
- หน้า `/clients` ใช้รายการ/การ์ดบน mobile; desktop มีตารางค้นหาและกรอง; detail แยกประวัติงานกับโน้ตที่เจ้าของเท่านั้นเห็น
- ใช้ cursor pagination พร้อม sort key ที่คงที่ เช่น latestOrderAt + clientUserId; ไม่โหลด order ทุกชิ้นมา aggregate ใน browser
- ข้อมูลเสนอ: `creator_client_note`, `creator_client_tag`, tag junction พร้อม unique `(creatorPageId, clientUserId, tagId)`; จำนวนงานและยอดเงิน derive จาก order/payment ก่อนเพิ่ม cache
- ยอดรับเงินต้องตัด pending/rejected/voided ออก ใช้กฎเดียวกับ `lib/payments/money.ts`; แยกสกุลเงิน ไม่บวกข้าม currency
- เปลี่ยนชื่อ/ลบบัญชีแล้วไม่รวมลูกค้าสองคนด้วยชื่อหรือ email; ใช้ ID ที่ได้รับอนุญาตและออกแบบ placeholder สำหรับข้อมูลที่ไม่อยู่แล้ว
- ตรวจ deletion policy กับ foreign key ของ schema ปัจจุบันก่อนสัญญาว่าจะเก็บประวัติหลังลบบัญชี; ไม่ถือว่า placeholder ใน UI แก้ปัญหา cascade delete ได้
- โน้ตไม่ปรากฏใน public shop, client payload, email หรือ export ค่าเริ่มต้น; หากอนุญาต export โน้ตต้องแยกตัวเลือกและตรวจสิทธิ์ซ้ำ
- **ตรวจรับ:** empty / มีลูกค้าซ้ำชื่อ / 1,000 ราย / pagination ไม่ซ้ำ; ลูกค้าและ creator อื่นอ่านหรือแก้โน้ตไม่ได้; ยอดตรง payment fixtures
- ยังไม่ทำ: blacklist ข้ามแพลตฟอร์ม, email marketing, lead import หรือการให้คะแนนความเสี่ยงลูกค้า

### ANL + EXP — สถิติงานจริงและ export

**ANL รุ่นแรก:** จำนวนคำขอ งานที่รับ งานที่จบ ยอดรับเงินที่ยืนยัน งานค้าง และลูกค้าที่กลับมาจ้างซ้ำ เลือก 7/30/90 วันหรือช่วงเองได้ มีตารางข้อมูลคู่กราฟเสมอ

นิยามที่ต้องตกลงก่อนเขียนกราฟ:

| ตัวเลข | วิธีนับเสนอ | สิ่งที่ไม่รวม / ข้อจำกัด |
|---|---|---|
| คำขอใหม่ | order สร้างในช่วง `[from,to)` | ตัด demo/test ตาม flag; แยกที่มาคำเชิญหากต้องการวิเคราะห์ |
| ยอดรับเงินที่ยืนยัน | SUM payment amount ที่ verified, ไม่ rejected, ไม่ voided; จัดช่วงด้วย `paidAt` | ระบุว่าเป็นยอดที่เจ้าของยืนยัน ไม่ใช่ยอดธนาคารที่ระบบตรวจอัตโนมัติ |
| งานที่จบ | transition เข้า completed ในช่วง | ต้องพิสูจน์ timestamp จาก event ที่มี; ไม่มีประวัติพอให้แสดงไม่ทราบ ไม่ใช้ updatedAt เดา |
| งานที่รับ | transition เข้า accepted ในช่วง | ห้ามใช้ current status ของงานแทนประวัติการรับ |
| ลูกค้ากลับมาจ้าง | client ID มีงานที่รับก่อนช่วง และมีงานที่รับในช่วง | จำนวนงานที่ยกเลิก/ขอราคาแล้วเงียบไม่ทำให้เป็นลูกค้าประจำ |
| Request → accepted | cohort คำขอในช่วง ติดตามว่าถูกตอบรับภายในหน้าต่างที่กำหนด | แสดง cohort ยังไม่ครบเวลา; ไม่หารจำนวน accepted ของเดือนด้วย request ของเดือนแบบคนละกลุ่ม |

- เวลาเก็บ UTC; UI แสดงเขตเวลาที่ใช้กับรายงานอย่างชัดเจน รุ่นแรกเสนอ Asia/Bangkok; ทดสอบขอบเที่ยงคืน/สิ้นเดือน
- การ void ภายหลังทำให้ยอดช่วงเก่าเปลี่ยน: อธิบายว่ารายงานเป็นสถานะล่าสุดของรายการ และเก็บ audit trail ไม่เรียกว่าเอกสารบัญชีปิดงวด
- หาก order/event เก่าไม่มีเวลาที่ใช้พิสูจน์ metric ให้แสดง coverage start และ “ข้อมูลไม่ครบ”; ห้าม backfill วันที่สมมติหรือกราฟตัวเลขสุ่ม
- ไม่รวม page views/conversion จากการเข้าชมในรุ่นแรก เพราะยังไม่มี pipeline ที่นับได้; ปลดป้ายเฉพาะ “สถิติงาน” ส่วน traffic ยัง planned
- traffic รุ่นต่อไปต้องนิยาม bot filtering, owner/demo exclusion, consent/retention และ denominator ก่อน; เก็บข้อมูลขั้นต่ำ ไม่เก็บ brief/chat/payment secret
- EXP: CSV งานและรายการรับเงินที่ตรงตัวกรอง ใช้คอลัมน์ allowlist, UTF-8/BOM ตามผลทดสอบ Excel, escape quote/newline และป้องกัน cell เริ่ม `=`, `+`, `-`, `@` รวมช่องว่าง/อักขระควบคุมที่นำหน้า
- export ครั้งใหญ่มี cap/async job; ตรวจ owner ที่ download route ก่อนออก signed URL อายุสั้นทุกครั้ง และยอมรับว่า URL ที่ออกแล้วใช้ได้จนหมดอายุ; ไม่ใส่ signed URL ของไฟล์งานหรือข้อมูลร้านอื่น
- **ตรวจรับ:** เทียบกับ dataset ที่คำนวณเอง รวมคืนสถานะ/void/split payments/สอง currency; zero ไม่เท่ากับ no data; reload/CSV ตัวเลขตรงกัน; cross-tenant export ปฏิเสธ
- พื้นฐานจำนวนงาน/ยอดสะสมเดิมยังใช้ได้ตามเดิม ไม่เอาไปล็อกเพิ่มเพื่อขายกราฟใหม่

### THM + BDG — ธีมร้านและแบดจ์

**รุ่นแรก:** preset 3 แบบที่ผ่าน contrast, ปรับสี accent ที่จำกัดขอบเขต, preview desktop/mobile, บันทึกและ reset ได้ ส่วน BDG แยก toggle ตามสิทธิ์

- ใช้ `creator_page.theme` เดิมผ่าน Zod schema แบบ versioned/allowlist แทนการยอมรับ CSS ใด ๆ; fallback ธีมมาตรฐานเมื่อค่าเก่าไม่ถูกต้อง
- Scope CSS tokens เฉพาะหน้าร้านสาธารณะ ไม่รั่วไป header ของแพลตฟอร์ม หน้าชำระเงิน หลังบ้าน หรือ legal
- ไม่มี arbitrary CSS/HTML/JS, font URL ภายนอก หรือ embed script จาก theme; สร้างคู่สีข้อความจากชุดที่ตรวจแล้ว
- preview เป็น draft state; reload ก่อน save ต้องไม่เปลี่ยนร้านจริง; save สำเร็จจึง refresh public rendering
- hide badge หมายถึงข้อความแบรนด์ตกแต่งที่ระบุ ไม่ซ่อนช่องรายงาน ข้อตกลง ข้อมูลผู้ขาย หรือองค์ประกอบสำคัญของแพลตฟอร์ม
- Downgrade: เสนอคง config ไว้และใช้ preset fallback เมื่อสิทธิ์หมด; ต้องประกาศนโยบายก่อนใช้งานจริงและไม่ลบค่าที่ผู้ใช้บันทึก
- **ตรวจรับ:** 320/390/768/1024/1920, ไทย/อังกฤษ, light/dark, ขยายข้อความ, contrast/keyboard; ผู้ไม่มีสิทธิ์ส่ง custom token/hideBadge ตรงเข้า action ไม่ผ่าน
- ยังไม่ทำ: custom domain, layout builder แบบอิสระ, CSS editor หรือ marketplace ธีม

### BRF — ฟอร์มบรีฟที่ครีเอเตอร์จัดเอง

**รุ่นแรก:** preset Illustration / Emote / General และ builder สำหรับ short text, long text, single choice, multiple choice, URL พร้อม required/help text

- แยก `brief_form` กับ immutable `brief_form_version`; service ชี้ published version ส่วน order เก็บ snapshot schema และคำตอบที่ตรวจแล้ว
- เสนอเพดานเริ่มต้น 20 fields / 20 options ต่อ choice / ข้อความตอบไม่เกิน limit ที่ตกลง; จำกัด payload รวมที่ server ให้สอดคล้องของเดิม
- field ID คงที่; เปลี่ยนชื่อ/ลำดับไม่ทำคำตอบเก่าจับคู่ผิด; order เก่าไม่ถูกบังคับ required field ที่เพิ่งเพิ่ม
- ส่ง formVersionId; ถ้าร้านแก้ฟอร์มระหว่างลูกค้ากรอก ให้แสดงสิ่งเปลี่ยนและยืนยันใหม่โดยรักษาคำตอบเดิม ไม่ map จาก label แบบเดา
- Server โหลด schema ที่เผยแพร่และเป็นของ service นี้เอง ตรวจ field/required/type/options/max length; ไม่เชื่อ label หรือ validation จาก client
- migrate ฟอร์มตายตัวเดิมเป็น legacy version โดยรักษาข้อความและคำตอบเดิม; ของเก่ายังอ่านได้แม้ service ถูก soft delete
- UI มี preview ก่อนเผยแพร่ ปุ่มขึ้น/ลงที่ใช้คีย์บอร์ดได้ ไม่บังคับลากอย่างเดียว; save draft แยกจาก publish
- **ตรวจรับ:** เพิ่ม/ลบ/เปลี่ยน field แล้วงานเก่าไม่เปลี่ยน, forged field/version ปฏิเสธ, สองแท็บชนกันไม่ทับเงียบ, validation ไทย/อังกฤษอยู่ใกล้ช่อง
- ยังไม่ทำ: conditional logic, สูตรคำนวณราคา, rich HTML และลายเซ็น; URL ในบรีฟไม่ถูก server fetch อัตโนมัติ

### REF — ไฟล์อ้างอิงส่วนตัว

**รุ่นแรก:** แนบรูปอ้างอิงในบรีฟ เก็บ private และอ่านได้เฉพาะลูกค้ากับเจ้าของงาน

- เพิ่ม media purpose แยกจาก public portfolio และ delivery; schema `order_reference`/draft attachment อ้าง upload intent ที่ผูก owner/session
- เริ่มให้ผู้ใช้ sign in ก่อนแนบไฟล์ รักษาข้อความบรีฟที่กรอกอยู่; guest upload เป็นงานอนาคตไม่เปิด public bucket เพื่อเลี่ยง login
- จำนวน/ขนาดเสนอ 5 ภาพ × 10MB ต่อบรีฟ โดยต้องคิดรวม quota และต้นทุนก่อนล็อกค่า; อนุญาต format ที่ตรวจ/แปลงได้จริง ไม่รับ SVG/HTML/ไฟล์ต้นฉบับทุกชนิดในรุ่นแรก
- Client ย่อภาพเพื่อความสะดวก แต่ server ยืนยัน MIME/size/purpose/ownership; สแกนหรือ quarantine ตามชนิดที่เปิดรับ และไม่ serve ไฟล์ที่ยังตรวจไม่ครบ
- claim เข้างานในธุรกรรมเดียวกับ create order; ไม่สำเร็จต้องไม่ทิ้งไฟล์ที่ผูกกับงานผิดคน; cleanup เฉพาะ draft หมดอายุที่ไม่มี reference
- ใช้ signed download ที่ออกหลังตรวจสิทธิ์ใหม่ อายุสั้น; ไม่เก็บ URL ชั่วคราวลง analytics/email; public payload ไม่พก private storage key
- **ตรวจรับ:** สลับ media ID ของผู้อื่น, upload ซ้ำ/ขาดเน็ต, submit สองครั้ง, ยกเลิกร่าง, โหลดหลัง sign out และ cleanup แข่งกับ submit
- ต้องตกลงเจ้าของ quota และวันเก็บ draft/reference ก่อน implementation; แยกจากอายุไฟล์ส่งมอบในราคาแพ็กเกจ

### PUSH — แจ้งเตือนบนอุปกรณ์

**รุ่นแรก:** เปิด/ปิดการแจ้งเตือนต่ออุปกรณ์ กดทดสอบ ดูคำแนะนำเมื่อไม่ได้รับสิทธิ์ และเปิดงานจากข้อความแจ้งเตือนได้

- Service worker ใช้เพื่อ notification ก่อน ไม่ cache หน้า auth/order/payment/file แบบ offline ในรอบนี้
- `push_subscription` ผูก owner + device + unique endpoint hash; endpoint/key ถือเป็นข้อมูลลับ มีการเข้ารหัส/จำกัดผู้เข้าถึงและไม่ใส่ log
- ขอ permission หลังผู้ใช้กดเปิดเท่านั้น; แสดง unsupported / denied / subscribed / expired ชัด ไม่เรียก prompt ซ้ำเมื่อ denied
- เปิดลิงก์ภายใน allowlist และตรวจสิทธิ์ที่หน้าเป้าหมายเสมอ; ค่าเริ่มต้นข้อความบน lock screen ไม่เปิดเผย brief/chat/ยอดเงิน
- สลับบัญชีและ logout ต้อง revoke หรือยกเลิก subscription ฝั่ง server; อุปกรณ์ร่วมกันต้องไม่รับข้อมูลบัญชีก่อนหน้า
- ปลายทางส่งมาจาก client: validate endpoint/HTTPS, ป้องกัน private-network target/redirect และกำหนด outbound policy ก่อน worker ส่ง
- sender อยู่บน REL; 404/410 ของ subscription ทำให้ inactive; ส่งสำเร็จแล้วไม่ตีความว่า user อ่านแล้ว
- **ตรวจรับ:** desktop Chromium/Firefox และอุปกรณ์ Safari/iOS/Android จริงตามรุ่นที่ประกาศรองรับ; รวม denied, permission เปลี่ยน, reinstall, sign out, switch account, click ตอน session หมด
- Push ต้องมี active service worker และ subscription; endpoint ต้องเก็บเป็นความลับ ตาม [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) การมี manifest เพียงอย่างเดียวยังไม่ครบ

### WTL — คิวรอและแจ้งเปิดรับงาน

**รุ่นแรก:** คนที่ sign in เข้าร่วมคิวรอร้านหรือเมนู ดูสถานะและออกจากคิวได้ เจ้าของเปิดรอบรับงานและเชิญเป็นชุดตามจำนวนช่อง

- ต้องนิยาม capacity ก่อน: ข้อมูล `slotsTotal` ระดับร้านไม่ใช่ atomic per-service reservation ที่ใช้งานได้ครบ; สร้างการจองช่องและ quota ให้ enforce ฝั่ง server
- ข้อมูลเสนอ `waitlist_entry(shopId, serviceId?, clientUserId, joinedAt, status, consentVersion)` unique active entry + `opening` + `opening_invitation`
- FIFO ตาม joinedAt + ID เป็นค่าเริ่มต้น; เจ้าของข้ามคนต้องมีเหตุผลที่บันทึก ไม่โฆษณาว่าเป็นอันดับรับประกันหากเลือกเองได้
- เชิญเป็น batch ไม่ broadcast ทุกคนแย่งช่องเดียว; ระบุราคาเป็นประมาณการ/ลิงก์เมนูปัจจุบันและวันหมดสิทธิ์ ไม่สร้าง paid order จากการเข้าคิว
- claim invitation กับ reservation ในธุรกรรมเดียว; TTL จาก server; retry ไม่กินช่องซ้ำ; คนถัดไปถูกเชิญเมื่อสิทธิ์หมดจริง
- การออกจากคิว/ปิดร้าน/ระงับร้านต้องหยุดการส่งที่ยังค้าง; ส่งผ่าน REL และมีเพดานต่อผู้ใช้ต่อรอบ
- **ตรวจรับ:** join/claim พร้อมกัน, double opt-in ตามช่องทางที่เลือก, unsubscribe ก่อนส่ง, งานยังมีช่องแต่ quota creator เต็ม, invite เก่าเปิดไม่ได้
- ยังไม่ทำ: ซื้อสิทธิ์ลัดคิว, ค่าสมาชิกคิวรอ และระบบชิงสิทธิ์แบบสุ่ม

### LST — Adopts / YCH ราคาคงที่

**รุ่นแรก:** listing ประเภท adopt หนึ่งสิทธิ์หรือ YCH จำนวนช่องที่ชัดเจน ตั้ง draft/published/paused/sold/archived พร้อมรูป ราคา สิทธิ์ใช้งาน และวันรับงาน

- ข้อมูลเสนอ `listing`, immutable `listing_version`, `listing_reservation`; snapshot รายละเอียด/สิทธิ์/ราคาเข้าคำสั่งซื้อ
- public อ่านเฉพาะ published และร้านไม่ suspended; seller action ทุกจุดเช็ก owner + active listing limit แบบ atomic
- reservation มี TTL ระหว่างตอบรับ/รอชำระตามนโยบาย; ประสานกับ order state เดิม ไม่สร้างระบบเงินชุดใหม่ที่ขัดกับ payment_record
- สองคนกดซื้อ adopt เดียวกันต้องได้สิทธิ์เพียงคนเดียว; YCH จำกัดตาม slots ที่ server; idempotency ครอบการกดซ้ำ
- หมดเวลาจองกับการแจ้งโอนพร้อมกันต้องมีทางจัดการ: freeze เพื่อให้เจ้าของตรวจรายการที่อยู่ระหว่างตรวจ ห้ามนำสิทธิ์ไปขายซ้ำทันทีโดยยังมีคำแจ้งโอนที่ไม่ตัดสิน
- ห้ามแก้ราคา/สิทธิ์ย้อนหลังใน reservation/order ที่ยืนยันแล้ว; แก้ listing ใหม่ไม่เปลี่ยนสัญญาเดิม
- **ตรวจรับ:** concurrent reservation อย่างน้อย 20 คำขอใน staging, retry, timeout, ปิดร้านกลาง flow, edit ระหว่างเปิดแท็บ, quota ของ free/beta/pro
- ยังไม่ทำ: ประมูล, resale/โอนสิทธิ์ระหว่างลูกค้า, digital product download อัตโนมัติก่อนผ่านเงื่อนไขเงิน

### AUC — ประมูล

**รุ่นแรก:** starting bid + minimum increment + server closing time + anti-snipe ที่ประกาศก่อน bid + ผู้ชนะหนึ่งคน ไม่ทำ proxy bidding หรือ auto-buy พร้อมกันในรอบแรก

- ข้อมูลเสนอ `auction`, append-only `bid`, `auction_resolution`; เก็บจำนวนเงินเป็น integer cents; ทุกการเปลี่ยนใช้เวลา DB และตรวจ version
- Bid ต้อง authenticated, ไม่ใช่เจ้าของร้าน, ผ่าน limit, auction ยังเปิด และยอดมากพอ; จำกัดเพดานจำนวนเงินและตรวจ integer overflow ฝั่ง server; atomic compare/update กับ insert bid และ event ใน transaction เดียว
- เสนอ anti-snipe: bid ใน 2 นาทีท้ายขยายเวลาปิดให้เหลือ 2 นาที แต่รวมไม่เกิน 30 นาที; เป็นค่ารอเจ้าของตัดสินใจและต้องแสดงก่อนเริ่ม ห้ามเปลี่ยนกติกากลางประมูล
- กำหนดเวลา server เป็นหลัก countdown เป็นเพียงการแสดงผล; reload/sleep/tab เก่าไม่ทำให้เวลาขยับ
- ปิดแบบ idempotent; request แรกหลังหมดเวลาปิดแบบ lazy ได้ และมี worker reconcile เผื่อไม่มีคนเปิดหน้า; ใช้ batch/locking ที่พิสูจน์กับ neon-http แล้ว
- bid แข่งกับ close/extend ต้องมีผลลัพธ์เดียว; มี winner/order reservation ไม่เกินหนึ่งชุด และ audit เหตุผลกรณีไม่รับ bid
- เสนอผู้ชนะตอบรับและชำระภายใน 24 ชั่วโมง; ถ้าไม่ชำระให้เจ้าของเลือกเสนอคนถัดไปหรือเปิดใหม่ ไม่ตัดสินใจเรียกเก็บเงินจากคนถัดไปอัตโนมัติ
- ต้องกำหนดการถอน bid, ปิดประมูลก่อนเวลา, ระงับร้าน, รายงานการปั่นราคา และกรณีผู้ชนะมีรายการโอนค้างก่อนเปิด beta ของประมูล
- **ตรวจรับ:** หลาย bid เวลาเดียวกัน, bid ต่ำ/ซ้ำ, final second + anti-snipe cap, worker รันสองตัว/ตายกลางทาง, ผู้ชนะเดิม retry, notification outbid มาถึงช้า
- เป้าหมายแรก 3–5 ร้านที่เข้าใจกติกา; ระบบยังไม่ถือเงินและไม่ควรโฆษณาประมูลแบบรับประกันการชำระ

### MIL — งานหลายงวด

**รุ่นแรก:** สร้างลำดับงวดก่อนลูกค้ายอมรับ แต่ละงวดมีชื่อ ขอบเขต จำนวนเงิน วันส่ง จำนวนแก้ และเกณฑ์ตรวจรับ; ยอดรวมงวดต้องเท่ากับยอดงาน

- ข้อมูลเสนอ `milestone_agreement_version`, `order_milestone`, `payment_allocation`, `milestone_delivery` และ event ของการยอมรับแต่ละ revision
- มัดจำเดิมเป็นส่วนหนึ่งของยอดรวม ไม่ถูกบวกซ้ำเป็นงวดเพิ่ม; ออกแบบ mapping ออเดอร์เก่าเป็น legacy single-stage โดยไม่ migrate งานค้างไปกติกาใหม่เอง
- การชำระหนึ่งรายการอาจแบ่งให้หลายงวดได้ แต่ allocation รวมต้องไม่เกินยอด verified/non-void ของรายการนั้น; ผลรวมงวดและ order balance ต้อง reconcile ได้
- แยกสถานะงวดจากสถานะ order; proposal → accepted → funded → working → review → approved/released เป็นแบบเสนอ ต้องทำ transition table กับ actor ก่อนเขียน UI
- ปรับ lifecycle/cron ให้ไม่ auto-complete ทั้ง order ระหว่างตรวจงวดย่อย; final completion และ retention clock ต้องเกิดตามกติกางวดสุดท้ายที่ตกลง
- กำหนดว่าไฟล์ไหนปล่อยได้เมื่อใด: รุ่นแรกใช้กฎระมัดระวัง ไฟล์ของงวดนั้นต้องครบทั้งเงินและเงื่อนไขตรวจรับ; ไฟล์ต้นฉบับสุดท้ายยังผ่าน release gate ของทั้งงาน
- เปลี่ยน scope/ราคาในงวดที่ยังไม่เริ่มผ่าน revision และการยอมรับใหม่; งวดที่จ่ายแล้วไม่แก้เงียบ และไม่ย้ายยอดข้ามงวดโดยไร้หลักฐาน
- void/reject/payment แข่งกับ release ต้อง lock และตรวจเงื่อนไขปัจจุบัน; ไฟล์ที่ออกไปแล้วเรียกคืนไม่ได้ ต้องมี incident/compensation flow ที่ชัด
- ออกแบบ cancel/refund recording, overdue, revision เกิน, ลูกค้าเงียบ และงานบางงวดเสร็จแล้วก่อนเลือกเปิดจริง
- **ตรวจรับ:** property tests สมการเงิน, transition tests ทุก actor, concurrent payment/void/release, accepted agreement เก่า, retry และครบวงจรด้วย 2 บัญชีใน staging
- ไม่รวม escrow, split payout หรือบัตรเครดิตของลูกค้า; billing สมาชิกแพลตฟอร์มยังเป็นคนละระบบ

## 6. Backlog พร้อมหยิบไปพัฒนา

FND-01 มี offline preflight แล้วแต่ยังไม่ผ่าน staging; FND-02 มี registry, mapping และ server guard พร้อม unit tests แต่รอ integration ส่วน FND-03 และ CRM เริ่ม implementation แล้วแต่ยังไม่ผ่าน staging; ฟีเจอร์อื่นยังไม่เริ่ม เจ้าของงานเสนอเป็นบทบาท ไม่ใช่การมอบหมายบุคคลหรือการอนุมัติจ้างทีม ควรแยกชุดเปลี่ยนแปลงให้ตรวจได้โดยไม่รอทั้งรุ่นเสร็จ

| งาน | ผลส่งมอบที่ตรวจได้ | พึ่งพา | ผู้รับผิดชอบเสนอ |
|---|---|---|---|
| FND-01 | ตรวจ staging/secret/fixtures + รายงาน restore และ gate Beta | PLAN.md | Engineering + Owner |
| FND-02 | capability registry + test ว่า pricing/nav/action สอดคล้องกัน | FND-01 | Engineering |
| FND-03 | rollout cohort, kill switch, audit และ downgrade decision record | FND-02 | Engineering + Product |
| REL-01 | event/outbox schema + prototype atomic write/crash recovery | FND-01 | Engineering |
| REL-02 | worker lease/retry/dead-letter + migration event แรกจาก action จริง | REL-01 | Engineering |
| REL-03 | preference UI + event/channel matrix + backlog monitor | REL-02 | Engineering + Product |
| DSC-01 | connect/test/disconnect + encrypted target + delivery adapter | REL-03 | Engineering |
| CRM-01 | list/detail ของลูกค้าจริงพร้อม query isolation และ pagination | FND-02 | Engineering |
| CRM-02 | private notes/tags + empty/loading/error + responsive | CRM-01 | Engineering + Design |
| ANL-01 | นิยาม metric, sample dataset และตรวจ coverage ของ historical event | FND-01 | Product + Engineering |
| ANL-02 | query/report date range + accessible chart/table | ANL-01 | Engineering + Design |
| EXP-01 | CSV จาก query/filter เดียวกับ report + formula injection tests | ANL-02 | Engineering |
| THM-01 | preset/token schema + draft preview + scoped public renderer | FND-02 | Design + Engineering |
| BDG-01 | toggle แบดจ์ + entitlement + fallback เมื่อหมดสิทธิ์ | THM-01 | Engineering |
| BRF-01 | form version/schema + migration legacy fields | FND-02 | Engineering |
| BRF-02 | builder/preset/preview/publish + server validation ใน create order | BRF-01 | Engineering + Design |
| REF-01 | private reference upload + claim + ACL + cleanup + quota | BRF-02 | Engineering |
| PUSH-01 | service worker/subscription + device UI + sender + real-device QA | REL-03 | Engineering + QA |
| CAP-01 | atomic capacity/reservation และกฎ pending-payment/expiry | FND-01 | Engineering + Product |
| WTL-01 | join/leave + opening batch + expiring invitation + claim | CAP-01, REL-03 | Engineering |
| LST-01 | draft/publish listing + immutable terms/price snapshot | FND-02 | Engineering + Design |
| LST-02 | reserve/claim + create order + expiration reconciliation | LST-01, CAP-01 | Engineering |
| AUC-01 | bid/close/anti-snipe state model + invariant/concurrency tests | LST-02, REL-03 | Engineering |
| AUC-02 | public bidding UI + seller console + winner/expiry flows | AUC-01 | Engineering + QA |
| ANL-03 | traffic data contract/consent/retention + collection + coverage UI | ANL-02, Owner decision | Product + Engineering |
| MIL-01 | agreement/transition/money allocation spec + prototype | R1 money/data QA | Product + Engineering |
| MIL-02 | milestone UI/actions + compatibility + private release flow | MIL-01 | Engineering |
| MIL-03 | staging full lifecycle + concurrency + rollback drill | MIL-02 | QA + Engineering |

### รอบงานแรกที่เสนอ: ทำสิ่งใดก่อน

1. **FND-01/02** — สรุปว่าข้อมูลทดสอบแยกจริง และวาง registry; ส่งมอบหลักฐานว่า planned ยังเรียก action ไม่ได้แม้เป็น beta Pro
2. **REL-01/02** — ใช้ event สำคัญชนิดเดียวเป็น vertical slice ตั้งแต่ action → บันทึก → ส่ง → retry → สถานะ จากนั้นจึงขยาย event อื่น
3. **REL-03 + DSC-01** — เปิดทดสอบเฉพาะช่องทางที่เจ้าของกำหนด; ทดสอบข้อความต้องแสดงผู้รับ/ปลายทางก่อนส่ง
4. **CRM-01** — แทน `MOCK_CLIENTS` ด้วย query จริงแบบอ่านอย่างเดียวก่อน; notes/tags ทำใน PR ถัดไป
5. **ANL-01/02 + EXP-01** — ลบตัวเลขจำลองออกจากหน้าที่ปลดล็อก; เริ่มเฉพาะ metric ที่มีหลักฐาน ไม่รอ pipeline page view

เมื่อ R1 ผ่านแล้วประเมิน feedback อีกครั้งก่อนยึด R2–R4 ทั้งชุด หากผู้ใช้ beta ขอธีมหรือฟอร์มมากกว่า Push ให้ขยับสองงานนั้นขึ้นได้โดยไม่ข้าม dependency

## 7. ประมาณการและกำลังทีม

ประมาณการสำหรับผู้พัฒนาหนึ่งคนที่รู้โค้ดเดิม ใช้เครื่องมือช่วยเขียนโค้ด รวม unit/integration/UI QA ของงานนั้น แต่ยังไม่รวมเวลารอ owner, credentials, review ภายนอก หรือแก้ debt ใหญ่ที่พบใหม่ ไม่รวมการสร้างระบบเก็บค่าสมาชิกซึ่งอยู่ใน PLAN.md

| กลุ่มงาน | วันทำงานสุทธิ (ประมาณ) | สิ่งที่ทำให้ช่วงกว้าง |
|---|---:|---|
| FND readiness / flags | 5–8 | staging และ gate ที่ยังไม่ผ่าน |
| REL + preferences + Discord | 8–12 | แทรก event ให้ atomic ใน action เดิมและ worker cadence |
| CRM | 4–7 | query/pagination, notes, ข้อมูลเก่า |
| ANL รุ่นแรก + CSV | 5–8 | historical timestamps และนิยามตัวเลข |
| Theme + badge | 4–7 | accessibility, preview และ downgrade |
| Brief builder | 6–10 | schema version และรักษาคำตอบเก่า |
| Private references | 5–8 | ACL, quota, media lifecycle |
| Push | 5–8 | อุปกรณ์จริงและ lifecycle ของ subscription |
| Capacity + waitlist | 5–8 | reservation และการจัดสรรช่อง |
| Fixed-price listings | 8–12 | order/payment integration และงานแข่งกัน |
| Auctions | 10–16 | close/extend/winner/race และกติกาผิดนัด |
| Milestones | 12–18 | สมการเงิน, compatibility และ release |
| **รวมขอบเขตข้างต้น** | **77–122** | ยังไม่รวม traffic analytics รุ่นขยาย / paid billing |

เผื่อ integration/regression/feedback เพิ่ม 25% จะเป็นประมาณ **96–153 วันทำงาน** หรือ **19–31 สัปดาห์ที่ทำงานเต็มเวลา 5 วัน/สัปดาห์** ทั้งชุด โดย R1 ส่วนแรกประมาณ 22–35 วันสุทธิก่อน buffer ตัวเลขนี้ใช้เห็นขนาดงาน ไม่ควรนำไปประกาศวันขาย; หากทำไม่เต็มเวลาให้คำนวณจากเวลาที่มีจริง และปรับประมาณการหลังส่งมอบแต่ละรุ่น

ตัด scope เพื่อเปิด beta เร็วขึ้นได้: ทำ R0 + R1 ให้จบ แล้วเลือกจาก theme/brief เพียงหนึ่งเรื่อง ส่วนประมูลและ milestone ยังแสดง planned ต่อได้โดยไม่บล็อก closed beta ที่แกนหลักพร้อม

## 8. เกณฑ์ตรวจรับร่วม

### ทุกฟีเจอร์ก่อนเอาป้าย soon ออก

- [ ] ใช้ข้อมูลจริงในส่วนที่ปลดล็อก; mock/demo ไม่ปรากฏเป็นผลของบัญชีผู้ใช้
- [ ] เช็ก owner/capability/plan/quota ฝั่ง server; URL/action ตรงก็ไม่ข้ามสิทธิ์
- [ ] มี empty/loading/error/retry/success และสถานะ partial ที่อธิบายได้
- [ ] TH/EN ครบ, 320/390/768/1024/1440/1920, light/dark, keyboard, screen reader smoke, text/browser zoom 200% และโทรศัพท์จริง
- [ ] ทดสอบ stale tab, double submit, network loss, retry, two-user concurrency ตามผลกระทบของงาน
- [ ] Payload query/action ใช้ allowlist; public/client payload ไม่พก private notes, target secrets หรือ storage keys
- [ ] Unit test ตรวจ invariant จริง; integration test ใช้ PostgreSQL/staging เพื่อพิสูจน์ lock/constraint ไม่ใช่ mock ที่ข้าม concurrency
- [ ] lint/typecheck/build ผ่าน; บันทึก test data / release ID / screenshots โดยลบข้อมูลส่วนตัวและ token
- [ ] migration/rollback/downgrade/reconciliation มี runbook ที่ทำตามได้
- [ ] มีเจ้าของ monitor และเงื่อนไขหยุด rollout; การทดสอบส่งอีเมล/Discord ใช้ปลายทางที่ได้รับอนุญาตเท่านั้น
- [ ] ปรับ pricing, nav, settings และข้อความโฆษณาพร้อมกันจาก capability registry

### กรณีที่ต้องทดสอบข้ามฟีเจอร์

| เหตุการณ์ | ผลที่ต้องรักษา |
|---|---|
| ร้าน A ขอข้อมูล/ไฟล์/CSV/config ของ B | ปฏิเสธโดยไม่เปิดเผยรายละเอียด |
| ปิดฟีเจอร์ระหว่างมีงานค้าง | หยุดสร้างใหม่; อ่าน/ส่งมอบ/ชำระตามข้อตกลงเดิมได้ผ่านเส้นทางรองรับ |
| ปิด beta Pro / ลดแพ็กเกจ | ไม่ลบงาน/ไฟล์/คำตอบ/ประวัติ; ไม่ทำให้ออเดอร์ที่ตกลงแล้วจบไม่ได้ |
| theme สีผิดหรือ schema เก่า | fallback ใช้งานได้; ไม่ทำปุ่มอ่านไม่ออก |
| form เปลี่ยนหลังลูกค้ายืนยัน | snapshot เก่ายังแสดงเหมือนเดิม |
| ยืนยันเงินแล้ว void | CRM / report / order balance / milestone ต้องตรงกัน |
| job ซ้ำหรือ process ตาย | ไม่มี bid winner/reservation/allocation ซ้ำ; external notification duplicate มีการจัดการและติดตาม |
| ลบหรือระงับบัญชี | หยุดสิทธิ์ใหม่และ notification ที่ไม่ควรส่ง; มีนโยบายรักษาประวัติงาน/ไฟล์ตามขอบเขตที่ตกลง |
| อุปกรณ์ร่วมกันเปลี่ยนบัญชี | Push ไม่ส่งข้อมูลบัญชีเดิมให้บัญชีใหม่ |

## 9. วิธีทยอยเปิดและถอยกลับ

1. **Internal:** บัญชีทดสอบบน staging เท่านั้น พร้อม fixtures ที่รู้ผลลัพธ์ ไม่ใช้ role bypass กับ production
2. **Closed beta:** เปิดแบบรายร้าน 3–5 ร้านที่ยินยอม ทดลองอย่างน้อยหนึ่งวงจรงานจริงที่เหมาะกับฟีเจอร์นั้น พร้อมช่องรายงานปัญหา
3. **Expand:** เพิ่มเป็น 10–15 ร้านเมื่อ error, backlog, query latency และ feedback อยู่ในเกณฑ์ที่กำหนดติดต่อกันอย่างน้อย 7 วัน; ระยะนี้เป็นข้อเสนอ ไม่แทนปริมาณเคสที่ต้องทดสอบ
4. **Live:** QA ลงชื่อ, ข้อมูล migration ครบ, มี runbook, แก้ข้อความแพ็กเกจแล้ว จึงเอาป้าย soon ออกเฉพาะส่วนที่พร้อม
5. **Pause:** ถ้าพบข้อมูลข้ามร้าน ยอดผิด winner ซ้ำ หรือไฟล์หลุดสิทธิ์ ให้หยุด write ของ capability นั้น เก็บหลักฐานและตรวจ invariant ก่อนเปิดใหม่

นโยบาย rollback ต้องระบุเป็นรายฟีเจอร์:

- ธีม: render ด้วย preset fallback โดยเก็บ config เดิม
- CRM/analytics: กลับเป็น read-only/ซ่อน report ที่ผิด ไม่ลบโน้ตหรือแถวเงิน
- Notifications: ปิดช่องทางที่เสีย เก็บ outbox ต่อและให้ in-app/หน้าออเดอร์เป็นแหล่งสถานะ; ไม่ replay ทั้งคิวโดยไร้เกณฑ์
- Brief/reference: หยุดเผยแพร่ฟอร์มใหม่ แต่ยังอ่าน snapshot และไฟล์ของงานเดิมได้
- Waitlist/listing/auction: หยุดรับ join/reserve/bid ใหม่ พร้อมรักษาสิทธิ์และ deadline ที่ตกลงแล้ว; kill switch ไม่แปลว่ายกเลิกผู้ชนะ
- Milestone: หยุดสร้าง agreement ใหม่; งานที่มีงวดใช้ compatibility path ที่ทดสอบแล้ว ห้ามย้อน renderer อย่างเดียวจนไม่เห็นงวดค้าง

## 10. วัดผลและความพร้อมขาย

| ฟีเจอร์ | สัญญาณว่ามีคุณค่า | สัญญาณให้หยุด/แก้ก่อนขยาย |
|---|---|---|
| Discord/Push | ผู้เชื่อมต่อเปิดอ่านงานและตอบสนองเร็วขึ้นจาก baseline ของกลุ่มเดิม | ส่งผิดคน, reconnect บ่อย, backlog เกินเกณฑ์, opt-out สูง |
| CRM | ผู้ใช้ค้นประวัติ/ใช้โน้ตซ้ำในสัปดาห์ถัดไป | ตัวเลขไม่ตรง หรือสับสนว่าลูกค้าคนไหน |
| Analytics/CSV | ผู้ใช้ตอบคำถามยอดรับ/งานค้างจาก report ได้ตรง | ตัวเลขกับรายการเงินไม่ตรงแม้แต่หนึ่งเคสที่พิสูจน์ได้ |
| Theme/brief | ร้านบันทึก preset/form และมีลูกค้าส่งบรีฟได้ครบ | completion ลดลง, ฟอร์มยาวเกิน, สีอ่านไม่ได้ |
| Waitlist | เปิดรอบแล้วได้คำขอที่ครบข้อมูลจากคนที่รับเชิญ | invite เกินช่อง, unsubscribe ไม่หยุดส่ง |
| Listing/auction | จองและชำระสำเร็จโดยไม่มี support แก้สิทธิ์มือ | oversell, winner ซ้ำ, ผู้ชนะผิดนัดจำนวนมาก |
| Milestone | งานหลายงวดจบได้โดยยอด reconcile ตรง | จ่ายซ้ำ/ไฟล์ออกก่อนเงื่อนไข/ข้อตกลงเปลี่ยนเงียบ |

เก็บ baseline ก่อนเปิด แล้วตกลง target จากขนาดกลุ่มจริง ไม่ตั้งยอด conversion สมมติในหน้าเว็บ การเก็บ telemetry ใหม่ต้องผ่านขอบเขตข้อมูล/consent/retention ใน PLAN.md และเริ่มจาก event ฝั่ง server ที่ไม่พกเนื้อหาส่วนตัว

**ข้อเสนอแพ็กเกจ:** คงเครื่องมือทำงานพื้นฐานและอีเมลงานสำคัญตามที่ใช้ได้แล้ว ไม่ลดสิทธิ์เพื่อเพิ่มแรงขาย ส่วน CRM ขั้นสูง, analytics/export, custom form/theme, ช่องทางเสริม และประมูลใช้โครง Pro เดิมเมื่อ implementation พร้อม ขณะ beta ยังคงสิทธิ์ Pro ตามสวิตช์เดิม แต่ capability planned ไม่เปิดตามไปด้วย

**เปิดขายไม่ได้ด้วยการปลด soon อย่างเดียว:** ระบบสมาชิก checkout/webhook/reconcile/cancel/downgrade และข้อตกลงบริการใน PLAN.md ต้องพร้อมต่างหาก ห้ามปิด `BETA_FREE_PRO` เพียงเพราะ R1 เสร็จ

## 11. เรื่องที่อยู่ใน FEATURES แต่ไม่ใช่ขอบเขต soon หลักรอบนี้

| รายการ | การจัดการที่เสนอ |
|---|---|
| `notification_prefs` | ทำใน REL เป็นฐานของช่องทางใหม่ |
| `instant_email` | มีการส่งเหตุการณ์สำคัญแล้ว; ไม่สร้างข้ออ้างว่า Free เป็น digest เพราะโค้ดยังไม่มี |
| `line_messaging` | Discovery หลัง Discord มีผู้ใช้จริง; ต้องเลือกผู้รับ/การเชื่อม OA/งบและตรวจเอกสารล่าสุดก่อนเริ่ม ไม่กลับไปใช้ชื่อ LINE Notify |
| `invoice_pdf` | Discovery แยก: ประเภทเอกสาร ข้อมูลผู้ออก เลขที่เอกสาร/การแก้ไข และนโยบายเก็บ ต้องให้เจ้าของกำหนดก่อนออกแบบ; ไม่เรียกทุก PDF ว่าใบกำกับภาษี |
| `team_seats` / Studio | หลัง paid retention มีหลักฐาน; ต้องออกแบบ tenant/member role/audit/seat billing ก่อน ไม่เปิดเพียงเพิ่มจำนวนสมาชิก |
| custom domain, public API, conditional fields, calendar | ยังนอก scope ตามการตัดเดิม; กลับมาพิจารณาเมื่อมีคำขอซ้ำและหลักฐานคุณค่า |

รายการเหล่านี้เป็น backlog ประเมิน ไม่ใช่คำสั่งให้สมัครบริการ ซื้อแพ็กเกจ ส่งข้อความ หรือเปลี่ยนข้อกำหนดทางธุรกิจในตอนนี้

## 12. Decision log ที่ต้องเติมก่อนเริ่มส่วนที่เกี่ยวข้อง

| ประเด็น | ค่าเริ่มต้นที่เสนอ | ต้องได้คำตอบก่อน |
|---|---|---|
| ทีม/เวลาต่อสัปดาห์ | 1 developer; ประมาณการเป็น person-days | แปลงเป็นวันส่งจริง |
| กลุ่มทดลอง | 3–5 ร้านแรก พร้อมช่องทาง feedback | เปิด capability บน production |
| Worker cadence / งบ provider | เลือกจาก event volume และ SLO ทดสอบ; ไม่ถือ cron รายวันว่าพอ | เปิดแจ้งเตือนภายนอก |
| ความเป็นส่วนตัวของ notification | ข้อความทั่วไป+รหัสงาน ค่าเริ่มต้นไม่มีชื่อ/ยอด/brief | DSC/PUSH preview |
| Revenue report date | verified non-void ตาม paidAt, timezone Bangkok, แสดง coverage | ANL query contract |
| Free/Pro และ downgrade | ยึดโครงปัจจุบัน; งานค้างต้องเดินต่อได้ | BDG/custom form และปิด beta |
| ไฟล์อ้างอิง | 5 ภาพ × 10MB เป็นข้อเสนอ; ระบุ quota owner/TTL | REF schema |
| Waitlist | FIFO, invite เป็นชุด, TTL ที่เจ้าของเห็นก่อนส่ง | WTL claim logic |
| Listing/payment timeout | ต้องมี pending-transfer handling ก่อนคืนสิทธิ์ | LST reservation |
| Anti-snipe / winner deadline | 2 นาที / cap 30 นาที / ผู้ชนะ 24 ชั่วโมง เป็นข้อเสนอ | AUC state machine |
| เปลี่ยน scope / refund / released files | บันทึกการยอมรับใหม่; ไม่มี refund อัตโนมัติที่ระบบไม่ได้ทำ | MIL agreement |

ตารางนี้เป็นสิ่งที่ต้องยืนยันเมื่อถึงงานนั้น ไม่บล็อกการทำ FND, เขียน spec, หรือสร้าง fixture ใน staging ที่อยู่ในขอบเขตอนุญาต

## 13. สิ่งที่เสร็จในรอบวางแผนนี้

- [x] ไล่ `soon: true`, `ComingSoonBadge`, `LockedFeature variant="soon"` และข้อความที่สัญญาฟีเจอร์ใน pricing/settings/marketing
- [x] เทียบกับ schema, query, action, notification และการตั้ง cron ใน repository
- [x] แยก 13 ขอบเขต พร้อมสถานะปัจจุบัน MVP/data/UI/QA และสิ่งที่ยังไม่รวม
- [x] จัด dependency, backlog, ประมาณการ, rollout/rollback และ decision log
- [x] เชื่อมแผนนี้จาก PLAN.md / README / roadmap เดิม
- [x] เริ่มพื้นฐาน FND: registry, UI mapping, server guard และ offline preflight (ยังไม่ผ่าน staging)
- [x] ตรวจสถานะโค้ดและจัดชุดเริ่มงาน FND-01 ใหม่เมื่อ 5 ตุลาคม 2026
- [ ] ปิดงาน FND และเริ่ม REL/CRM ตาม dependency พร้อมหลักฐาน integration

แหล่งภายนอกตรวจวันที่ 4 ตุลาคม 2026 และอ้างไว้ตรงข้อที่ใช้: MDN Push API, Discord Rate Limits, Vercel Managing Cron Jobs ต้องตรวจ compatibility/ข้อจำกัดบริการซ้ำเมื่อเริ่ม integration จริง ส่วน schema/ชื่อโมดูลใหม่ทั้งหมดในเอกสารเป็นแบบเสนอ ไม่ใช่ตารางหรือ API ที่สร้างแล้ว

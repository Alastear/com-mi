# เตรียม staging สำหรับ FND

ใช้ประกอบ [FOUNDATION-IMPLEMENTATION.md](FOUNDATION-IMPLEMENTATION.md)
ไฟล์ `.env.local` ที่เชื่อมต่อได้ไม่ใช่หลักฐานว่าแยกจาก production
ห้ามเปลี่ยนเพียง APP_ENV เพื่อให้ preflight ผ่านโดยไม่ได้แยก resource จริง

## สิ่งที่เจ้าของระบบเตรียม

1. ฐานข้อมูลทดสอบที่แยก host/branch จาก production และไม่มีข้อมูลส่วนตัวลูกค้าจริง
2. R2 public/private buckets สำหรับ staging พร้อม credentials แยกกันและแยกจาก production
3. URL แอปทดสอบและ auth origin เดียวกัน รวม public asset origin ที่แยกจาก production
4. Auth secret และ cron secret ใหม่ ไม่ใช้ค่าจาก production
5. `.env.production.audit.local` จาก config production ที่ยืนยันแล้ว สำหรับเปรียบเทียบแบบ offline
   ไม่ส่งค่าลับในแชทหรือ commit เข้า Git

## ไฟล์ target

สร้าง `.env.staging.local` ให้ครบในตัวเอง ค่าด้านล่างเป็น placeholder ต้องแทนค่าจริง
ไม่ copy production ลง target และไม่มีการดึง fallback จาก `.env.local`

```dotenv
APP_ENV=staging
SITE_NOINDEX=1
DATABASE_URL=<isolated-staging-postgres-url>
BETTER_AUTH_SECRET=<new-staging-auth-secret>
BETTER_AUTH_URL=https://<staging-app-host>
NEXT_PUBLIC_APP_URL=https://<staging-app-host>
CRON_SECRET=<new-staging-cron-secret>
R2_ACCOUNT_ID=<account-id>
R2_PUBLIC_BUCKET=<staging-public-bucket>
R2_PRIVATE_BUCKET=<staging-private-bucket>
R2_PUBLIC_BASE_URL=https://<staging-public-assets-host>
R2_PUBLIC_ACCESS_KEY_ID=<staging-public-key-id>
R2_PUBLIC_SECRET_ACCESS_KEY=<staging-public-secret>
R2_PRIVATE_ACCESS_KEY_ID=<staging-private-key-id>
R2_PRIVATE_SECRET_ACCESS_KEY=<staging-private-secret>
EMAIL_FROM=
```

production baseline ต้องมี `APP_ENV=production` และค่าจริงของ DB, app origin,
auth/cron secrets, R2 account/buckets/credentials/public origin เพื่อพิสูจน์ว่าไม่ซ้ำ
preflight ตรวจ config เท่านั้น ไม่ยืนยัน network permissions, OAuth, restore หรือ browser flow

## ลำดับตรวจ

```sh
pnpm beta:check .env.staging.local .env.production.audit.local
```

เมื่อผ่านแล้ว ตรวจ schema ของ staging และ apply migrations โดยระบุ target อย่างชัดเจน
อย่าใช้ `db:migrate` เดิมโดยไม่ตรวจ env เพราะคำสั่งนั้นยังโหลด `.env.local` ได้
จากนั้นใช้ run ID ใหม่สำหรับการตรวจครั้งแรก:

```sh
pnpm db:fixtures create qa-run-01 --target-env .env.staging.local --production-env .env.production.audit.local
pnpm db:fixtures-check qa-run-01 --target-env .env.staging.local --production-env .env.production.audit.local
pnpm db:fixtures clean qa-run-01 --target-env .env.staging.local --production-env .env.production.audit.local
```

`fixtures-check` เรียก context query เดียวกับ capability guard ฝั่ง server เพื่อตรวจ
เจ้าของร้าน ผู้ใช้อีกสามบัญชี และ planned gate จากนั้นตรวจ ownership ของออเดอร์
สุดท้ายทดลอง insert ใน transaction แล้วทำให้ unique constraint ล้มเหลวโดยตั้งใจ
ต้องได้ PostgreSQL error 23505 และไม่มีแถว probe เหลือ จึงรายงาน rollback ผ่าน
network error ไม่ถือว่าผ่าน ไม่มี token หรือ connection string แสดงในรายงาน

ยังต้องทดสอบ session/browser, concurrent actions, media upload/release และ restore แยก
คำสั่งนี้ไม่ยืนยันว่า FND-01 ทั้งหมดหรือ production พร้อมเปิดฟีเจอร์แล้ว

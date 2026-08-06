# com-mi — Commission Platform

แพลตฟอร์มรับงาน commission สำหรับครีเอเตอร์สายภาพ · วิดีโอ · adopts
หน้าร้านสาธารณะ + ระบบหลังบ้านจัดการคิวงาน ในที่เดียว · ไทย / อังกฤษ

> **สถานะ: Phase 0 เสร็จ — ล็อกอิน Google ได้จริง ต่อ Neon จริง**
> เนื้อหาในหน้า (ออเดอร์ · สถิติ · ผลงาน) ยังเป็น mock จาก `lib/mock/data.ts`
> ส่วนผู้ใช้ / session / handle เป็นของจริงจากฐานข้อมูลแล้ว

```bash
pnpm install
cp .env.example .env.development.local   # แล้วเติมค่า (ดูหัวข้อ Environment ด้านล่าง)
pnpm db:migrate                          # สร้างตารางบน Neon
pnpm dev                                 # http://localhost:3450
```

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm db:generate` | สร้างไฟล์ migration จาก schema |
| `pnpm db:migrate` | รัน migration ขึ้น Neon |
| `pnpm db:check` | เช็คว่าต่อ DB ได้ + ดูตารางที่มี |
| `pnpm db:stats` | นับ users / sessions / accounts |
| `pnpm db:seed-session` | สร้าง session ทดสอบ (คืนคุกกี้ที่เซ็นแล้ว) — เทสต์ได้โดยไม่ต้องล็อกอิน Google |
| `pnpm db:clean-session` | ลบผู้ใช้ทดสอบทิ้ง |

หน้าที่ควรเปิดดูก่อน: [`/`](http://localhost:3450/) · [`/nongfah`](http://localhost:3450/nongfah) · [`/orders`](http://localhost:3450/orders) · [`/orders/B2LLZ4`](http://localhost:3450/orders/B2LLZ4) · [`/pricing`](http://localhost:3450/pricing)
สลับภาษาและธีมได้จากไอคอนมุมขวาบนทุกหน้า

---

## เอกสารแผนงาน

| ไฟล์ | เนื้อหา |
|---|---|
| [docs/00-product-overview.md](docs/00-product-overview.md) | โจทย์ · คู่แข่ง · personas · โมเดลธุรกิจ · core loops · non-goals · ความเสี่ยง |
| [docs/01-architecture.md](docs/01-architecture.md) | Stack · rendering & caching · auth · DB · media pipeline · notification · cron · security · งบประมาณ |
| [docs/02-data-model.md](docs/02-data-model.md) | Schema ทุกตาราง · state machine ของออเดอร์ · form builder · index |
| [docs/03-plans-and-entitlements.md](docs/03-plans-and-entitlements.md) | Free vs Pro vs Studio · entitlement layer · Stripe flow · downgrade |
| [docs/04-ux-and-ia.md](docs/04-ux-and-ia.md) | Route map · wireframe · design tokens · i18n · กับดัก a11y/เลเยอร์ที่เจอจริง |
| [docs/05-roadmap.md](docs/05-roadmap.md) | ลำดับการสร้าง Phase 0–4 · definition of done · การตัดสินใจที่ล็อกแล้ว |

---

## สรุปโปรดักต์

ครีเอเตอร์ล็อกอินด้วย Google แล้วได้หน้าร้าน `/@handle` ที่มีเมนูรับงาน ราคา คิว และผลงาน
ลูกค้าสั่งงานผ่านฟอร์มบรีฟที่ครีเอเตอร์ออกแบบเอง ครีเอเตอร์จัดการงานผ่าน Kanban ส่ง WIP ส่งไฟล์จริง
**เงินโอนตรงระหว่างสองฝ่ายผ่าน PromptPay QR — แพลตฟอร์มไม่ถือเงิน** (เลี่ยงใบอนุญาต e-payment ทั้งหมด)

รายได้มาจาก SaaS subscription เก็บจากครีเอเตอร์เท่านั้น ลูกค้าใช้ฟรีเสมอ
Free tier ทำงานครบ loop ได้จริง (รับพร้อมกัน 5 งาน) Pro ปลดล็อกปริมาณ + แจ้งเตือนทันที + ประมูล + ธีม + analytics

---

## สิ่งที่ prototype นี้ทำได้แล้ว

| กลุ่ม | หน้า |
|---|---|
| หน้าบ้าน | landing · pricing (สลับรายเดือน/ปี + ตารางเปรียบเทียบ) · explore · legal |
| หน้าร้าน | `/[handle]` (สถานะร้าน · เมนู · masonry portfolio · รีวิว · TOS) · `/[handle]/s/[slug]` พร้อม flow สั่งงาน 3 ขั้น + คิดราคาสด |
| Backoffice | dashboard · Kanban (ลาก/ดรอป + เมนูสำรองสำหรับคีย์บอร์ด) · หน้าออเดอร์ 3 คอลัมน์ · services · portfolio · settings |
| Pro preview | listings · clients · calendar · analytics — เบลอของจริงไว้ข้างหลังพร้อมปุ่มปลดล็อก |
| ระบบ | 404/error/global-error · robots · sitemap · manifest · OG image ต่อครีเอเตอร์ |

**ต่อของจริงแล้ว (Phase 0):** Neon + Drizzle (4 ตาราง) · Better Auth + Google OAuth ·
`proxy.ts` + `requireSession()` · หน้า sign-in / sign-out · `/onboarding` ตั้ง handle พร้อม reserved list 59 คำ

**ยังไม่ได้ทำ:** Vercel Blob, Stripe, Web Push, cron, ตารางฝั่งโดเมน (order/service/…)

---

## Stack

```
Next.js 16.2 (App Router)  ·  React 19.2  ·  TypeScript strict  ·  Tailwind v4  ·  shadcn/ui
Neon + Drizzle · Better Auth (Google OAuth)
วางแผนต่อ: Vercel Blob · Stripe · Resend · web-push
```

**หลักการควบคุมต้นทุน** — หน้า public cache ด้วย `use cache` + `cacheTag` ไม่แตะ DB,
อัปโหลดตรงจากเบราว์เซอร์ไป Blob (ย่อ + แปลง WebP ก่อนส่ง), session cache ในคุกกี้ 5 นาที,
ไม่มี WebSocket/SSE ค้าง, ปิดประมูลแบบ lazy แทน cron ถี่
→ ประเมิน **~$25–40/เดือน ที่ครีเอเตอร์ active 500 คน**

---

## กติกาที่ต้องรักษาไว้เวลาเขียนต่อ

1. **ห้ามฮาร์ดโค้ดข้อความที่ผู้ใช้เห็น** — ทุกคำผ่าน `lib/i18n/dictionaries.ts` รวมถึงห้ามเขียน `locale === "th" ? … : …` ในหน้าเพจ
2. **ห้ามใช้ `loading.tsx` ที่ segment ซึ่งตัดสิน 404** — จะได้ soft-404 (ดู `docs/01-architecture.md §2`)
3. **สีสถานะต้องวัด contrast บนพื้น tint ของตัวเอง** ไม่ใช่บนพื้นหลังหลัก (`docs/04-ux-and-ia.md §4.5`)
4. **`sr-only sm:not-sr-only` ไม่ใช่ `hidden sm:inline`** สำหรับ label ของปุ่มไอคอน
5. **ตรวจสิทธิ์ในฝั่ง server เสมอ** — ทุก Server Action เริ่มด้วย `requireSession()`; `proxy.ts` เป็นแค่ UX gate (มี CVE เรื่อง middleware auth bypass มาแล้ว)
6. **`auth` และ `db` ต้อง lazy** — สร้าง instance ที่ top level ทำให้ `next build` พังตอน "Collecting page data"
7. **`matcher` ใน `proxy.ts` ต้องเป็น literal** — สร้างด้วย `.map()` ไม่ได้ และเพิ่ม route ใหม่ต้องมาเติมเอง

---

## ก่อน deploy จริง

```bash
pnpm add -g vercel@latest   # CLI ในเครื่องเป็น 50.x ตัวล่าสุด 58.x
vercel link
vercel integration add neon
vercel env pull .env.local --yes
```

**ชื่อแบรนด์: `com-mi`** — โดเมนจริงยังไม่ตัดสิน
ชื่อและ URL ทุกที่อ่านจาก [`lib/site.ts`](lib/site.ts) ตัวเดียว ไม่มีที่ไหนฮาร์ดโค้ด
พอเลือกโดเมนได้แล้ว แก้ `NEXT_PUBLIC_APP_URL` ที่เดียวจบ (แล้วอย่าลืมเพิ่ม redirect URI ใน Google Console)

ยังต้องตัดสิน: โดเมน และระดับ marketplace — ดูท้าย [docs/05-roadmap.md](docs/05-roadmap.md)

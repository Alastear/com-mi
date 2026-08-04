# Commi — Commission Platform

แพลตฟอร์มรับงาน commission สำหรับครีเอเตอร์สายภาพ · วิดีโอ · adopts
หน้าร้านสาธารณะ + ระบบหลังบ้านจัดการคิวงาน ในที่เดียว · ไทย / อังกฤษ

> **สถานะ: UI prototype ใช้งานได้จริงแล้ว (ยังไม่มี DB / auth / server action)**
> ข้อมูลทั้งหมดมาจาก `lib/mock/data.ts` — ลบไฟล์นั้นทิ้งตอนต่อของจริง

```bash
pnpm install
pnpm dev     # http://localhost:3000
```

หน้าที่ควรเปิดดูก่อน: [`/`](http://localhost:3000/) · [`/nongfah`](http://localhost:3000/nongfah) · [`/orders`](http://localhost:3000/orders) · [`/orders/B2LLZ4`](http://localhost:3000/orders/B2LLZ4) · [`/pricing`](http://localhost:3000/pricing)
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

**ยังไม่ได้ทำ** (ตามแผน Phase 0 เป็นต้นไป): Neon + Drizzle, Better Auth, Vercel Blob, Stripe, Web Push, cron

---

## Stack

```
Next.js 16.2 (App Router)  ·  React 19.2  ·  TypeScript strict  ·  Tailwind v4  ·  shadcn/ui
วางแผนต่อ: Neon + Drizzle · Better Auth (Google) · Vercel Blob · Stripe · Resend · web-push
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
5. ตอนต่อ Server Action จริง — **ตรวจสิทธิ์ในฝั่ง server เสมอ** `proxy.ts` เป็นแค่ UX gate

---

## ก่อน deploy จริง

```bash
pnpm add -g vercel@latest   # CLI ในเครื่องเป็น 50.x ตัวล่าสุด 58.x
vercel link
vercel integration add neon
vercel env pull .env.local --yes
```

ยังต้องตัดสิน: ชื่อ/โดเมนจริง (ตอนนี้ใช้ "Commi" ชั่วคราว) และระดับ marketplace — ดูท้าย [docs/05-roadmap.md](docs/05-roadmap.md)

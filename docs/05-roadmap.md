# 05 — Roadmap & Build Order

ประเมินจากคนทำ 1 คน + AI ช่วยเขียนโค้ด ทำจริงจังไม่เต็มเวลา
ตัวเลขสัปดาห์คือ *ลำดับความสำคัญ* มากกว่ากำหนดส่ง — ที่สำคัญคือ **ลำดับ** ต้องไม่สลับ

---

## Phase 0 — รากฐาน (สัปดาห์ 1)

**เป้าหมาย: deploy หน้าเปล่าที่ล็อกอิน Google ได้ ขึ้น production จริง**

- [ ] ตัดสิน 4 คำถามท้ายเอกสารนี้ + เลือกชื่อ + จดโดเมน
- [ ] `pnpm create next-app` — TS, App Router, Tailwind v4, ESLint
- [ ] `cacheComponents: true`, `typedRoutes: true` ใน `next.config.ts`
- [ ] `vercel link` → `vercel integration add neon` → สร้าง Blob store → `vercel env pull .env.local --yes`
- [ ] Drizzle: `schema.ts` (user/session/account/verification), `getDb()` แบบ lazy, `dotenv-cli` สำหรับ drizzle-kit
- [ ] Better Auth + Google OAuth (สร้าง OAuth client ใน Google Cloud Console, ใส่ redirect URI ทั้ง prod และ preview)
- [ ] `proxy.ts` ป้องกัน route กลุ่ม `(app)`
- [ ] shadcn init + globals.css (OKLCH tokens) + next/font (Geist + Noto Sans Thai)
- [ ] **i18n dictionary (th/en) + language switcher — ต้องมาตั้งแต่ Phase 0** เพราะตัดสินใจทำสองภาษาตั้งแต่แรก ห้ามฮาร์ดโค้ดข้อความ
- [ ] App shell: sidebar, topbar, theme toggle, `error.tsx`, `not-found.tsx`, `loading.tsx`
- [ ] Deploy production + ตั้ง Neon branch ผูกกับ preview deployment

**เสร็จเมื่อ:** เข้าเว็บจริง กด "เข้าสู่ระบบด้วย Google" แล้วเห็นหน้า dashboard เปล่าที่มีชื่อตัวเอง

---

## Phase 1 — MVP: loop รับงานจนจบ (สัปดาห์ 2–4) 🎯

**เป้าหมาย: ครีเอเตอร์ 1 คนรับงานจริงจากลูกค้าจริงจนจบได้ — นี่คือหมุดหมายที่สำคัญที่สุดของทั้งโปรเจกต์**

### 1a. หน้าร้าน (สัปดาห์ 2)
- [ ] Schema: `creator_page`, `service`, `service_tier`, `service_option`, `portfolio_item`, `media`
- [ ] Onboarding wizard 4 ขั้น + reserved handle list + เช็ค availability
- [ ] `<MediaUploader>`: client upload ไป Blob + ย่อ/WebP ในเบราว์เซอร์ + thumbhash
- [ ] Service editor + Portfolio manager
- [ ] `/@handle` + `/@handle/s/[slug]` พร้อม `use cache` + `cacheTag` + `updateTag` ตอน save
- [ ] `<ArtImage>`, `<MasonryGrid>`, `<PriceBuilder>`
- [ ] OG image ด้วย `next/og`

**เสร็จเมื่อ:** เอาลิงก์ `/@handle` ไปแปะ bio Twitter ได้แล้วดูดี ← *ตรงนี้คือจุดที่ product มีคุณค่าแล้วแม้ยังรับออเดอร์ในระบบไม่ได้*

### 1b. รับออเดอร์ (สัปดาห์ 3)
- [ ] Schema: `order`, `order_item`, `order_answer`, `message`, `payment_record`, `delivery`
- [ ] `lib/orders/state-machine.ts` + `assertTransition()`
- [ ] ฟอร์มบรีฟ 3 preset + `<FormRenderer>` + Zod runtime validation
- [ ] Flow สั่งงาน 3 ขั้น + บันทึกร่างใน localStorage + login ที่ step 3
- [ ] คำนวณราคาซ้ำฝั่ง server ตอน submit
- [ ] Rate limit (`rate_limit` table) + Vercel BotID บนฟอร์ม

### 1c. จัดการงาน (สัปดาห์ 4)
- [ ] Kanban `/orders` (`@dnd-kit`) + มุมมอง List + filter ผ่าน nuqs
- [ ] `/orders/[code]` — timeline+แชท, ไฟล์, action bar ตามสถานะ
- [ ] `/my/requests/[code]` ใช้ component เดียวกัน (`viewer='client'`)
- [ ] อัปโหลด WIP + ลายน้ำ + ไฟล์ final เป็น private blob
- [ ] `<PromptPayQR>` + บันทึก/ยืนยันการชำระเงิน + gate การดาวน์โหลด
- [ ] แจ้งเตือนในเว็บ (`notification` + polling + badge)
- [ ] อีเมลผ่าน Resend: ออเดอร์ใหม่, สถานะเปลี่ยน, ส่งงานแล้ว

**เสร็จเมื่อ:** 🚀 หาครีเอเตอร์จริง 3–5 คนมาใช้ ให้รับงานจริงจนจบ **แล้วนั่งดูเขาใช้**
อย่าเพิ่งทำ Phase 2 จนกว่าจะมีออเดอร์จบจริงอย่างน้อย 5 ออเดอร์

---

## Phase 2 — เก็บเงินได้ (สัปดาห์ 5–7)

**เป้าหมาย: มีรายได้ก้อนแรก**

- [ ] `lib/billing/plans.ts` + `entitlements.ts` + ใส่ guard ในทุก Server Action ที่เกี่ยวข้อง
- [ ] Schema: `subscription`, `usage_counter`, `webhook_event`
- [ ] Stripe Checkout (card + promptpay, locale th) + Customer Portal
- [ ] Webhook handler แบบ idempotent + logic downgrade/grace period
- [ ] `/pricing` + `/settings/billing` + `<LockedFeature>`
- [ ] **Web Push**: `manifest.ts`, service worker, VAPID, `push_subscription`, หน้าตั้งค่า
- [ ] **Discord webhook** + เข้ารหัส `notification_channel.target`
- [ ] อีเมลทันที (Pro) vs digest รายวัน (Free) + `notification_pref`
- [ ] Milestone + ใบเสนอราคา/ใบเสร็จ PDF
- [ ] Cron ทั้ง 4 ตัว + `CRON_SECRET`
- [ ] Trial 14 วันไม่ผูกบัตร + จุดกระตุ้นอัปเกรดตาม `03-plans §6`
- [ ] Vercel Analytics + Speed Insights

**เสร็จเมื่อ:** มีคนจ่ายเงินคนแรก

---

## Phase 3 — สร้างความต่าง (สัปดาห์ 8–11)

- [ ] **Adopts / YCH**: `listing`, `auction`, `bid` + atomic bid SQL + anti-snipe + lazy close + `/listings`
- [ ] `<CountdownTimer>` + แจ้งเตือนโดนแซง/ใกล้ปิด/ชนะประมูล
- [ ] Waitlist + broadcast "เปิดรับแล้ว" + `opening`
- [ ] CRM ลูกค้า (แท็ก/โน้ต/blacklist) + Analytics + ปฏิทิน + export CSV
- [ ] Form builder เต็มรูปแบบ + conditional field
- [ ] ธีมหน้าร้านแบบปรับเอง
- [ ] `/explore` + ค้นหาด้วย `pg_trgm`
- [ ] เพิ่ม Discord / X login
- [ ] LINE Messaging API (ต้องสมัคร LINE Official Account)
- [ ] ระบบ report + หน้า admin
- [ ] รีวิว + คะแนน

---

## Phase 4 — ขยาย (หลังมีรายได้ต่อเนื่อง)

- [ ] Studio plan: ทีม, สิทธิ์ตามบทบาท, หลายร้าน, custom domain
- [ ] Public API + webhook ขาออก
- [ ] **Escrow ผ่าน Stripe Connect** — *เฉพาะเมื่อผู้ใช้ร้องขอชัดเจนและปริมาณคุ้มกับต้นทุน compliance*
- [ ] แอปมือถือ (PWA ก่อน ค่อยพิจารณา native)
- [ ] Vercel Queues สำหรับ fan-out notification เมื่อ scale ขึ้น

---

## ลำดับที่ห้ามสลับ

| ทำก่อน | เพราะ |
|---|---|
| หน้าร้าน **ก่อน** ระบบออเดอร์ | คุณค่าอันดับแรกคือ "มีลิงก์สวย ๆ แปะ bio" ได้ก่อน |
| ระบบออเดอร์ **ก่อน** ระบบเงิน | ต้องรู้ก่อนว่าคนใช้จริงไหม ก่อนจะไปเสียเวลากับ Stripe |
| Free tier ให้ดี **ก่อน** ทำ paywall | ถ้าไม่มีคนใช้ ก็ไม่มีคนอัปเกรด |
| Notification **ก่อน** Analytics | แจ้งเตือนคือเหตุผลอันดับ 1 ที่คนจะจ่าย analytics คือ nice-to-have |
| Adopts/YCH **หลัง** commission | commission คือแกน adopts เป็นส่วนขยาย |

---

## Definition of Done ต่องาน

- [ ] เช็คสิทธิ์ใน Server Action ไม่ใช่แค่ที่ UI
- [ ] Validate ด้วย Zod ที่ boundary
- [ ] มี loading + error + empty state ครบ
- [ ] ใช้งานบนมือถือได้จริง (ทดสอบที่ 390px)
- [ ] มี `cacheTag` + `updateTag` ถ้าแตะข้อมูลที่ cache
- [ ] คีย์บอร์ดใช้ได้ + focus ring ชัด
- [ ] ข้อความมีทั้งไทยและอังกฤษ (ถ้าถึง Phase 3)

---

## ⚠️ ต้องทำก่อนเริ่ม

1. **อัปเกรด Vercel CLI** — ที่เครื่องเป็น `50.38.3` ตัวล่าสุดคือ `58.4.4`
   ```bash
   pnpm add -g vercel@latest
   ```
2. **Vercel MCP server ยังไม่ได้ authorize** — ถ้าอยากให้ผมจัดการ deployment/log/env ผ่าน MCP ได้โดยตรง
   ต้อง authorize ใน session แบบ interactive (`/mcp` หรือ `claude mcp`) ก่อน
   ระหว่างนี้ใช้ `vercel` CLI ผ่าน terminal แทนได้ทั้งหมด
3. **โปรเจกต์ยังไม่ใช่ git repo** — ควร `git init` ก่อนเริ่มเขียนโค้ด

---

## การตัดสินใจที่ล็อกแล้ว

| # | ประเด็น | ✅ ตัดสินแล้ว | ผลต่อแผน |
|---|---|---|---|
| 1 | **ตลาดหลัก** | **สองภาษาตั้งแต่แรก (ไทย + อังกฤษ)** | i18n เลื่อนจาก Phase 3 → **Phase 0**; ห้ามฮาร์ดโค้ดข้อความตั้งแต่บรรทัดแรก; ต้องมีฟอนต์ไทยและเทสต์เลย์เอาต์ทั้งสองภาษา |
| 2 | **ถือเงินไหม** | **ไม่ถือ (SaaS)** | PromptPay QR + `payment_record` แบบบันทึกเอง; escrow ยกไป Phase 4 แบบ optional; schema รองรับอยู่แล้ว |
| 3 | **เส้นแบ่ง Free/Pro** | **free tier ใจกว้าง — active order 5 งาน** | แรงจูงใจอัปเกรดย้ายไปอยู่ที่ Push/Discord แจ้งเตือน + ประมูล + analytics → **ฟีเจอร์กลุ่มนี้ต้องทำให้ดีจริง ไม่ใช่ทำพอผ่าน** |
| 4 | **ระดับ marketplace** | *(ยังไม่ตัดสิน)* | ค่าเริ่มต้นตามแผน: เครื่องมือล้วนใน Phase 1–2, `/explore` เบา ๆ ใน Phase 3 |
| 5 | **ชื่อ + โดเมน** | *(ยังไม่ตัดสิน)* | ต้องเลือกก่อน deploy จริง เพราะผูกกับ OAuth consent screen และโดเมน; ระหว่างนี้ prototype ใช้ชื่อชั่วคราวไปก่อน |

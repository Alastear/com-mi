# 05 — Roadmap & Build Order

ประเมินจากคนทำ 1 คน + AI ช่วยเขียนโค้ด ทำจริงจังไม่เต็มเวลา
ตัวเลขสัปดาห์คือ *ลำดับความสำคัญ* มากกว่ากำหนดส่ง — ที่สำคัญคือ **ลำดับ** ต้องไม่สลับ

---

## Phase 0 — รากฐาน (สัปดาห์ 1)

**เป้าหมาย: deploy หน้าเปล่าที่ล็อกอิน Google ได้ ขึ้น production จริง**

- [x] `pnpm create next-app` — TS, App Router, Tailwind v4, ESLint
- [x] `typedRoutes: true` ใน `next.config.ts` (`cacheComponents` ยังปิดไว้ รอ data layer จริง)
- [x] Neon provision + `.env.development.local`
- [x] Drizzle: schema (user/session/account/verification), `getDb()` แบบ lazy, `dotenv-cli` สำหรับ drizzle-kit
- [x] Migration รันขึ้น Neon จริง — 4 ตารางพร้อม
- [x] Better Auth + Google OAuth (redirect URI `…/api/auth/callback/google` ตรวจแล้วว่าตรง)
- [x] `proxy.ts` ป้องกัน route กลุ่ม `(app)` + `requireSession()` เป็นชั้นป้องกันจริง
- [x] shadcn init + globals.css (OKLCH tokens) + next/font (Geist + Noto Sans Thai)
- [x] **i18n dictionary (th/en) + language switcher** — ไม่มีข้อความไหนอยู่นอก dictionary
- [x] App shell: sidebar, topbar, theme toggle, `error.tsx`, `global-error.tsx`, `not-found.tsx`
- [x] หน้า sign-in + ปุ่ม sign out + ต่อ session จริงเข้า shell และ dashboard
- [ ] `vercel link` + deploy production + ตั้ง Neon branch ผูกกับ preview deployment
- [ ] `/onboarding` — ตั้ง handle (ตอนนี้ยัง redirect ไปหน้าที่ยังไม่มี)

**เสร็จเมื่อ:** เข้าเว็บจริง กด "เข้าสู่ระบบด้วย Google" แล้วเห็นหน้า dashboard ที่มีชื่อตัวเอง
→ ✅ ทำงานแล้วบน localhost เหลือแค่ deploy ขึ้น production

**ตรวจแล้วว่าใช้ได้จริง:**
`/dashboard` ที่ยังไม่ล็อกอิน → 307 ไป `/sign-in?next=/dashboard` ·
OAuth redirect_uri ตรง · session คืน additionalFields (handle/plan/role) ครบ ·
sign-out ล้าง session ใน DB แล้วคุกกี้เดิมใช้ต่อไม่ได้ · CSRF (`Origin`) ทำงาน

---

## Phase 1 — MVP: loop รับงานจนจบ (สัปดาห์ 2–4) 🎯

**เป้าหมาย: ครีเอเตอร์ 1 คนรับงานจริงจากลูกค้าจริงจนจบได้ — นี่คือหมุดหมายที่สำคัญที่สุดของทั้งโปรเจกต์**

### 1a. หน้าร้าน (สัปดาห์ 2)
- [x] Schema: `creator_page`, `service`, `service_tier`, `service_option`, `portfolio_item`, `media`
- [x] Onboarding + reserved handle list + เช็ค availability (ยังเป็นขั้นเดียว ไม่ใช่ wizard 4 ขั้น)
- [x] เปิดร้านแล้วได้เมนูตั้งต้น 3 รายการทันที — `lib/shop/ensure.ts` เรียกซ้ำได้ปลอดภัย
      และ `/shop` ก็เรียก จึงกู้ผู้ใช้ที่ตั้ง handle ไว้ก่อนมีตารางนี้ได้เอง
- [x] `/[handle]` + `/[handle]/s/[slug]` อ่านจาก DB จริง + gate ร้านที่ยังไม่เผยแพร่
      (เจ้าของเห็น preview คนอื่นได้ 404)
- [x] `/shop` แก้ชื่อ/คำโปรย/about/สถานะ/TOS + ปุ่มเผยแพร่
- [x] `<ArtImage>` รองรับทั้งรูปจริงและ gradient placeholder · OG image อ่านจาก DB
- [x] `<MediaUploader>`: client upload ไป Blob + ย่อ/WebP ในเบราว์เซอร์ + thumbhash
      Blob store `blob-com-mi` (public, sin1) — ตรวจด้วย `pnpm blob:check`
- [x] Service editor (CRUD): `/services` + `/services/[id]` พร้อม tier/option, soft delete, slug ภาษาไทย
- [x] Portfolio manager อ่าน/เขียนจาก DB จริง
- [ ] `use cache` + `cacheTag` + `updateTag` ตอน save (รอเปิด `cacheComponents`)

**เสร็จเมื่อ:** เอาลิงก์ `/@handle` ไปแปะ bio Twitter ได้แล้วดูดี ← *ตรงนี้คือจุดที่ product มีคุณค่าแล้วแม้ยังรับออเดอร์ในระบบไม่ได้*

### 1b. รับออเดอร์ (สัปดาห์ 3)
- [x] Schema: `order`, `order_item`, `order_answer`, `message`, `payment_record`, `delivery` (+ `review`, `rate_limit`)
- [x] `lib/orders/state-machine.ts` + `assertTransition()` — มีเทสต์ครอบว่าทุกสถานะเดินถึง terminal ได้
- [x] ฟอร์มบรีฟ 3 preset + Zod validation ฝั่ง server
- [x] Flow สั่งงาน 3 ขั้น + เก็บร่างใน localStorage + พาไปล็อกอินตอน step 3 โดยไม่เสียข้อมูล
- [x] คำนวณราคาซ้ำฝั่ง server ตอน submit — `quoteOrder()` ตัวเดียวใช้ทั้งสองฝั่ง
- [x] Rate limit บน Postgres (ยืนยันแล้วว่ายิงพร้อมกัน 20 ครั้งผ่านแค่ 5) — Vercel BotID ค่อยเพิ่มตอนขึ้น production

### 1c. จัดการงาน (สัปดาห์ 4)
- [x] Kanban `/orders` บนข้อมูลจริง — HTML5 DnD ไม่ใช่ `@dnd-kit` (bundle เล็กกว่าและพอสำหรับ 5 คอลัมน์)
      ทุกเส้นทางคำนวณจาก state machine · เมนู "ย้ายไป…" ไม่ใช่ทางสำรอง แต่เป็นทางเดียว
      ของการเปลี่ยนสถานะสามแบบที่เกิดในคอลัมน์เดียวกัน
- [x] `transitionOrder` — actor มาจาก session เท่านั้น + compare-and-set กันสองแท็บทับกัน
- [x] `/orders/[code]` — timeline+แชท + action bar ที่ปุ่มมาจาก `allowedNext()` ล้วน
- [x] `/my/requests/[code]` ใช้ `<OrderThread>` + `<OrderActions>` ตัวเดียวกัน ต่างแค่ `actor`
      (ไฟล์แนบยังไม่ได้ทำ — รอ Blob store แบบ private)
- [ ] อัปโหลด WIP + ลายน้ำ + ไฟล์ final เป็น private blob (ต้องมี Blob store ตัวที่สองแบบ private)
- [ ] `<PromptPayQR>` + บันทึก/ยืนยันการชำระเงิน + gate การดาวน์โหลด
- [ ] แจ้งเตือนในเว็บ (`notification` + polling + badge)
- [ ] อีเมลผ่าน Resend: ออเดอร์ใหม่, สถานะเปลี่ยน, ส่งงานแล้ว

**เพิ่มหลัง research คู่แข่ง (docs/00 §3) — เรียงตามความสำคัญ**

- [ ] 🔴 **คำเตือนก่อนแสดง QR ว่าโอนแล้วเรียกคืนไม่ได้** และเปลี่ยนคำปุ่มยืนยันจาก
      "สลิปถูกต้อง" เป็น **"ยืนยันว่าเงินเข้าบัญชีจริงแล้ว (เช็คในแอปธนาคาร ไม่ใช่ดูจากสลิป)"**
      งานหนึ่งชั่วโมง แค่ข้อความ แต่**บล็อกการปล่อย QR** — สลิปปลอมเป็นอุตสาหกรรมในไทยปี 2026
      ทั้งสลิป AI ที่โลโก้ธนาคารถูกต้อง และเทคนิคโอนจริง ฿1 ให้มีแจ้งเตือนแล้วแก้ตัวเลขในภาพ
      ถ้าไม่ทำ เราคือเครื่องมือที่ยกไฟล์งานให้คนโกงเพราะเชื่อภาพปลอม (ดู docs/00 §5.2.1)
- [x] 🔴 **มัดจำเป็นฟิลด์จริง และห้าม `accepted → in_progress` ถ้ายังไม่จ่าย**
      `order.depositCents` + ด่านฝั่ง server ใน `transitionOrder` (ไม่ใช่แค่ซ่อนปุ่ม)
      พ่วงด่าน `→ delivered` ต้องจ่ายครบยอดก่อน ยืนยันด้วยเบราว์เซอร์จริงทั้งสองทาง
      ยังเหลือช่องกรอกมัดจำในหน้าเสนอราคา — รอทำพร้อมระบบชำระเงิน
- [ ] 🟠 **ระบบช่องรายเมนู + ปิดอัตโนมัติเมื่อเต็ม** (`service.slotsTotal/slotsUsed/statusWhenFull`)
      "เปิดรับ 5 ช่อง" คือวิธีที่คนไทยประกาศรับงานจริงบน X · VGen มีครบ เรามีแต่ `slotsTotal`
      ระดับร้านที่ยังไม่มีใครใช้
- [ ] 🟠 **ให้แนบลิงก์ส่งไฟล์ภายนอกได้ในแพ็กเกจฟรี** (`delivery.externalUrl`)
      ปิดช่องว่างเทียบ VGen ที่ให้ 100 MB/ไฟล์ เก็บตลอดไป ฟรีทุกคน (เรา 20 MB / 90 วัน)
      โดยไม่เสียค่าพื้นที่เก็บเลย
- [ ] 🟡 **ปุ่มรายงาน** ที่แค่ส่งอีเมลหาแอดมิน (ยังไม่ต้องมีหน้า admin) + บรรทัดท้ายเธรด
      "ทีมงาน com-mi ไม่มีวันทัก DM ขอให้โอนเงินหรือยืนยันตัวตน" — VGen ต้องประกาศเรื่องนี้มาแล้ว
- [ ] 🟡 นับเฉพาะ `accepted` ขึ้นไปเข้าโควตา `active_orders` + ให้ `quoteExpiresAt` ที่มีอยู่แล้ว
      ทำงานคู่กับ transition `system → expired` — ไม่งั้นคนขอราคาแล้วเงียบสองคน
      กินโควตาฟรีไป 40% แล้วครีเอเตอร์จะโทษกำแพงเงินของเรา

**เสร็จเมื่อ:** 🚀 หาครีเอเตอร์จริง 3–5 คนมาใช้ ให้รับงานจริงจนจบ **แล้วนั่งดูเขาใช้**
อย่าเพิ่งทำ Phase 2 จนกว่าจะมีออเดอร์จบจริงอย่างน้อย 5 ออเดอร์

### ตัดออกแล้ว — อย่ารื้อกลับมาโดยไม่มีหลักฐานใหม่

`custom_domain` · `api_access` · `conditional_fields` · หน้า `/calendar` · ลิมิต `orders_per_month`
เหตุผลรายข้ออยู่ใน `lib/billing/plans.ts` — โดยสรุปคือไม่มีใครขอ ไม่มีใครใช้
หรือขัดกับกลยุทธ์กระจายของเราเอง scope ที่ตัดได้คือกำไรที่ถูกที่สุดที่มี

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

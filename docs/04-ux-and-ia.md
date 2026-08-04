# 04 — UX, Information Architecture & Design System

---

## 1. หลักการออกแบบ 5 ข้อ

1. **งานศิลป์ต้องเด่นที่สุดบนหน้าจอ** — UI เป็นกรอบ ไม่ใช่พระเอก สีเทา/ดำเป็นหลัก ใช้สีเน้นน้อยที่สุด
2. **หนึ่งหน้าจอ = หนึ่งงาน** — หน้าออเดอร์ต้องตอบได้ทันทีว่า "ตอนนี้ต้องทำอะไรต่อ" ด้วยปุ่มหลักปุ่มเดียว
3. **ไม่ต้องเรียนรู้** — ครีเอเตอร์คุ้นกับ Trello/Notion อยู่แล้ว ใช้ metaphor เดิม (การ์ด, คอลัมน์, drag)
4. **โหลดเร็วบนมือถือเน็ตช้า** — คนไทยส่วนใหญ่เปิดจากลิงก์ใน bio บนมือถือ static shell ต้องมาก่อน
5. **ล็อกแบบให้เกียรติ** — ฟีเจอร์ Pro ต้องมองเห็นและเข้าใจว่าทำอะไรได้ ไม่ใช่ซ่อนหรือขวางทาง

---

## 2. Route map

```
app/
├── (marketing)/                      ── static, cache max
│   ├── page.tsx                      / — landing
│   ├── pricing/page.tsx              /pricing
│   ├── explore/
│   │   ├── page.tsx                  /explore — ค้นหาครีเอเตอร์
│   │   └── [kind]/page.tsx           /explore/illustration
│   └── legal/[doc]/page.tsx          /legal/terms, /legal/privacy
│
├── (public)/                         ── 'use cache' + cacheTag
│   ├── @[handle]/
│   │   ├── page.tsx                  /@nong — หน้าร้าน
│   │   ├── s/[serviceSlug]/page.tsx  /@nong/s/full-body — รายละเอียด + สั่ง
│   │   ├── queue/page.tsx            /@nong/queue — คิวสาธารณะ
│   │   ├── portfolio/[id]/page.tsx
│   │   ├── tos/page.tsx
│   │   └── @modal/(.)portfolio/[id]  ── intercepting route → lightbox
│   └── listings/
│       ├── page.tsx                  /listings — adopts & YCH
│       └── [id]/page.tsx             /listings/xxx
│
├── (auth)/
│   ├── sign-in/page.tsx
│   └── onboarding/page.tsx           wizard 4 ขั้น
│
├── (app)/                            ── backoffice ครีเอเตอร์ (dynamic)
│   ├── layout.tsx                    sidebar + topbar + notification bell
│   ├── dashboard/page.tsx            ภาพรวม
│   ├── orders/
│   │   ├── page.tsx                  Kanban / List (สลับได้)
│   │   └── [code]/page.tsx           ⭐ หน้าที่สำคัญที่สุดในระบบ
│   ├── services/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx             editor: ราคา · tier · add-on · ฟอร์ม
│   ├── listings/                     adopts / YCH manager
│   ├── portfolio/page.tsx
│   ├── shop/page.tsx                 แก้หน้าร้าน (โปรไฟล์ · ธีม · TOS · สถานะ)
│   ├── clients/page.tsx              CRM · Pro
│   ├── calendar/page.tsx             Pro
│   ├── analytics/page.tsx            Pro
│   ├── inbox/page.tsx                แจ้งเตือนทั้งหมด
│   └── settings/
│       ├── profile/ · payments/ · notifications/ · billing/ · danger/
│
├── (client)/                         ── ฝั่งลูกค้า
│   ├── my/requests/page.tsx
│   └── my/requests/[code]/page.tsx   ใช้ component ร่วมกับ (app)/orders/[code]
│
└── api/
    ├── auth/[...all]/route.ts
    ├── blob/upload/route.ts
    ├── stripe/webhook/route.ts
    ├── notifications/poll/route.ts
    ├── cron/{daily-digest,sweep-auctions,gc-blobs,expire-quotes}/route.ts
    └── og/[...slug]/route.tsx        OG image ด้วย next/og
```

> **`@[handle]` ไม่ใช่ dynamic segment ธรรมดา** — ใน Next.js `@` ขึ้นต้นโฟลเดอร์ = parallel route
> วิธีทำจริง: ใช้ `app/(public)/[handle]/` แล้วเขียน rewrite ใน `vercel.ts` map `/@:handle` → `/:handle`
> หรือใช้ `[handle]` ตรง ๆ แล้วบังคับให้ handle ทั้งหมดขึ้นต้นด้วย `@` ในลิงก์ที่แสดง (ตัดสินตอน implement — แนะนำแบบ rewrite เพราะ URL สวยกว่าและกัน handle ชนกับ route อื่น)

---

## 3. หน้าจอหลัก

### 3.1 หน้าร้าน `/@handle` — หน้าที่มีคนเห็นเยอะที่สุด

```
┌──────────────────────────────────────────────────┐
│  [ banner 3:1 ]                                  │
│    ◯ avatar   ชื่อครีเอเตอร์                       │
│               tagline สั้น ๆ หนึ่งบรรทัด            │
│               ● เปิดรับงาน · คิว 4 · ~10 วัน       │  ← สถานะสำคัญที่สุด อยู่บนสุด
│               [ 🐦 X ] [ 📷 IG ] [ 🎨 ArtStation ] │
│               ┌──────────────────────────────┐   │
│               │      สั่งงาน / ดูเมนู          │   │  ← CTA หลัก sticky บนมือถือ
│               └──────────────────────────────┘   │
├──────────────────────────────────────────────────┤
│  เมนูรับงาน                                       │
│  ┌────────┐ ┌────────┐ ┌────────┐                │
│  │ [ภาพ]  │ │ [ภาพ]  │ │ [ภาพ]  │                │
│  │ครึ่งตัว │ │เต็มตัว  │ │ อิโมท   │                │
│  │฿800    │ │฿1,500  │ │ ฿300   │                │
│  │~7 วัน   │ │~14 วัน  │ │ ~3 วัน  │                │
│  └────────┘ └────────┘ └────────┘                │
├──────────────────────────────────────────────────┤
│  ผลงาน            [ masonry grid + thumbhash ]    │
├──────────────────────────────────────────────────┤
│  รีวิว ★4.9 (23)   │   ข้อตกลงรับงาน (TOS)         │
└──────────────────────────────────────────────────┘
```
- **Static shell** = banner, ชื่อ, เมนู, ผลงาน → มาจาก CDN ทันที
- **Dynamic island** ใน `<Suspense>` = จำนวนคิวปัจจุบัน, ปุ่มที่เปลี่ยนตามว่า login แล้วหรือยัง
- OG image สร้างด้วย `next/og` → แชร์ลง X/Discord แล้วสวย (สำคัญมากสำหรับการเติบโตแบบ organic)

### 3.2 หน้าสั่งงาน `/@handle/s/[slug]`

Layout 2 คอลัมน์บน desktop / stack บนมือถือ:
- **ซ้าย:** ตัวอย่างงาน (carousel), รายละเอียด, สิ่งที่ได้รับ, จำนวนแก้ไข, TOS ย่อ
- **ขวา (sticky):** ตัวเลือก tier → add-on → **ราคารวมอัปเดตสด** → ปุ่ม "ส่งคำขอ"

ฟอร์มบรีฟเป็น **step ที่ 2** ไม่ใช่หน้าเดียวยาว ๆ:
```
1. เลือกแพ็กเกจ  →  2. กรอกบรีฟ + แนบ reference  →  3. ยืนยัน + ยอมรับ TOS
```
- บันทึกร่างลง `localStorage` ทุก 2 วินาที — ถ้ารีเฟรชหรือกดออกไม่หาย
- **บังคับ login ที่ step 3 เท่านั้น** — กรอกก่อน แล้วค่อยล็อกอิน กลับมาที่เดิม (ลด drop-off ได้มาก)
- ต้องติ๊ก "ฉันได้อ่านและยอมรับข้อตกลง" → บันทึก `tosVersionAccepted`

### 3.3 Kanban `/orders` — หน้าที่ครีเอเตอร์ใช้ทุกวัน

```
┌─ คำขอใหม่ (2) ─┬─ เสนอราคา (1) ─┬─ กำลังทำ (3) ─┬─ รอตรวจ (1) ─┬─ ส่งแล้ว (2) ─┐
│ ┌───────────┐ │ ┌───────────┐  │ ┌──────────┐ │ ┌──────────┐ │              │
│ │[รูป] #7KD2│ │ │  #P3XQ    │  │ │ #M9AA ⚠️ │ │ │ #B2LL    │ │              │
│ │เต็มตัว     │ │ │ ฿2,400    │  │ │ เหลือ 2ว. │ │ │ รอลูกค้า  │ │              │
│ │฿1,500     │ │ │ หมดอายุ 2ว.│  │ │ ●●●○ 75% │ │ │ 3 วันแล้ว │ │              │
│ │2 ชม.ที่แล้ว│ │ └───────────┘  │ └──────────┘ │ └──────────┘ │              │
│ └───────────┘ │                │              │              │              │
└───────────────┴────────────────┴──────────────┴──────────────┴──────────────┘
```
- ลากการ์ดข้ามคอลัมน์ = เปลี่ยนสถานะ (optimistic update + rollback ถ้า server ปฏิเสธ)
- การ์ดโชว์: thumbnail reference, code, ชื่อ service, ราคา, เวลาคงเหลือ, ธงเตือน
- **แถบสีบอกความเร่งด่วน**: เขียว (ปกติ) → เหลือง (< 3 วัน) → แดง (เลยกำหนด)
- มุมมอง List/Table สำหรับคนที่มีงานเยอะ + filter ผ่าน `nuqs` (อยู่ใน URL แชร์ได้)
- บนมือถือ → เปลี่ยนเป็น list แนวตั้งพร้อม filter chip

### 3.4 หน้าออเดอร์ `/orders/[code]` — หน้าที่สำคัญที่สุด

3 คอลัมน์บน desktop:

| ซ้าย (280px) | กลาง (flex) | ขวา (320px) |
|---|---|---|
| สรุปออเดอร์ | **Timeline + แชทรวมสตรีมเดียว** | ไฟล์ |
| ลูกค้า (+โน้ต) | ข้อความ + event ระบบเรียงตามเวลา | reference จากลูกค้า |
| รายการที่สั่ง + ราคา | กล่องพิมพ์ + แนบไฟล์ | WIP (มีลายน้ำ) |
| การชำระเงิน + ปุ่ม QR | | ไฟล์ส่งมอบ (ล็อกจนจ่ายครบ) |
| Milestone (Pro) | | |
| โควตาแก้ไข 1/2 | | |

**Action bar ล่างสุด — ปุ่มหลักปุ่มเดียวเสมอ** ตามสถานะปัจจุบัน:
| สถานะ | ปุ่มหลัก | ปุ่มรอง |
|---|---|---|
| requested | **ส่งใบเสนอราคา** | ปฏิเสธ |
| quoted | (รอลูกค้า) | แก้ไขใบเสนอราคา · ยกเลิก |
| accepted | **เริ่มทำงาน** | |
| in_progress | **ส่ง WIP ให้ตรวจ** | อัปเดตความคืบหน้า |
| in_review | (รอลูกค้า) | ส่ง WIP เพิ่ม |
| revision_requested | **ส่งงานที่แก้แล้ว** | |
| delivered | (รอลูกค้ายืนยัน) | |

> ฝั่งลูกค้า `/my/requests/[code]` ใช้ component ตัวเดียวกัน สลับแค่ prop `viewer='client'`
> ประหยัดโค้ดครึ่งหนึ่งและรับประกันว่าทั้งสองฝั่งเห็นข้อมูลตรงกัน

### 3.5 Onboarding wizard — ต้องจบใน < 10 นาที

```
ขั้น 1  เลือก handle          → เช็ค availability สด ๆ + แนะนำจากชื่อ Google
ขั้น 2  คุณรับงานแบบไหน?      → เลือก 1–3 ประเภท → ระบบ seed service template + ฟอร์มบรีฟให้เลย
ขั้น 3  อัปโหลดผลงาน 3 ชิ้น   → drag & drop, ย่อ+แปลง WebP ในเบราว์เซอร์, ข้ามได้
ขั้น 4  TOS + ช่องทางรับเงิน  → เลือก TOS template (ไทย/อังกฤษ) แก้ได้ + กรอก PromptPay ID
        ────────────────────────────────
        🎉 หน้าร้านพร้อมแล้ว!  [ คัดลอกลิงก์ ] [ แชร์ลง X ]
```
มี progress bar ตลอด, ทุกขั้นข้ามได้แล้วกลับมาทำทีหลัง, แสดง live preview หน้าร้านด้านข้างบน desktop

---

## 4. Design System

### 4.1 สีและธีม — dark-first

ชุมชนอาร์ตใช้โหมดมืดเป็นหลัก และสีเข้มทำให้ภาพงานดูเด่นที่สุด → **default = dark**, มี toggle เป็น light

```css
/* app/globals.css — Tailwind v4 ใช้ CSS-first config ไม่มี tailwind.config.js */
@import "tailwindcss";

@theme {
  --font-sans: var(--font-inter), var(--font-noto-thai), ui-sans-serif, system-ui;
  --radius-card: 0.875rem;
}

:root {
  --bg:            oklch(0.145 0.005 285);   /* เกือบดำ อมน้ำเงินนิด */
  --surface:       oklch(0.190 0.006 285);
  --surface-hover: oklch(0.230 0.007 285);
  --border:        oklch(0.280 0.008 285);
  --text:          oklch(0.960 0.002 285);
  --text-muted:    oklch(0.660 0.010 285);
  --accent:        oklch(0.720 0.170 305);   /* ม่วง — สายอาร์ต/VTuber */
  --accent-fg:     oklch(0.145 0.005 285);
  --success:       oklch(0.720 0.160 155);
  --warning:       oklch(0.780 0.150 75);
  --danger:        oklch(0.640 0.200 25);
}

[data-theme="light"] {
  --bg:      oklch(0.995 0 0);
  --surface: oklch(0.975 0.002 285);
  --border:  oklch(0.910 0.004 285);
  --text:    oklch(0.200 0.005 285);
  /* ... */
}
```

ใช้ **OKLCH** เพราะปรับความสว่างแล้วสีไม่เพี้ยน — สำคัญเมื่อให้ครีเอเตอร์เลือก accent สีเองในธีม Pro
ธีมของครีเอเตอร์ override เฉพาะ `--accent` และ `--surface` **บนหน้าร้านเท่านั้น** ผ่าน inline style tag — UI ของ backoffice ไม่เปลี่ยนตาม (ป้องกันหน้าพัง + ประหยัด CSS)

### 4.2 Typography

```ts
// app/fonts.ts
import { Inter, Noto_Sans_Thai } from 'next/font/google'

export const inter = Inter({
  subsets: ['latin'], variable: '--font-inter', display: 'swap',
})
export const notoThai = Noto_Sans_Thai({
  subsets: ['thai'], weight: ['400','500','600','700'],
  variable: '--font-noto-thai', display: 'swap',
})
```
- **ต้องมีฟอนต์ไทยตั้งแต่แรก** — ฟอนต์ default ของระบบเรนเดอร์ไทยผสมอังกฤษได้แย่มาก (ความสูงบรรทัดกระโดด สระซ้อน)
- `line-height` ภาษาไทยต้องมากกว่าอังกฤษ → ตั้ง `leading-relaxed` เป็น default สำหรับ body
- ตัวเลข/ราคา ใช้ `tabular-nums` เพื่อให้คอลัมน์ราคาตรงกัน

Scale: `text-xs 12 · sm 14 · base 15 · lg 18 · xl 22 · 2xl 28 · 3xl 36`
(base 15px ไม่ใช่ 16 — หนาแน่นกว่านิดเดียว เหมาะกับ dashboard และภาษาไทยยังอ่านสบาย)

### 4.3 Components (shadcn/ui + ที่ต้องสร้างเอง)

**จาก shadcn (`npx shadcn@latest add ...`)**
`button` `card` `dialog` `sheet` `dropdown-menu` `form` `input` `textarea` `select` `checkbox` `radio-group` `switch` `tabs` `badge` `avatar` `tooltip` `popover` `separator` `skeleton` `sonner` `alert` `table` `command` `calendar`

**สร้างเอง (โดเมนเฉพาะ)**
| Component | หน้าที่ |
|---|---|
| `<ArtImage>` | `<Image>` + thumbhash placeholder + aspect ratio + fade-in |
| `<MediaUploader>` | drag&drop + ย่อ/WebP ในเบราว์เซอร์ + progress + client upload ไป Blob |
| `<MasonryGrid>` | CSS columns ล้วน ไม่ใช้ JS library |
| `<PriceBuilder>` | tier + add-on → ราคารวมสด |
| `<FormBuilder>` / `<FormRenderer>` | สร้าง/แสดงฟอร์มบรีฟจาก `formSchema` |
| `<OrderTimeline>` | แชท + system event ในสตรีมเดียว |
| `<KanbanBoard>` | drag & drop (`@dnd-kit`) + optimistic |
| `<StatusPill>` | สถานะออเดอร์ สีสม่ำเสมอทั้งระบบ |
| `<PromptPayQR>` | สร้าง EMVCo payload + render QR ฝั่ง client |
| `<CountdownTimer>` | นับถอยหลังประมูล (sync กับ server time ตอนโหลด) |
| `<LockedFeature>` | ครอบฟีเจอร์ Pro → เบลอ + ปุ่มอัปเกรด |
| `<EmptyState>` | ทุกหน้าว่างต้องมี illustration + CTA ไม่ใช่หน้าโล่ง |

### 4.4 Motion
- Transition สั้น: `150ms ease-out` สำหรับ hover, `250ms` สำหรับ layout
- ใช้ **View Transitions API** สำหรับ portfolio grid → lightbox (native, ไม่ต้องพึ่ง library)
- `<Activity>` ของ React 19 (มากับ `cacheComponents`) เก็บ state ของหน้าที่เพิ่งออกไว้ → กดย้อนกลับแล้ว scroll position และ filter ยังอยู่
- เคารพ `prefers-reduced-motion` ทุกที่

### 4.5 Accessibility

- Focus ring ชัดเจน ห้าม `outline: none` เปล่า ๆ
- Kanban ต้องใช้คีย์บอร์ดได้ (`@dnd-kit` รองรับ) + มีเมนู "ย้ายไป..." เป็นทางเลือก
- ภาพผลงานทุกชิ้นต้องมี `alt` — บังคับกรอกตอนอัปโหลด portfolio (หรือ default เป็นชื่อผลงาน)
- Live region ประกาศเมื่อสถานะออเดอร์เปลี่ยน

**⚠️ Contrast ≥ 4.5:1 — ต้องวัดบนพื้นจริง ไม่ใช่บนพื้นหลังหลัก**

status pill เรนเดอร์เป็น `text-<tone>` บนพื้น `bg-<tone>/12`–`/14` ซึ่ง **ลด contrast ลงอีกราว 0.9**
ชุดสีชุดแรกที่ตาดูโอเคในโหมดมืด พอสลับเป็นโหมดสว่างแล้ววัดจริงได้แค่ **2.60:1** (ต่ำกว่าเกณฑ์ตัวอักษรใหญ่ด้วยซ้ำ)
ค่าที่ใช้อยู่ตอนนี้ผ่านทุกคู่ที่ใช้จริง โดยคู่ที่แย่ที่สุดคือ 4.56:1

| โทน (โหมดสว่าง) | ค่า | บนพื้นหลัก | บน /12 | บน /14 |
|---|---|--:|--:|--:|
| warning | `oklch(0.52 0.145 70)` | 5.57 | 4.71 | 4.58 |
| success | `oklch(0.49 0.145 155)` | 5.61 | 4.72 | 4.58 |
| info | `oklch(0.515 0.15 250)` | 5.54 | 4.66 | 4.52 |
| primary | `oklch(0.545 0.198 305)` | 5.39 | 4.56 | — |

> เวลาปรับสีใหม่ ให้คำนวณ contrast **บนพื้น tint ของตัวเอง** ก่อนเสมอ
> และห้ามใช้ `text-muted-foreground/70` กับข้อความจริง — ในโหมดสว่างเหลือ 2.84:1
> (ใช้ `/50` `/40` `/30` ได้เฉพาะกับสถานะ disabled หรือของตกแต่งที่มีสัญญาณอื่นซ้ำอยู่แล้ว)

**⚠️ ไอคอน lucide เป็น `aria-hidden` โดยอัตโนมัติ**

ปุ่มที่มีแค่ไอคอน + label ที่ซ่อนด้วย `hidden sm:inline` จะ **ไม่มีชื่อเลยบนจอเล็ก**
ต้องใช้ `sr-only sm:not-sr-only` แทน `hidden sm:inline` เสมอ

### 4.6 กับดักการวางเลเยอร์ที่เจอจริง

**avatar ที่ทับ banner ต้องมี `relative`**

`ArtImage` (banner) เป็น `position: relative` ส่วน avatar เป็น static
ตามลำดับการวาดของ CSS **ตัวที่ positioned วาดทับตัวที่ไม่ positioned เสมอ ไม่ว่าจะอยู่หลังใน DOM ก็ตาม**
→ ครึ่งบนของ avatar โดน banner บังทุกครั้งที่ใช้ margin ติดลบดึงขึ้นไป
แก้โดยใส่ `relative` ไว้ใน `ArtAvatar` เลย จะได้ไม่ต้องจำทุกจุดที่เรียกใช้

**overlay ที่ต้องไม่โดนตัด ให้ซ้อนด้วย grid ไม่ใช่ `absolute`**

`LockedFeature` เดิมใช้ `absolute inset-0` ใน wrapper ที่มี `overflow-hidden`
overlay จึงไม่มีความสูงของตัวเอง พอเนื้อหาข้างหลังเตี้ยกว่า overlay (เช่นการ์ด Milestones สูง ~116px
เทียบกับ overlay ~214px) ปุ่มอัปเกรดก็ถูกตัดหายไปเลย
วิธีที่ถูก: วางทั้งสองชั้นในกริดช่องเดียวกัน (`grid *:col-start-1 *:row-start-1`) ความสูงจะคิดจากชั้นที่สูงกว่า

---

## 5. i18n (ไทย / อังกฤษ) — ✅ ตัดสินแล้ว: **สองภาษาตั้งแต่ Phase 1**

> ทำสองภาษาตั้งแต่แรกแปลว่า **ห้ามฮาร์ดโค้ดข้อความในคอมโพเนนต์แม้แต่คำเดียว** ตั้งแต่บรรทัดแรกที่เขียน
> ต้นทุนตอนเริ่มถูกมาก (แค่วินัย) แต่ถ้าย้อนกลับมาทำทีหลังคือรื้อทุกไฟล์

ไม่ใช้ library หนัก — dictionary ธรรมดาพอ และไม่แตะ routing:

```ts
// lib/i18n/index.ts
import th from './th.json'
import en from './en.json'
const DICT = { th, en }
export function getDict(locale: Locale) { return DICT[locale] ?? DICT.th }
```
- Locale มาจาก `profile.locale` (ผู้ใช้ที่ล็อกอิน) หรือ `Accept-Language` (ผู้เยี่ยมชม) → เก็บใน cookie
- **ไม่ใช้ path prefix (`/th/...`)** — ทำให้ cache key แตกเป็นสองเท่าโดยไม่จำเป็น และ URL หน้าร้านต้องสั้นที่สุด
- เนื้อหาที่ครีเอเตอร์เขียนเอง (bio, TOS, service) ไม่แปล — เป็นภาษาที่เจ้าตัวเขียน
- วันที่/ตัวเลข ใช้ `Intl.DateTimeFormat` / `Intl.NumberFormat` ตาม locale
- **สกุลเงิน:** `creator_page.currency` เป็นของครีเอเตอร์ (THB/USD) — ไม่แปลงอัตราให้ เพราะเราไม่ถือเงิน แสดงตามที่เจ้าของตั้งเสมอ เพื่อไม่ให้เกิดความเข้าใจผิดเรื่องยอดที่ต้องโอนจริง
- **ข้อควรระวังเรื่องเลย์เอาต์:** ข้อความไทยยาวกว่าอังกฤษเฉลี่ย 15–30% และตัดคำอัตโนมัติไม่ได้ → ห้ามตั้งความกว้างปุ่ม/การ์ดตายตัว ต้องเทสต์ทั้งสองภาษาที่ 390px

### กฎการเขียนโค้ดที่มาจากการตัดสินใจนี้
```tsx
// ❌ ห้าม
<Button>ส่งคำขอ</Button>

// ✅ ต้อง
const t = useDict()          // client
const t = await getDict()    // server
<Button>{t.order.submit}</Button>
```

---

## 6. หน้าเพจที่มักลืม แต่ต้องมี

| หน้า | ทำไมสำคัญ |
|---|---|
| `not-found.tsx` ต่อ route group | handle ไม่มีจริง ต้องเสนอ "ค้นหาครีเอเตอร์" |
| `error.tsx` + `global-error.tsx` | อย่าให้ผู้ใช้เห็นหน้าขาว |
| `loading.tsx` | คู่กับ PPR — skeleton ที่หน้าตาเหมือนของจริง |
| หน้าร้านที่ยังไม่ publish | เจ้าของเห็น preview + banner "ยังไม่เผยแพร่", คนอื่นเห็น 404 |
| ร้านปิดรับงาน | ยังดูผลงานได้ + ปุ่ม "แจ้งเตือนเมื่อเปิดรับ" (เข้า waitlist) |
| ออเดอร์ที่ถูกยกเลิก | ยังเข้าดูประวัติได้ read-only |
| Interstitial NSFW | ถ้า `isMature` ต้องยืนยันอายุก่อนเข้า |
| `opengraph-image.tsx` | ทุกหน้า public ต้องมี OG ที่ดูดี — เป็นช่องทางเติบโตหลัก |
| `robots.ts` + `sitemap.ts` | sitemap สร้างจากรายชื่อ creator ที่ publish (cache รายวัน) |
| `manifest.ts` + service worker | ต้องมีเพื่อให้ Web Push ทำงาน + ติดตั้งเป็น PWA ได้ |

# 03 — Plans & Entitlements

---

## 1. ปรัชญาการแบ่ง Free / Paid

> **กฎเหล็ก: free tier ต้องทำ loop รับงาน–ส่งงาน–รับเงิน ได้ครบจบ**

เหตุผล — คู่แข่งตัวจริงคือ "Google Form + DM ซึ่งฟรี 100%" (ดู `00-product-overview §3`)
ถ้าเราตัดฟีเจอร์แกนออกจาก free tier จะไม่มีใครย้ายมาตั้งแต่แรก แล้วก็จะไม่มีใครอัปเกรด

**เส้นแบ่งที่เลือกใช้ — แบ่งตาม "ปริมาณ + ความเร็ว + ความเป็นมืออาชีพ" ไม่ใช่ตาม "ความสามารถแกน"**

| มิติ | Free ได้ | Pro ได้เพิ่ม |
|---|---|---|
| **ปริมาณ** | พอสำหรับคนรับงานเป็นครั้งคราว | ไม่จำกัด |
| **ความเร็วแจ้งเตือน** | ในเว็บ + อีเมลสรุปวันละครั้ง | Push ทันที + Discord + LINE |
| **ความเป็นมืออาชีพ** | หน้าร้านมาตรฐาน + badge แพลตฟอร์ม | ธีมเอง, ไม่มี badge, ใบเสร็จ, โดเมนเอง |
| **ระบบอัตโนมัติ** | ทำมือ | Waitlist broadcast, milestone, auto-invoice |
| **ข้อมูลเชิงลึก** | ตัวเลขพื้นฐาน | Analytics + CRM + export |

**ผลลัพธ์ที่ต้องการ:** ครีเอเตอร์ที่งานเริ่มเยอะจะ *รู้สึกเจ็บ* ที่ต้องไปนั่งเช็คเองว่ามีงานเข้าไหม และคิว 3 งานไม่พอ → อัปเกรดเอง
ไม่ใช่รู้สึกว่า "ใช้ไม่ได้เลยถ้าไม่จ่าย"

---

## 2. ตารางเปรียบเทียบฉบับเต็ม

| ฟีเจอร์ | Free | **Pro** ฿159/ด. | Studio ฿499/ด. (Phase 4) |
|---|:--:|:--:|:--:|
| **หน้าร้าน** | | | |
| หน้าร้านสาธารณะ `/@handle` | ✅ | ✅ | ✅ |
| Custom handle | ✅ | ✅ | ✅ |
| ผลงานใน portfolio | 12 ชิ้น | 300 ชิ้น | ไม่จำกัด |
| ธีม/สีเอง | 3 preset | ✅ เต็มรูปแบบ | ✅ |
| ซ่อน badge แพลตฟอร์ม | ❌ | ✅ | ✅ |
| Custom domain | ❌ | ❌ | ✅ |
| หน้าร้านหลายร้าน | ❌ | ❌ | 5 ร้าน |
| **เมนู commission** | | | |
| จำนวน service | 5 | ไม่จำกัด | ไม่จำกัด |
| Tier / add-on ต่อ service | 3 / 5 | ไม่จำกัด | ไม่จำกัด |
| Instant order | ✅ | ✅ | ✅ |
| Custom proposal (ใบเสนอราคา) | ✅ | ✅ | ✅ |
| ฟอร์มบรีฟ | 3 preset แก้ label ได้ | ✅ สร้างเอง + conditional | ✅ |
| **การจัดการงาน** | | | |
| ออเดอร์ที่ active พร้อมกัน | **5** | ไม่จำกัด | ไม่จำกัด |
| ออเดอร์สะสม/เดือน | 20 | ไม่จำกัด | ไม่จำกัด |
| Kanban board | ✅ | ✅ | ✅ |
| คิวสาธารณะ | ✅ | ✅ + ปรับแต่งได้ | ✅ |
| Milestone / งวดงาน | ❌ | ✅ | ✅ |
| ปฏิทิน deadline | ❌ | ✅ | ✅ |
| ติดลายน้ำ WIP อัตโนมัติ | ✅ | ✅ + โลโก้เอง | ✅ |
| **การเงิน** | | | |
| PromptPay QR | ✅ | ✅ | ✅ |
| บันทึกการชำระเงิน | ✅ | ✅ | ✅ |
| ใบเสนอราคา / ใบเสร็จ PDF | ❌ | ✅ | ✅ |
| สรุปรายได้ | เดือนปัจจุบัน | ย้อนหลังทั้งหมด + กราฟ | ✅ |
| **แจ้งเตือน** ⭐ | | | |
| แจ้งเตือนในเว็บ | ✅ | ✅ | ✅ |
| อีเมลสรุป | วันละ 1 ครั้ง | **ทันที** | ทันที |
| **Web Push** | ❌ | ✅ | ✅ |
| **Discord webhook** | ❌ | ✅ | ✅ |
| **LINE** (Phase 3) | ❌ | ✅ | ✅ |
| ตั้งค่าแจ้งเตือนรายเหตุการณ์ | ❌ | ✅ | ✅ |
| **Adopts / YCH** | | | |
| Listing ราคาตายตัว | 3 ที่ active | ไม่จำกัด | ไม่จำกัด |
| **ระบบประมูล + anti-snipe** | ❌ | ✅ | ✅ |
| **ลูกค้า** | | | |
| Waitlist "แจ้งเตือนเมื่อเปิดรับ" | เก็บรายชื่อได้ | ✅ + ยิงแจ้งเตือนทั้งหมดในคลิกเดียว | ✅ |
| CRM (แท็ก/โน้ต/blacklist) | ❌ | ✅ | ✅ |
| ส่งข้อความหาลูกค้าเก่า | ❌ | ✅ | ✅ |
| **อื่น ๆ** | | | |
| พื้นที่เก็บไฟล์ | **300 MB** | **20 GB** | 100 GB |
| ขนาดไฟล์ต่อชิ้น | 20 MB | 200 MB | 500 MB |
| เก็บไฟล์ส่งมอบ | 90 วันหลังปิดงาน | ถาวร | ถาวร |
| Analytics | ❌ | ✅ | ✅ |
| Export CSV / ข้อมูล | ❌ | ✅ | ✅ |
| สมาชิกทีม | ❌ | ❌ | 5 คน |
| Webhook / API | ❌ | ❌ | ✅ |
| ซัพพอร์ต | community | อีเมล | อีเมลแบบเร่งด่วน |

> **ลูกค้า (คนสั่งงาน) ใช้ฟรีทุกอย่างเสมอ** ไม่มีกำแพงใด ๆ

---

## 3. ตัวเลขที่เลือกและเหตุผล

| ลิมิต | ค่า | ทำไมค่านี้ |
|---|---|---|
| ออเดอร์ active | **5** | *(ตัดสินใจแล้ว — เดิมเสนอไว้ 3 แต่เลือกให้ใจกว้างขึ้น)* ครีเอเตอร์งานอดิเรกรับ 1–5 งานพร้อมกันได้สบาย ๆ ตลอด → free tier ใช้จริงได้ไม่อึดอัด ไม่มีเหตุผลให้กลับไปใช้ Google Form; คนที่รับงานเป็นอาชีพจะทะลุ 5 เร็วมากอยู่ดี **ผลที่ตามมา:** แรงจูงใจการอัปเกรดต้องพึ่ง Push/Discord แจ้งเตือน + analytics + ประมูล มากกว่าเพดานคิว → ต้องทำฟีเจอร์กลุ่มนี้ให้ดีจริง |
| service | **5** | เมนูทั่วไปคือ ครึ่งตัว / เต็มตัว / chibi / emote / ไอคอน = 5 พอดี |
| portfolio | **12** | เต็มกริด 3 แถว หน้าร้านดูไม่โล่ง |
| storage | **300 MB** | หลังบีบอัดเป็น WebP (`01-architecture §5`) = ผลงานราว 400–600 ชิ้น — ไม่มีทางเต็มถ้าใช้ปกติ; ไม่ตั้งต่ำกว่านี้เพราะจะกลายเป็นกำแพงที่ทำให้คนเลิกใช้ |
| Pro storage | **20 GB** | ต้นทุนจริง 20 GB × $0.023 = **$0.46/เดือน** เทียบกับรายรับ ฿159 (~$4.4) → margin ปลอดภัยมาก |
| เก็บไฟล์ 90 วัน (free) | | บังคับให้ GC ทำงานจริง ควบคุมต้นทุน storage ระยะยาว; แจ้งเตือนล่วงหน้า 14 วันก่อนลบ |

---

## 4. Implementation

### 4.1 Single source of truth

```ts
// lib/billing/plans.ts
export const FEATURES = [
  'push_notifications', 'discord_webhook', 'line_notify', 'instant_email',
  'milestones', 'custom_form', 'conditional_fields', 'auctions',
  'custom_theme', 'hide_badge', 'custom_domain',
  'analytics', 'crm', 'export', 'invoice_pdf', 'calendar',
  'waitlist_broadcast', 'notification_prefs', 'team_seats', 'api_access',
] as const
export type Feature = (typeof FEATURES)[number]

export const LIMITS = [
  'active_orders', 'orders_per_month', 'services', 'tiers_per_service',
  'options_per_service', 'portfolio_items', 'storage_bytes',
  'file_size_bytes', 'active_listings', 'delivery_retention_days', 'shops', 'seats',
] as const
export type Limit = (typeof LIMITS)[number]

const UNLIMITED = Number.POSITIVE_INFINITY

export const PLANS = {
  free: {
    label: 'Free',
    priceCents: 0,
    features: new Set<Feature>([]),
    limits: {
      active_orders: 5,
      orders_per_month: 20,
      services: 5,
      tiers_per_service: 3,
      options_per_service: 5,
      portfolio_items: 12,
      storage_bytes: 300 * 1024 ** 2,
      file_size_bytes: 20 * 1024 ** 2,
      active_listings: 3,
      delivery_retention_days: 90,
      shops: 1,
      seats: 1,
    },
  },
  pro: {
    label: 'Pro',
    priceCents: 15_900,
    features: new Set<Feature>([
      'push_notifications', 'discord_webhook', 'line_notify', 'instant_email',
      'milestones', 'custom_form', 'conditional_fields', 'auctions',
      'custom_theme', 'hide_badge', 'analytics', 'crm', 'export',
      'invoice_pdf', 'calendar', 'waitlist_broadcast', 'notification_prefs',
    ]),
    limits: {
      active_orders: UNLIMITED,
      orders_per_month: UNLIMITED,
      services: UNLIMITED,
      tiers_per_service: UNLIMITED,
      options_per_service: UNLIMITED,
      portfolio_items: 300,
      storage_bytes: 20 * 1024 ** 3,
      file_size_bytes: 200 * 1024 ** 2,
      active_listings: UNLIMITED,
      delivery_retention_days: UNLIMITED,
      shops: 1,
      seats: 1,
    },
  },
  studio: { /* Phase 4 */ },
} as const satisfies Record<string, PlanDefinition>
```

### 4.2 Entitlement API

```ts
// lib/billing/entitlements.ts
import { PLANS, type Feature, type Limit } from './plans'

export function planOf(user: { plan: string; planUntil: Date | null }) {
  const expired = user.planUntil !== null && user.planUntil < new Date()
  return expired ? PLANS.free : (PLANS[user.plan as keyof typeof PLANS] ?? PLANS.free)
}

export function can(user: SessionUser, feature: Feature): boolean {
  return planOf(user).features.has(feature)
}

export function limitOf(user: SessionUser, key: Limit): number {
  return planOf(user).limits[key]
}

/** โยน PlanLimitError ที่ UI จับไปเปิด upgrade dialog ได้ */
export async function assertWithinLimit(user: SessionUser, key: Limit, nextValue: number) {
  const max = limitOf(user, key)
  if (nextValue > max) throw new PlanLimitError(key, max, nextValue)
}

export async function requireFeature(user: SessionUser, feature: Feature) {
  if (!can(user, feature)) throw new PlanFeatureError(feature)
}
```

### 4.3 บังคับใช้ 3 ชั้น

| ชั้น | ทำอะไร | ตัวอย่าง |
|---|---|---|
| **UI** | แสดง lock badge + "อัปเกรดเป็น Pro" ไม่ซ่อนฟีเจอร์ (คนต้องเห็นว่ามีอะไรให้ปลด) | ปุ่ม "เปิดประมูล" มีไอคอนกุญแจ กดแล้วเด้ง dialog อธิบาย |
| **Server Action** | ✅ **ชั้นที่บังคับจริง** — ทุก action ที่แตะฟีเจอร์ Pro ต้องเรียก guard | `await requireFeature(user, 'auctions')` |
| **Cron / job** | เช็คซ้ำตอนส่งจริง เผื่อ plan หมดอายุระหว่างทาง | ก่อนส่ง web push เช็ค `can(user,'push_notifications')` |

> **ห้ามเช็คแค่ที่ UI เด็ดขาด** — ใครก็เรียก Server Action ตรงได้

### 4.4 อ่าน plan โดยไม่แตะ DB

`user.plan` และ `user.planUntil` เป็น additionalFields ของ Better Auth และอยู่ใน session cookie cache (5 นาที ดู `01-architecture §3`)
→ `can()` / `limitOf()` เป็นฟังก์ชัน **synchronous ล้วน ไม่มี I/O**
→ เรียกได้ทุกที่ทั้งใน RSC และ Server Action โดยไม่มีต้นทุน

หลังจ่ายเงินสำเร็จ Stripe webhook อัปเดต DB แล้ว invalidate session ของ user คนนั้น → รอบถัดไปได้ plan ใหม่ภายใน ≤5 นาที
ระหว่างนั้นหน้า success จะ `refreshSession()` ให้ทันที ผู้ใช้จึงไม่รู้สึกว่ารอ

---

## 5. Billing flow (Stripe)

```
/pricing → เลือก Pro (เดือน/ปี)
  → POST createCheckoutSession()   [Server Action]
     - หา/สร้าง stripeCustomerId ผูกกับ userId
     - mode: 'subscription', locale: 'th'
     - payment_method_types: ['card', 'promptpay']
     - success_url: /settings/billing?success=1
  → Stripe Checkout (hosted — ไม่ต้องทำหน้าจ่ายเงินเอง ไม่ต้องแตะข้อมูลบัตร)
  → webhook /api/stripe/webhook
```

### Webhook ที่ต้องรับ
| Event | ทำอะไร |
|---|---|
| `checkout.session.completed` | สร้าง `subscription` + `user.plan='pro'` + `planUntil` |
| `customer.subscription.updated` | อัปเดต status / period end / plan |
| `customer.subscription.deleted` | `user.plan='free'` |
| `invoice.payment_failed` | `status='past_due'` + ส่งอีเมลเตือน (ยังไม่ตัดสิทธิ์ทันที) |
| `invoice.paid` | ต่ออายุ `planUntil` |

ทุก event เขียนลง `webhook_event` (PK = event id) ก่อนประมวลผล → **idempotent** กัน Stripe ส่งซ้ำ

### Downgrade — ต้องคิดให้ครบ
เมื่อ Pro → Free แล้วข้อมูลเกินลิมิต **ห้ามลบข้อมูลผู้ใช้เด็ดขาด**:
- ออเดอร์ที่ active อยู่แล้ว → ทำต่อจนจบตามปกติ (ลิมิตบังคับเฉพาะ "รับงานใหม่")
- Service ตัวที่ 6 ขึ้นไป → ตั้ง `isActive=false` อัตโนมัติ ครีเอเตอร์เลือกได้ว่าจะเปิดตัวไหน 5 ตัว
- Portfolio เกิน 12 → ซ่อนส่วนเกิน (ยังอยู่ในระบบ) กลับมา Pro แล้วโชว์ทันที
- Storage เกิน → อัปโหลดใหม่ไม่ได้ แต่ไฟล์เดิมไม่ถูกลบ; แจ้งเตือนให้จัดการภายใน 60 วัน
- ธีมกลับเป็น preset, badge กลับมาแสดง

### Grace period
`invoice.payment_failed` → ยังใช้ Pro ต่อได้อีก **7 วัน** พร้อม banner เตือน
ครบ 7 วันหรือ `subscription.deleted` ถึงตัดเป็น free จริง

---

## 6. กลยุทธ์กระตุ้นการอัปเกรด (ทำในโค้ดตั้งแต่แรก)

| จังหวะ | สิ่งที่แสดง |
|---|---|
| ชนเพดานออเดอร์ที่ 5 | Banner บนคิว: "มีคำขอใหม่รออยู่ 2 รายการ — อัปเกรดเพื่อรับเพิ่ม" พร้อมแสดงจำนวนคำขอที่ค้างจริง |
| ได้ออเดอร์ที่ 5 สะสม | Toast: "งานเริ่มเยอะแล้ว! เปิด Push แจ้งเตือนทันทีเพื่อไม่ให้พลาด" |
| เปิดหน้า analytics | หน้าจอ preview ที่มีข้อมูลจริงเบลอไว้ + ปุ่มปลดล็อก (ไม่ใช่หน้าว่าง) |
| เพิ่มคนใน waitlist ครบ 10 | "มี 10 คนรอคุณเปิดรับ — Pro ส่งแจ้งเตือนหาทุกคนได้ในคลิกเดียว" |
| ครบ 14 วันแรก | เสนอ **ทดลอง Pro ฟรี 14 วัน ไม่ต้องผูกบัตร** (ใช้ `planUntil` ไม่ต้องแตะ Stripe) |

> ทั้งหมดนี้ต้องเป็น **contextual** ตอนที่ผู้ใช้เจอปัญหาจริง ไม่ใช่ป๊อปอัปสุ่มขึ้นมา
> ห้ามมี modal บังหน้าจอตอนเพิ่งล็อกอิน — ทำลายความรู้สึก "ใช้ง่าย" ที่เป็นเป้าหมายหลัก

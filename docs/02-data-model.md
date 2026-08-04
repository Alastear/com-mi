# 02 — Data Model

Postgres (Neon) + Drizzle ORM
กติกาทั่วไป: PK เป็น `text` เก็บ **ULID** (เรียงตามเวลาได้ ทำ index ดีกว่า UUIDv4), `created_at`/`updated_at` เป็น `timestamptz`, ราคาเก็บเป็น **integer หน่วยสตางค์** (ห้ามใช้ float กับเงิน)

---

## 1. แผนที่ schema

```
identity            creator                    commerce
─────────           ────────                   ────────
user ──┬─ session   creator_page ──┬─ service ──┬─ service_option
       ├─ account   │              │            └─ service_tier
       └─ profile   ├─ portfolio_item
                    ├─ opening (slot batch)
subscription        └─ listing ── auction ── bid
usage_counter
                              order flow
                              ──────────
                    order ──┬─ order_item      (snapshot ราคา)
                            ├─ order_answer    (คำตอบฟอร์มบรีฟ)
                            ├─ milestone
                            ├─ revision
                            ├─ message ── media
                            ├─ payment_record
                            ├─ delivery
                            └─ review

system: media · notification · notification_pref · push_subscription
        rate_limit · audit_log · webhook_event · report · waitlist_entry
```

---

## 2. Identity & Billing

### `user` (จัดการโดย Better Auth)
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | text PK | |
| name | text | จาก Google |
| email | text unique | |
| emailVerified | boolean | |
| image | text | avatar จาก Google |
| **handle** | text unique nullable | additionalField — ชื่อ URL `/@handle` |
| **plan** | text default `'free'` | `free` \| `pro` \| `studio` |
| **planUntil** | timestamptz nullable | |
| **role** | text default `'user'` | `user` \| `admin` |
| createdAt / updatedAt | timestamptz | |

`session`, `account`, `verification` — ตามที่ Better Auth กำหนด ไม่แก้

> `plan` อยู่บน `user` ไม่ใช่ตารางแยก เพื่อให้อ่านได้จาก session cookie cache โดยไม่ต้อง join

### `profile`
ข้อมูลที่ผู้ใช้แก้เองได้ แยกจาก `user` ที่ Better Auth เขียนทับ
| คอลัมน์ | ชนิด |
|---|---|
| userId | text PK FK→user |
| displayName | text |
| avatarMediaId | text FK→media nullable |
| locale | text default `'th'` |
| timezone | text default `'Asia/Bangkok'` |
| country | text |

### `subscription`
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | text PK | |
| userId | text FK unique | |
| plan | text | |
| status | text | `active` `past_due` `canceled` `trialing` |
| interval | text | `month` \| `year` |
| stripeCustomerId | text | |
| stripeSubscriptionId | text unique | |
| currentPeriodEnd | timestamptz | |
| cancelAtPeriodEnd | boolean | |

`user.plan` คือ **denormalized cache** ของตารางนี้ อัปเดตพร้อมกันใน webhook handler เดียว

### `usage_counter`
นับโควตาโดยไม่ต้อง `COUNT(*)` ทุกครั้ง
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| userId | text | PK ร่วม |
| key | text | `storage_bytes` `active_orders` `services` `portfolio_items` `push_sent_month` |
| period | text | `'lifetime'` หรือ `'2026-08'` |
| value | bigint | |

PK: `(userId, key, period)` — อัปเดตด้วย `INSERT ... ON CONFLICT DO UPDATE SET value = value + $delta`
มี cron รายวัน reconcile กับค่าจริงเผื่อ drift

---

## 3. Creator

### `creator_page`
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | text PK | |
| userId | text FK unique | Phase 1 = 1 คน 1 ร้าน (Studio ค่อยเป็น 1:N) |
| handle | text unique | lowercase, `^[a-z0-9_]{3,30}$`, มี reserved list |
| displayName | text | |
| tagline | text | |
| about | text | markdown จำกัด tag |
| bannerMediaId | text FK→media | |
| **status** | text | `open` `closed` `waitlist` `vacation` ⭐ ชุมชนอาร์ตให้ความสำคัญกับสถานะนี้มาก |
| statusNote | text | เช่น "เปิดรอบหน้า 15 ก.ย." |
| currency | text default `'THB'` | |
| **tos** | text | markdown — ข้อตกลงรับงาน |
| tosVersion | int default 1 | เพิ่มทุกครั้งที่แก้ ผูกกับ `order.tosVersionAccepted` |
| theme | jsonb | `{ accent, surface, font, layout }` — Pro เท่านั้น |
| socials | jsonb | `[{ platform, url }]` |
| isMature | boolean | ธง NSFW → มี interstitial ก่อนเข้า |
| isPublished | boolean | |
| showQueuePublicly | boolean | |
| viewCount | int | เพิ่มแบบ batch ไม่ใช่ทุก request |

**Reserved handles** ต้อง seed ไว้: `api` `app` `admin` `dashboard` `explore` `pricing` `legal` `sign-in` `settings` `orders` `my` `listings` `about` `help` `support` `_next` `static` `blog` `docs`

### `service` — เมนู commission
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | text PK | |
| creatorPageId | text FK | |
| slug | text | unique ร่วมกับ creatorPageId |
| title | text | |
| description | text | markdown |
| **kind** | text | `illustration` `emote` `chibi` `reference_sheet` `animation` `video_edit` `model_3d` `live2d` `adopt` `ych` `design` `other` |
| **mode** | text | `instant` \| `proposal` ⭐ ตามโมเดล VGen |
| basePriceCents | int | |
| deliveryDays | int | |
| revisionsIncluded | int default 2 | |
| extraRevisionPriceCents | int nullable | |
| commercialUsePriceCents | int nullable | ราคาสิทธิ์เชิงพาณิชย์เพิ่ม |
| maxConcurrentSlots | int nullable | จำกัดจำนวนงานประเภทนี้ที่รับพร้อมกัน |
| coverMediaId | text FK→media | |
| **formSchema** | jsonb | ฟิลด์บรีฟที่ครีเอเตอร์ออกแบบเอง (ดู §7) |
| isActive | boolean | |
| sortOrder | int | |

### `service_tier` — ระดับความละเอียด (sketch / flat / full render)
| id | serviceId | label | priceDeltaCents | previewMediaId | sortOrder |

### `service_option` — add-on
| id | serviceId | groupLabel | label | priceDeltaCents | inputType (`checkbox`\|`radio`\|`quantity`) | maxQuantity | sortOrder |

> ราคาสุดท้าย = `basePrice + tier.priceDelta + Σ(option.priceDelta × qty)` — คำนวณทั้งฝั่ง client (แสดงผลสด) และ **ฝั่ง server อีกรอบตอน submit** (อย่าเชื่อราคาจาก client)

### `portfolio_item`
| id | creatorPageId | mediaId | title | tags text[] | linkedServiceId nullable | sortOrder | isFeatured |

`linkedServiceId` ทำให้กดจากผลงานไปสั่งงานแบบนั้นได้เลย — ทางลัดที่เพิ่ม conversion ชัดเจน

### `opening` — รอบเปิดรับงาน
| id | creatorPageId | name | opensAt | closesAt | totalSlots | filledSlots | status |

ใช้คู่กับ `waitlist_entry` เพื่อยิงแจ้งเตือน "เปิดรับแล้ว" (ฟีเจอร์ Pro)

---

## 4. Order flow

### `order`
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | text PK ULID | |
| **code** | text unique | 8 ตัวอักษรอ่านออก (ตัด O/0/I/1) — ใช้ใน URL แทน id |
| creatorPageId | text FK | |
| clientUserId | text FK | |
| serviceId | text FK nullable | nullable เพราะ service อาจถูกลบทีหลัง |
| **status** | text | ดู §5 |
| priority | int default 0 | สำหรับจัดเรียงคิว |
| queuePosition | int nullable | คำนวณตอนเข้าคิว |
| currency | text | |
| subtotalCents / addonsCents / discountCents / **totalCents** | int | |
| amountPaidCents | int default 0 | รวมจาก `payment_record` |
| revisionsUsed | int default 0 | |
| revisionsAllowed | int | snapshot จาก service ตอนสั่ง |
| tosVersionAccepted | int | หลักฐานว่ายอมรับ TOS เวอร์ชันไหน |
| acceptedTosAt | timestamptz | |
| dueAt | timestamptz nullable | |
| quoteExpiresAt | timestamptz nullable | |
| isPublicInQueue | boolean default true | โชว์ในคิวสาธารณะแบบไม่ระบุตัวตน |
| privateNote | text | โน้ตของครีเอเตอร์ ลูกค้าไม่เห็น |
| createdAt / updatedAt / completedAt | timestamptz | |

Index: `(creatorPageId, status, createdAt)`, `(clientUserId, createdAt)`, `code`

### `order_item` — snapshot ที่แช่แข็งแล้ว
| id | orderId | label | kind (`base`\|`tier`\|`option`\|`custom`) | unitPriceCents | quantity | sourceId |

**สำคัญ:** เก็บ label + ราคาเป็นข้อความ ไม่ join กลับไป `service` เพื่อแสดงผล
ถ้าครีเอเตอร์ขึ้นราคาหรือลบ service ทีหลัง ออเดอร์เก่าต้องยังแสดงราคาเดิมได้ (ต้องใช้เป็นหลักฐาน)

### `order_answer` — คำตอบฟอร์มบรีฟ
| id | orderId | fieldKey | fieldLabel | value jsonb |

เก็บ `fieldLabel` ด้วยเหตุผลเดียวกับข้างบน — ครีเอเตอร์แก้ฟอร์มได้ แต่ออเดอร์เก่าต้องอ่านรู้เรื่อง

### `milestone`
| id | orderId | title | amountCents | dueAt | status (`pending`\|`submitted`\|`approved`) | sortOrder | approvedAt |

เช่น sketch 30% → lineart 30% → final 40%

### `revision`
| id | orderId | milestoneId nullable | requestedByUserId | note | attachmentMediaIds text[] | status (`open`\|`addressed`\|`rejected`) | isBillable | createdAt |

### `message` — เธรดผูกกับออเดอร์
| id | orderId | senderUserId | body | attachmentMediaIds text[] | isSystemEvent | createdAt | readByCreatorAt | readByClientAt |

`isSystemEvent = true` ใช้เก็บ event เช่น "สถานะเปลี่ยนเป็น in_progress" → timeline กับแชทอยู่ในสตรีมเดียว UI ง่ายขึ้นมาก

### `payment_record` — บันทึกการชำระ (ไม่ใช่การประมวลผล)
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | text PK | |
| orderId | text FK | |
| milestoneId | text FK nullable | |
| **method** | text | `promptpay` `bank_transfer` `paypal` `stripe_link` `kofi` `other` |
| amountCents | int | |
| paidAt | timestamptz | |
| proofMediaId | text FK nullable | สลิปที่ลูกค้าแนบ |
| **verifiedByUserId** | text nullable | ครีเอเตอร์กดยืนยันว่าเงินเข้าจริง |
| verifiedAt | timestamptz nullable | |
| note | text | |

> ตารางนี้ออกแบบให้รองรับ escrow ในอนาคตด้วย — แค่เพิ่ม `method='stripe_connect'` + `stripePaymentIntentId` แล้วให้ระบบ verify อัตโนมัติแทนคน ไม่ต้อง migrate โครงสร้าง

### `delivery`
| id | orderId | mediaIds text[] | note | licenseType (`personal`\|`commercial`\|`exclusive`) | releasedAt nullable | downloadedAt nullable |

`releasedAt` เป็น null จนกว่า `order.amountPaidCents >= order.totalCents` → signed URL ถึงจะออกให้

### `review`
| id | orderId unique | creatorPageId | clientUserId | rating (1–5) | body | isPublic | creatorReply | createdAt |

รีวิวได้เฉพาะออเดอร์ที่ `status = 'completed'` เท่านั้น

---

## 5. State machine ของออเดอร์

```
                ┌──────────── declined ────┐
                │                          │
  requested ────┼──> reviewing ──> quoted ─┼──> accepted ──> in_progress
      │         │                    │     │                     │
      │         └──> (instant mode ข้ามไป accepted ทันที)         ↓
      │                              │                     ┌─ in_review ─┐
      └──> expired ←─────────────────┘                     │             │
                                                     revision_requested  │
                                                           │             ↓
                                              cancelled ←──┴────────> delivered
                                                                         │
                                                                    completed
```

| สถานะ | ใครทำให้เกิด | อนุญาตให้ไปต่อที่ |
|---|---|---|
| `requested` | ลูกค้าส่งคำขอ | `reviewing` `declined` `expired` |
| `reviewing` | ครีเอเตอร์เปิดอ่าน | `quoted` `declined` |
| `quoted` | ครีเอเตอร์ส่งใบเสนอราคา | `accepted` `declined` `expired` |
| `accepted` | ลูกค้ายอมรับ + ชำระ (หรือมัดจำ) | `in_progress` `cancelled` |
| `in_progress` | ครีเอเตอร์เริ่มงาน | `in_review` `cancelled` |
| `in_review` | ครีเอเตอร์ส่ง WIP ให้ดู | `revision_requested` `delivered` |
| `revision_requested` | ลูกค้าขอแก้ | `in_progress` |
| `delivered` | ครีเอเตอร์ส่งไฟล์จริง | `completed` |
| `completed` | ลูกค้ายืนยันรับงาน / ผ่านไป 7 วันอัตโนมัติ | — |
| `declined` `cancelled` `expired` | terminal | — |

implement เป็นตารางเดียวใน `lib/orders/state-machine.ts`:
```ts
const TRANSITIONS: Record<Status, { to: Status; by: Actor[] }[]> = { ... }
export function assertTransition(from: Status, to: Status, actor: Actor) { ... }
```
ทุก transition เขียน `message` แบบ `isSystemEvent` + `audit_log` + ยิง notification ในฟังก์ชันเดียว

---

## 6. Adopts / YCH

### `listing`
| id | creatorPageId | kind (`adopt`\|`ych`\|`base`\|`preset`) | title | description | mediaIds text[] | **saleType** (`fixed`\|`auction`) | priceCents nullable | slots int default 1 | slotsSold int | status (`draft`\|`live`\|`sold`\|`ended`) | isMature |

### `auction`
| id | listingId unique | startPriceCents | minIncrementCents | autobuyPriceCents nullable | startsAt | **endsAt** | antiSnipeSeconds default 300 | currentBidCents | currentBidderId | bidCount | status (`scheduled`\|`open`\|`closed`\|`cancelled`) |

### `bid`
| id | auctionId | userId | amountCents | createdAt | isAutobuy |

**การวางบิดต้อง atomic** — เขียนเป็น UPDATE เดียวที่มี guard ครบ:
```sql
UPDATE auction
SET current_bid_cents = $amount,
    current_bidder_id = $user,
    bid_count         = bid_count + 1,
    ends_at = CASE WHEN ends_at - now() < make_interval(secs => anti_snipe_seconds)
                   THEN now() + make_interval(secs => anti_snipe_seconds)
                   ELSE ends_at END          -- anti-snipe ต่อเวลาอัตโนมัติ
WHERE id = $id
  AND status = 'open'
  AND ends_at > now()
  AND $amount >= current_bid_cents + min_increment_cents
RETURNING *;
```
ถ้าไม่มีแถวกลับมา = บิดไม่ผ่าน (ช้าไป / ต่ำไป / ปิดแล้ว) แสดง error ตรง ๆ

**การปิดประมูล** ทำแบบ lazy (ดู `01-architecture §7`) + cron backstop รายวัน
ปิดแล้วสร้าง `order` ให้ผู้ชนะอัตโนมัติที่สถานะ `accepted` พร้อมยอด = ราคาปิด

---

## 7. Form builder schema (`service.formSchema`)

ฟอร์มบรีฟที่ครีเอเตอร์ออกแบบเอง เก็บเป็น JSON แทนที่จะสร้างตารางต่อฟิลด์

```ts
type FormSchema = {
  version: 1
  fields: Array<{
    key: string                    // stable key, ห้ามเปลี่ยนหลังมีออเดอร์แล้ว
    label: string
    type: 'text' | 'textarea' | 'select' | 'multiselect' | 'number'
        | 'checkbox' | 'file' | 'url' | 'color' | 'date'
    required?: boolean
    placeholder?: string
    help?: string
    options?: Array<{ label: string; value: string }>
    maxFiles?: number              // สำหรับ type: 'file'
    showWhen?: { key: string; equals: string }   // conditional — Pro เท่านั้น
  }>
}
```

**Free tier** ได้ฟอร์ม preset 3 แบบให้เลือก (ตัวละคร / อิโมท / วิดีโอ) แก้ label ได้ แต่เพิ่ม/ลบฟิลด์ไม่ได้
**Pro** สร้างฟอร์มเองได้เต็มรูปแบบ + conditional field

Validate ด้วย Zod ที่สร้างจาก schema แบบ runtime:
```ts
export function buildZodFromFormSchema(s: FormSchema): z.ZodType { ... }
```

---

## 8. Media

### `media`
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| id | text PK | |
| ownerUserId | text FK | |
| orderId | text FK nullable | |
| **kind** | text | `avatar` `banner` `portfolio` `service_cover` `reference` `wip` `final` `payment_proof` `listing` |
| pathname | text | path ใน Blob store (ใช้ตอน `del()`) |
| url | text | |
| access | text | `public` \| `private` |
| contentType | text | |
| bytes | bigint | |
| width / height | int | |
| **thumbhash** | text | ~28 bytes → placeholder โดยไม่ต้องยิง request |
| variantOf | text FK nullable | ชี้ไปไฟล์ต้นทาง (thumb/display ชี้ไป original) |
| variantLabel | text nullable | `thumb` \| `display` \| `original` |
| isWatermarked | boolean | |
| **status** | text | `orphan` → `linked` (ดู GC ใน `01-architecture §5`) |
| createdAt | timestamptz | |

---

## 9. Notifications

### `notification`
| id | userId | type | title | body | url | entityType | entityId | readAt nullable | createdAt |

Index: `(userId, readAt, createdAt DESC)` — partial index `WHERE read_at IS NULL` ทำให้นับ unread ถูกมาก

### `notification_pref`
| userId | eventType | channels text[] | PK `(userId, eventType)` |

`eventType`: `order.created` `order.accepted` `order.message` `order.revision` `order.paid` `order.completed` `auction.outbid` `auction.ending` `auction.won` `deadline.soon` `waitlist.opened` `system.billing`
`channels`: `inapp` `email` `push` `discord` `line`

### `push_subscription`
| id | userId | endpoint unique | p256dh | auth | userAgent | createdAt | lastSuccessAt | failCount |

`failCount >= 5` → ลบทิ้ง (endpoint ตายแล้ว)

### `notification_channel` — ปลายทางภายนอก
| id | userId | channel (`discord`\|`line`\|`email_alt`) | target (webhook URL / token) | isEnabled | verifiedAt |

`target` ต้อง **เข้ารหัสก่อนเก็บ** (webhook URL ของ Discord = ความลับ ใครได้ไปสแปมได้)

---

## 10. System

| ตาราง | คอลัมน์ | ใช้ทำอะไร |
|---|---|---|
| `rate_limit` | `key` PK, `tokens` int, `resetAt` | token bucket ใน Postgres — upsert เดียวจบ ไม่ต้องมี Redis |
| `audit_log` | id, actorUserId, entityType, entityId, action, diff jsonb, ip, createdAt | หลักฐานเวลามีข้อพิพาท + debug |
| `webhook_event` | id (event id จาก Stripe) PK, type, processedAt | กัน replay / duplicate |
| `waitlist_entry` | id, creatorPageId, userId, serviceId nullable, notifiedAt | "แจ้งเตือนเมื่อเปิดรับ" — ฟีเจอร์ Pro |
| `report` | id, reporterUserId, entityType, entityId, reason, status, handledBy | abuse report |

---

## 11. หมายเหตุด้าน performance

1. **ห้าม `COUNT(*)` บนหน้าที่โหลดบ่อย** — ใช้ `usage_counter` และคอลัมน์ denormalized (`auction.bidCount`, `opening.filledSlots`)
2. **Partial index** สำหรับ query ที่ใช้จริง:
   ```sql
   CREATE INDEX ON "order" (creator_page_id, created_at DESC)
     WHERE status IN ('requested','reviewing','quoted','accepted','in_progress','in_review','revision_requested');
   CREATE INDEX ON notification (user_id, created_at DESC) WHERE read_at IS NULL;
   CREATE INDEX ON auction (ends_at) WHERE status = 'open';
   ```
3. **Full-text search** ใช้ `pg_trgm` + GIN บน `creator_page.display_name` และ `service.title` — ไม่ต้องต่อ search engine แยก
4. **JSONB เท่าที่จำเป็น** — `formSchema`, `theme`, `socials`, `audit_log.diff` เท่านั้น ที่เหลือเป็นคอลัมน์จริงเพื่อให้ index ได้
5. **Soft delete เฉพาะที่จำเป็น** — `service` และ `creator_page` ใช้ `deletedAt` (เพราะออเดอร์เก่าอ้างถึง), ที่เหลือลบจริง

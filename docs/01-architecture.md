# 01 — Architecture & Cost Strategy

---

## 1. Stack (เวอร์ชันที่ตรวจสอบจาก npm registry แล้ว ณ ส.ค. 2026)

| ชั้น | เทคโนโลยี | เวอร์ชัน | เหตุผล |
|---|---|---|---|
| Framework | **Next.js** (App Router) | `16.2.12` | ตามที่ระบุ + Cache Components/PPR ช่วยลดต้นทุน DB โดยตรง |
| UI runtime | **React** | `19.2.8` | มากับ Next 16 |
| Language | **TypeScript** | `5.x` strict | |
| Styling | **Tailwind CSS** | `4.3.3` | CSS-first config, ไม่ต้องมี `tailwind.config.js` |
| Components | **shadcn/ui** (บน Base UI) | latest | copy-in ไม่ใช่ dependency → คุม bundle ได้เอง |
| DB | **Neon Postgres** | — | ตามที่ระบุ, scale-to-zero |
| DB driver | **@neondatabase/serverless** | `1.1.0` | HTTP driver ไม่ต้องมี connection pool → Neon หลับได้จริง |
| ORM | **Drizzle ORM** | `0.45.2` | SQL-first, bundle เล็ก, migration เป็นไฟล์ SQL อ่านออก |
| Auth | **Better Auth** | `1.6.25` | ดู §3 |
| Storage | **@vercel/blob** | `2.6.1` | ตามที่ระบุ + รองรับ private blob แล้ว |
| Billing | **stripe** | `22.4.0` | Stripe เปิดให้ธุรกิจไทยแล้ว + PromptPay + subscription |
| Email | **resend** | `6.18.1` | free 3,000 ฉบับ/เดือน, React Email |
| Web Push | **web-push** | `3.6.7` | VAPID, ไม่ต้องพึ่ง vendor |
| Validation | **zod** | `4.4.3` | |
| URL state | **nuqs** | `2.9.4` | filter/tab state ใน URL → ลด client state, แชร์ลิงก์ได้ |
| Charts | **Recharts** หรือ SVG เอง | — | เฉพาะหน้า analytics (lazy load) |

### สิ่งที่ตั้งใจ *ไม่* ใส่
- ❌ Redis / Upstash — rate limit ทำใน Postgres ได้ ไม่ต้องเพิ่ม vendor + ค่าใช้จ่าย
- ❌ tRPC — Server Actions + Zod ครอบคลุมแล้ว
- ❌ Prisma — engine binary ใหญ่ ทำ cold start แย่ลง
- ❌ Edge Runtime — Vercel เลิกแนะนำแล้ว, Fluid Compute ให้ Node.js เต็มรูปแบบในราคาเท่ากัน
- ❌ State library (Redux/Zustand) — RSC + Server Actions + nuqs พอ

---

## 2. Rendering strategy — หัวใจของการประหยัดทรัพยากร

เปิด Cache Components:

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,   // เปิด `use cache` + cacheLife + cacheTag + PPR เป็น default
  images: {
    // ดู §5 — เราจะไม่ใช้ Vercel Image Optimization
    unoptimized: true,
  },
  typedRoutes: true,
}

export default nextConfig
```

> `cacheComponents` รวม flag `ppr`, `useCache`, `dynamicIO` ไว้ในตัวเดียว และ `experimental.ppr` ถูกถอดออกแล้วใน v16
> ทุกอย่าง **dynamic by default** — เราเลือกเองว่าจะ cache ตรงไหน

### แผนที่การ render ต่อหน้า

| หน้า | กลยุทธ์ | cacheLife | invalidate ด้วย |
|---|---|---|---|
| `/` landing, `/pricing`, `/legal/*` | static ล้วน | `max` | deploy |
| `/@[handle]` หน้าร้าน | `use cache` + `cacheTag('creator:'+handle)` | `hours` | `updateTag()` ตอนครีเอเตอร์กด save |
| `/@[handle]/s/[slug]` | `use cache` + `cacheTag('service:'+id)` | `hours` | `updateTag()` |
| `/@[handle]/queue` คิวสาธารณะ | `use cache` + `cacheTag('queue:'+creatorId)` | `minutes` | `updateTag()` ตอนสถานะ order เปลี่ยน |
| `/explore` | `use cache` | `hours` | cron รายวัน |
| `/listings/[id]` ประมูล | static shell (ภาพ/รายละเอียด) + `<Suspense>` ครอบราคาปัจจุบัน | shell = `hours` | `updateTag('auction:'+id)` ทุกครั้งที่มีบิด |
| `/dashboard/**` backoffice | dynamic ทั้งหมด ไม่ cache | — | — |
| `/my/**` ฝั่งลูกค้า | dynamic | — | — |

**ผลลัพธ์:** traffic ส่วนใหญ่ (คนกดลิงก์จาก bio Twitter มาดูหน้าร้าน) จะถูกเสิร์ฟจาก CDN cache **โดยไม่แตะ Neon เลย**
ซึ่งสำคัญมากเพราะ Neon free plan ให้ **100 CU-hours/เดือน** และหลับหลังไม่มี query 5 นาที ([Neon pricing](https://neon.com/pricing)) — ถ้าปล่อยให้ทุก pageview ยิง query, DB จะตื่นตลอดเวลาและโควตาหมดใน ~2 สัปดาห์

### ตัวอย่างรูปแบบที่จะใช้จริง

```ts
// lib/queries/creator.ts
import { cacheLife, cacheTag } from 'next/cache'

export async function getCreatorPage(handle: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(`creator:${handle}`)

  return db.query.creatorPage.findFirst({
    where: eq(creatorPage.handle, handle),
    with: { services: true, portfolio: { limit: 12 }, reviews: { limit: 5 } },
  })
}
```

### ⚠️ กับดัก: `loading.tsx` ทำให้ 404 กลายเป็น 200 (soft-404)

**เจอจริงตอนสร้าง prototype และแก้แล้ว — อย่าเผลอทำซ้ำ**

วาง `loading.tsx` ไว้ที่ `app/(public)/[handle]/` → Next สร้าง Suspense boundary ครอบ segment นั้น
**และ segment ลูกทั้งหมด** แล้วเริ่ม stream response ทันที
header `200` จึงถูกส่งออกไปก่อนที่ page จะได้เรียก `notFound()`

ผลลัพธ์: `/handle-ที่ไม่มีอยู่` คืน **HTTP 200 พร้อมเนื้อหาหน้า 404**
Google จะ index หน้าที่ไม่มีอยู่จริง — ร้ายแรงมากสำหรับโปรดักต์ที่โตด้วยการแชร์ลิงก์หน้าร้าน

| วิธีแก้ | ได้ผลไหม | หมายเหตุ |
|---|---|---|
| ย้ายการเช็คไปที่ `layout.tsx` ของ `[handle]` | ✅ สำหรับ segment นั้น | layout รันจบก่อน fallback ถูกส่งออก |
| เพิ่ม `layout.tsx` ที่ `s/[slug]` ด้วย | ❌ | layout ลูกยังอยู่ใน boundary ของ `loading.tsx` ตัวบน — ยังคืน 200 |
| **ไม่ใช้ `loading.tsx` เลย ใช้ `<Suspense>` ครอบเฉพาะส่วนที่ดึงข้อมูลในหน้า** | ✅ ทั้ง subtree | **เลือกวิธีนี้** — และตรงกับ PPR ที่วางไว้อยู่แล้ว |

โครงที่ใช้จริง: `app/(public)/[handle]/layout.tsx` เช็คว่ามี handle นี้จริงไหม (404 เร็วและถูกต้อง)
ส่วน skeleton อยู่ใน `components/creator-page-skeleton.tsx` รอเอาไปใส่ `<Suspense>` ตอนมี data layer

> ตรวจ regression ด้วยคำสั่งเดียว:
> ```bash
> curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3450/handle-ที่ไม่มีอยู่   # ต้องได้ 404
> ```

### ⚠️ กับดัก: `params` ไม่ถูกถอด percent-encoding (เจอตอนทำ service editor)

Next ส่งค่าใน `params` มา **ดิบ ๆ ตามที่อยู่ใน URL** ไม่ได้ `decodeURIComponent` ให้

`/@somchai/s/วาดภาพครึ่งตัว` → `params.slug === "%E0%B8%A7%E0%B8%B2%E0%B8%94..."`
เอาไปเทียบกับ slug ใน DB จึงไม่มีวันตรง หน้าเมนูภาษาไทยขึ้น 404 ทั้งหมด

อันตรายเป็นพิเศษเพราะ **slug ภาษาอังกฤษไม่มีอะไรให้เข้ารหัส เลยผ่านปกติ** —
เทสต์ด้วยข้อมูลอังกฤษอย่างเดียวจะไม่เจอบั๊กนี้เลย ทั้งที่ผู้ใช้จริงเป็นคนไทย

ถอดที่ชั้น query จุดเดียว (`lib/queries/creator.ts`) ไม่ใช่ที่แต่ละ page —
`params` ถูกอ่านจากหลายที่ (page, `generateMetadata`, layout, `opengraph-image`)
ลืมที่ใดที่หนึ่งจะพังเฉพาะทางนั้นแบบเงียบ ๆ

เรื่องเดียวกันกับ slug: regex ต้องมี `\p{M}` ด้วย ไม่ใช่แค่ `\p{L}`
สระบน/ล่างและวรรณยุกต์ไทย (ิ ึ ั ่ ้) เป็น Mark ไม่ใช่ Letter
ถ้าตัดทิ้ง "ครึ่ง" กับ "ครัง" จะเหลือ "ครง" เหมือนกัน คนละคำแต่ slug ชนกัน

```ts
// app/(app)/page/actions.ts
'use server'
import { updateTag } from 'next/cache'

export async function saveCreatorPage(input: Input) {
  const { user } = await requireSession()
  const parsed = CreatorPageSchema.parse(input)
  await db.update(creatorPage).set(parsed).where(eq(creatorPage.userId, user.id))
  updateTag(`creator:${parsed.handle}`)   // cache หน้าร้านถูกล้างทันที
}
```

---

## 3. Authentication

### เลือก Better Auth ไม่ใช่ Auth.js/NextAuth

Auth.js ประกาศรวมเข้ากับ Better Auth และทีม Auth.js เองแนะนำให้โปรเจกต์ใหม่ใช้ Better Auth
([Neon guide](https://neon.com/guides/nextauth-neon-auth-better-auth-postgres), [LogRocket 2026](https://blog.logrocket.com/best-auth-library-nextjs-2026/))
สำหรับสแตก Drizzle + Neon โดยเฉพาะ Better Auth มี adapter ตรงและ type-safe เต็มรูปแบบ

```ts
// lib/auth.ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,      // 30 วัน
    updateAge: 60 * 60 * 24,           // ต่ออายุวันละครั้ง (ลด write ลง DB)
    cookieCache: { enabled: true, maxAge: 5 * 60 },  // ⭐ สำคัญมาก — ดูด้านล่าง
  },
  user: {
    additionalFields: {
      handle:    { type: 'string', required: false },
      plan:      { type: 'string', defaultValue: 'free' },
      planUntil: { type: 'date',   required: false },
    },
  },
})
```

### ⚠️ กับดัก: `auth` instance ต้อง lazy เหมือน `getDb()`

**เจอจริงตอนทำ Phase 0 — `next build` พังทั้ง build**

`betterAuth({ database: drizzleAdapter(getDb(), …) })` ที่เขียนไว้ระดับโมดูล จะเรียก `getDb()`
ตั้งแต่ตอนที่ Next ประเมินโมดูลของ route ในขั้น **"Collecting page data"** ระหว่าง build
→ `Error: DATABASE_URL is not set` → build ตาย

เกิดได้สองสถานการณ์:
1. build ในเครื่อง — production build **ไม่โหลด `.env.development.local`** (โหลดแค่ `.env.local`, `.env.production*`, `.env`)
2. deploy ครั้งแรก — ก่อน env ถูก provision

```ts
// lib/auth.ts — singleton แบบ lazy
let _auth: ReturnType<typeof createAuth> | null = null;
export function getAuth() {
  if (!_auth) _auth = createAuth();
  return _auth;
}

// app/api/auth/[...all]/route.ts — เรียกข้างใน handler ไม่ใช่ที่ top level
export async function GET(req: Request)  { return toNextJsHandler(getAuth()).GET(req) }
export async function POST(req: Request) { return toNextJsHandler(getAuth()).POST(req) }
```

### ⚠️ กับดัก: `matcher` ใน `proxy.ts` ต้องเป็น literal ล้วน

`matcher: PATHS.map((p) => \`${p}/:path*\`)` ทำให้ build พังทันที —
Next วิเคราะห์ค่านี้ตอน compile จึงรับได้แค่ string / array ที่เขียนตรง ๆ เท่านั้น
เพิ่ม route ใหม่ในกลุ่ม `(app)` แล้วต้องมาเติมใน matcher ด้วยมือทุกครั้ง

---

### ⚠️ กับดัก: แก้ฟิลด์ของ `user` ตรง ๆ แล้วต้อง refresh `cookieCache` เสมอ

**เจอจริงตอนทำ `/onboarding` — ผู้ใช้ติดลูป**

`cookieCache` เก็บ session ที่เซ็นแล้วไว้ในคุกกี้ 5 นาที และ **ไม่รู้เลย**ว่าเราไป `UPDATE` แถวใน DB
พอ Server Action ตั้ง `handle` เสร็จแล้ว `redirect("/dashboard")` →
`requireCreator()` อ่านจากคุกกี้ที่ยังบอกว่า `handle = null` → เด้งกลับ `/onboarding` →
**วนแบบนี้จนกว่าคุกกี้จะหมดอายุใน 5 นาที**

> ตัวเลือก `cookieCache.version` **ใช้แก้เคสนี้ไม่ได้** — โค้ดของ Better Auth คำนวณ version
> จากข้อมูลที่อยู่ใน cache เองแล้วเทียบกับตัวมันเอง จึงไว้สำหรับ bust cache ตอนเปลี่ยนโครง session
> ไม่ใช่ตอนข้อมูลใน DB เปลี่ยน

วิธีแก้ — บังคับอ่านจาก DB แล้วเขียน cache ใหม่ ก่อน `redirect()`:

```ts
await db.update(schema.user).set({ handle }).where(eq(schema.user.id, user.id))

// อ่านข้าม cache → เขียน cache ชุดใหม่ (คุกกี้ apply ผ่าน plugin nextCookies())
await getAuth().api.getSession({
  headers: await headers(),
  query: { disableCookieCache: true },
})

redirect("/dashboard")
```

**ใช้กฎเดียวกันกับทุกฟิลด์ที่อยู่ใน session** — `handle`, `plan`, `planUntil`, `role`
โดยเฉพาะตอน Stripe webhook อัปเกรดเป็น Pro: webhook แก้ DB จากนอก request ของผู้ใช้
จึง refresh คุกกี้ให้ไม่ได้ → หน้า success ต้องเรียก refresh เองฝั่ง client
ไม่งั้นผู้ใช้จ่ายเงินแล้วแต่ยังเห็นฟีเจอร์ล็อกอยู่นานถึง 5 นาที

---

**`cookieCache` คือฟีเจอร์ที่ประหยัดที่สุดในไฟล์นี้** — เก็บ session ที่เซ็นแล้วไว้ในคุกกี้ 5 นาที
ทำให้ทุก request ไม่ต้องยิง `SELECT * FROM session` เข้า Neon
สำหรับแอปที่มี navigation ถี่ ๆ อันนี้ลด DB read ได้ระดับ 80–90%

### แผนการล็อกอิน
- **Phase 1:** Google เท่านั้น (ตามที่ระบุ) — ลด support burden เรื่อง password reset ได้ทั้งหมด
- **Phase 3:** เพิ่ม Discord และ Twitter/X — ชุมชนอาร์ตอยู่บนสองแพลตฟอร์มนี้ และ Discord login เปิดทางให้ส่งแจ้งเตือนเข้า DM ได้ด้วย
- ไม่ทำ email + password

### Route protection ด้วย `proxy.ts` (Next 16 เปลี่ยนชื่อจาก `middleware.ts`)

```ts
// proxy.ts  ← ชื่อไฟล์ใหม่ของ Next.js 16
import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

export function proxy(req: NextRequest) {
  // เช็คแค่ "มีคุกกี้ไหม" เท่านั้น — ไม่ query DB ที่ชั้นนี้
  if (!getSessionCookie(req)) {
    const url = new URL('/sign-in', req.url)
    url.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/orders/:path*', '/services/:path*', '/settings/:path*', '/my/:path*'],
}
```

> **หลักการความปลอดภัย:** proxy เป็นแค่ UX gate เท่านั้น (กันหน้าจอกระพริบ)
> การตรวจสิทธิ์จริงต้องอยู่ใน Server Action / Route Handler ทุกจุดเสมอ — ดู §7

---

## 4. Database layer

```ts
// lib/db/index.ts
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

function createDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle(sql, { schema })
}

// lazy init — ห้ามเรียก neon() ที่ top level
let _db: ReturnType<typeof createDb> | null = null
export function getDb() {
  if (!_db) _db = createDb()
  return _db
}
```

> ⚠️ **สองกับดักที่ต้องรู้ไว้ก่อน:**
> 1. `neon()` จะ **throw ถ้าไม่มี `DATABASE_URL`** และ Next.js รันโค้ด top-level ตอน build → `next build` จะพังใน deploy ครั้งแรกก่อนที่ Marketplace จะ provision env ให้ ดังนั้นต้อง lazy init เสมอ
> 2. **ห้ามห่อ db client ด้วย JavaScript `Proxy`** เพื่อทำ lazy init — เป็น pattern ที่เจอบ่อยแต่พังกับ auth library ที่ตรวจสอบ property ของ adapter object ผลคือ request ค้างโดยไม่มี error ให้ดู ใช้ฟังก์ชัน `getDb()` ธรรมดาแทน

**ทำไมใช้ `neon-http` ไม่ใช่ `neon-serverless` (WebSocket):**
HTTP driver คือ stateless one-shot ต่อ query ไม่ต้องเปิด/ปิด connection ไม่ต้องมี pooler
ผลคือไม่มี idle connection ค้างไว้ → Neon ตัดสินใจ scale-to-zero ได้เร็ว → ประหยัด CU-hours จริง

**เมื่อไหร่ที่ต้องใช้ WebSocket driver:** เฉพาะจุดที่ต้อง interactive transaction จริง ๆ
ในระบบนี้มี 2 จุด: **ปิดประมูล** และ **แปลง proposal → order**
วิธีเลี่ยง: เขียนเป็น CTE เดียวหรือใช้ `db.batch()` แทน ถ้าเลี่ยงไม่ได้จริงค่อยแยก client ตัวที่สอง

### Migration
- `drizzle-kit generate` → ได้ไฟล์ `.sql` ที่ commit ลง git อ่านรีวิวได้
- `drizzle-kit migrate` รันใน CI ก่อน deploy (ไม่รันตอน build เพราะ build จะซ้ำหลายรอบ)
- ใช้ **Neon branch** ต่อ Vercel preview deployment — ได้ DB แยกต่อ PR โดยไม่เสียเงินเพิ่ม (branch ใช้ copy-on-write)

> `drizzle-kit` และ `tsx` **ไม่โหลด `.env.local` ให้อัตโนมัติ** (มีแต่ Next.js ที่ทำ) ต้องใช้ `dotenv-cli`:
> ```bash
> npx dotenv -e .env.local -- npx drizzle-kit migrate
> npx dotenv -e .env.local -- npx tsx scripts/seed.ts
> ```

### Provisioning
ใช้ Vercel Marketplace เพื่อให้ env var ถูก inject เข้า project อัตโนมัติ ไม่ต้องตั้งเอง:
```bash
vercel integration add neon      # ได้ DATABASE_URL
# Blob store สร้างจาก dashboard → ได้ BLOB_READ_WRITE_TOKEN
vercel env pull .env.local --yes
```

---

## 5. Media pipeline — จุดที่ประหยัดได้มากที่สุด

ราคาที่เกี่ยวข้อง (ณ 2026): Vercel Blob **$0.023/GB-เดือน** สำหรับ storage และ **$0.05/GB** สำหรับ data transfer,
Hobby ให้ฟรี 1 GB storage + 10 GB transfer ([Vercel Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing))

### กฎ 4 ข้อ

**1. Client-direct upload เสมอ — ไฟล์ต้องไม่ผ่าน serverless function**

Vercel function มีเพดาน request body **4.5 MB** และไฟล์ที่ผ่าน function จะโดนคิดค่า Fast Data Transfer
ส่วน client upload **ไม่มีค่า data transfer** ([Client Uploads docs](https://vercel.com/docs/vercel-blob/client-upload))

```ts
// app/api/blob/upload/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody

  return Response.json(await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const { user } = await requireSession()
      const { kind, orderId } = JSON.parse(clientPayload ?? '{}')

      await assertQuotaAvailable(user.id)          // เช็คโควตาตาม plan ก่อนออก token
      if (orderId) await assertOrderAccess(user.id, orderId)

      return {
        allowedContentTypes: ['image/webp', 'image/png', 'image/jpeg', 'video/mp4'],
        maximumSizeInBytes: kind === 'final' ? 200_000_000 : 20_000_000,
        addRandomSuffix: true,
        // ไฟล์ส่งมอบเป็น private — ลูกค้าเข้าถึงได้ผ่าน signed URL เท่านั้น
        access: kind === 'final' ? 'private' : 'public',
        tokenPayload: JSON.stringify({ userId: user.id, orderId, kind }),
      }
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      const p = JSON.parse(tokenPayload!)
      await db.insert(media).values({ /* ...บันทึก metadata + หักโควตา... */ })
    },
  }))
}
```

**2. ย่อ + แปลงเป็น WebP ใน browser ก่อนอัปโหลด**

```ts
// lib/media/prepare.ts — ทำงานฝั่ง client ทั้งหมด
const SIZES = { thumb: 480, display: 1440 } as const

export async function prepareImage(file: File) {
  const bitmap = await createImageBitmap(file)
  const variants = await Promise.all(
    Object.entries(SIZES).map(([name, w]) => renderVariant(bitmap, name, w))
  )
  return {
    variants,                                   // WebP q=0.82
    original: file,                             // เก็บเฉพาะ plan ที่อนุญาต
    thumbhash: await computeThumbHash(bitmap),  // ~28 bytes เก็บลง DB
    width: bitmap.width,
    height: bitmap.height,
  }
}
```
ภาพ PNG 8 MB จากโปรแกรมวาด → WebP display ~250 KB + thumb ~30 KB
**ลดพื้นที่ ~25 เท่า** แปลว่า 1 GB ฟรีของ Hobby รองรับผลงานได้หลักพันชิ้นแทนที่จะเป็นหลักร้อย

**3. ไม่ใช้ Vercel Image Optimization**

เราย่อภาพเองตั้งแต่ต้นทางแล้ว ภาพจาก Blob ก็เสิร์ฟผ่าน CDN อยู่แล้ว
การส่งต่อเข้า `/_next/image` จะกินโควตา image transformation โดยไม่ได้อะไรเพิ่ม
→ ตั้ง `images.unoptimized: true` แล้วใช้ `<Image>` เพื่อเอา layout/lazy-load/aspect-ratio อย่างเดียว
→ ใช้ `thumbhash` ที่เก็บไว้เป็น `placeholder="blur"` (ไม่ต้องยิง request เพิ่ม)

> **ใช้ `access: 'private'` เท่าที่จำเป็นจริง ๆ** — private blob เสิร์ฟช้ากว่าและ egress แพงกว่าเพราะไม่ผ่าน CDN cache แบบเดียวกัน
> ในระบบนี้ private ใช้กับ **ไฟล์ final เท่านั้น** ซึ่งลูกค้าโหลดไม่กี่ครั้งต่อออเดอร์ → รับได้
> ส่วน portfolio / WIP preview / avatar เป็น `public` ทั้งหมดเพราะโดนเปิดดูซ้ำเยอะ

**4. Garbage collection**

ไฟล์ที่อัปโหลดแล้วแต่ผู้ใช้ปิดหน้าไปก่อน submit จะกลายเป็นขยะ
→ `media.status = 'orphan'` ตอนอัปโหลด, เปลี่ยนเป็น `'linked'` เมื่อ submit สำเร็จ
→ cron รายวันลบ orphan ที่เก่ากว่า 24 ชม. + ไฟล์ของ order ที่ยกเลิกและเกิน retention

### ⚠️ Blob store ต้องสร้างเป็น **public** ตั้งแต่แรก (เจอจริงตอนต่อ Phase 1a)

> สรุปที่ใช้จริง: store `blob-com-mi` (public, region `sin1`) — ตัว private ตัวแรกถูกลบทิ้งแล้ว
> **token ของ store ไม่มี API ให้ดึงย้อนหลัง** ออกให้ตอนเชื่อมกับโปรเจกต์หรือดูจาก dashboard เท่านั้น

โหมด access ของ store ถูกกำหนด**ตอนสร้าง store** เปลี่ยนทีหลังไม่ได้
ถ้าสร้างเป็น private แล้วโค้ดเรียก `put(..., { access: "public" })` จะได้:

```
Vercel Blob: Cannot use public access on a private store.
The store is configured with private access.
```

**อาการหลอก:** ในเบราว์เซอร์จะเห็นเป็น CORS error แทน
(`No 'Access-Control-Allow-Origin' header`) เพราะ response ที่เป็น error
ไม่ส่ง header CORS มาด้วย — ทำให้หลงไปแก้เรื่อง origin/proxy ทั้งที่ไม่เกี่ยว
`pnpm blob:check` ยิงตรงจาก Node ข้ามเบราว์เซอร์ไป จะเห็นข้อความจริงทันที

private ไม่ใช่ทางเลือกสำหรับรูปหน้าร้าน/ผลงาน — เสิร์ฟช้ากว่าและ egress แพงกว่า
เพราะทุกครั้งที่เปิดดูต้องเซ็น URL ใหม่และไม่ติด CDN cache
เก็บ private ไว้ให้ไฟล์ส่งมอบงานใน Phase 1c เท่านั้น (แยกเป็นคนละ store)

### เก็บอะไรใน Blob vs Neon

| ข้อมูล | เก็บที่ | เหตุผล |
|---|---|---|
| รูป/วิดีโอทั้งหมด | Blob | — |
| metadata ของไฟล์ (url, ขนาด, มิติ, thumbhash) | Neon | ต้อง query/join |
| ข้อความในเธรด | Neon | สั้น, ต้อง search |
| ใบเสนอราคา/ใบเสร็จ PDF | สร้างสด ๆ ตอนขอ ไม่เก็บ | ประหยัด storage, ข้อมูลอยู่ใน DB อยู่แล้ว |
| audit log เก่ากว่า 90 วัน | ย้ายเป็น JSON ลง Blob แล้วลบจาก Neon | Neon storage $0.35/GB แพงกว่า Blob 15 เท่า |

---

## 6. Realtime & Notifications — ตัดสินใจแบบเน้นต้นทุน

### ทำไมไม่ใช้ WebSocket / SSE ค้างไว้

Vercel Fluid Compute คิดเงินตาม **active CPU + provisioned memory + invocations**
การเปิด SSE ค้างไว้ = function ถูกจอง memory ไว้ตลอดเวลาที่ผู้ใช้เปิดแท็บ
ครีเอเตอร์ 100 คนเปิดแท็บทิ้งไว้ = 100 function ค้าง ซึ่งแพงกว่าประโยชน์ที่ได้มาก

### สิ่งที่จะทำแทน — 3 ชั้น

| ชั้น | เทคนิค | ใช้กับ | ต้นทุน |
|---|---|---|---|
| **Instant (นอกแท็บ)** | **Web Push (VAPID)** | ออเดอร์ใหม่, ลูกค้าตอบกลับ, ประมูลใกล้ปิด | ~0 (browser push service ฟรี) |
| **Near-real-time (ในแท็บ)** | **Polling แบบฉลาด** | badge จำนวนแจ้งเตือน, เธรดที่เปิดอยู่ | ต่ำมาก |
| **สรุป** | **Email (Resend)** | digest รายวัน, ใบเสร็จ, เตือน deadline | ฟรี 3k/เดือน |

**Polling แบบฉลาด** — รายละเอียดที่ทำให้ถูก:
```ts
// หยุด poll เมื่อแท็บไม่ active + ถอยจังหวะเมื่อไม่มีอะไรใหม่ + ใช้ ETag
const delay = Math.min(60_000, 5_000 * 2 ** consecutiveEmptyPolls)
if (document.visibilityState !== 'visible') return  // ไม่ยิงเลย
```
endpoint `/api/notifications/poll` ตอบด้วย `304 Not Modified` เมื่อไม่มีของใหม่
→ ไม่แตะ DB (เทียบ `If-None-Match` กับ `lastNotificationAt` ที่อยู่ใน session cookie cache)

**Web Push คือฟีเจอร์ Pro** — ตรงกับที่ผู้ใช้ระบุว่า paid tier "อาจจะมีระบบแจ้งเตือน"
free tier ได้ in-app badge + email digest วันละครั้ง, Pro ได้ push ทันที + Discord webhook + LINE

### ช่องทางแจ้งเตือนของ Pro
1. **Web Push** — `web-push` + VAPID, service worker ที่ `public/sw.js`
2. **Discord webhook** — ครีเอเตอร์วาง webhook URL ของเซิร์ฟเวอร์ตัวเอง (implement 20 บรรทัด, ชุมชนอาร์ตชอบมาก)
3. **LINE Messaging API** — สำคัญสำหรับตลาดไทย แต่ต้องสมัคร LINE Official Account → ยกไป Phase 3
4. **Email ทันที** ผ่าน Resend

---

## 7. Background jobs — ข้อจำกัดที่ต้องออกแบบรอบ

**Vercel Hobby รัน cron ได้แค่วันละครั้ง** และเวลาคลาดเคลื่อนได้ถึง 1 ชั่วโมง
Pro ถึงจะได้ per-minute ([Vercel limits](https://vercel.com/docs/limits))

### ทางออก: Lazy evaluation แทน scheduled job

```ts
// ปิดประมูลตอนมีคนเปิดดู ไม่ต้องรอ cron
export async function getAuction(id: string) {
  const auction = await db.query.auction.findFirst({ where: eq(auction.id, id) })

  if (auction.status === 'open' && auction.endsAt < new Date()) {
    await closeAuction(id)          // idempotent + guard ด้วย WHERE status='open'
    return getAuction(id)
  }
  return auction
}
```
บวกกับ cron รายวันเป็น backstop สำหรับประมูลที่ไม่มีใครเปิดดูเลย

### รายการ cron (Hobby = วันละครั้ง, ปรับเป็นถี่ขึ้นเมื่อขึ้น Pro)

```ts
// vercel.ts
import { type VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/daily-digest',   schedule: '0 1 * * *' },  // สรุปงานเข้า + deadline
    { path: '/api/cron/sweep-auctions', schedule: '0 2 * * *' },  // backstop ปิดประมูล
    { path: '/api/cron/gc-blobs',       schedule: '0 3 * * *' },  // ลบไฟล์กำพร้า
    { path: '/api/cron/expire-quotes',  schedule: '0 4 * * *' },  // ใบเสนอราคาหมดอายุ
  ],
}
```
ทุก cron route ต้องเช็ค `Authorization: Bearer ${CRON_SECRET}`

---

## 8. Security

| ประเด็น | มาตรการ |
|---|---|
| **Authorization** | ทุก Server Action เริ่มด้วย `requireSession()` แล้วตามด้วย `assertOwner(entity)` — ห้ามเชื่อ `proxy.ts` เด็ดขาด |
| **Input** | Zod schema ที่ boundary ทุกจุด, `.strict()` เพื่อกัน mass-assignment |
| **IDOR** | order ใช้ ULID + `orderCode` แบบสุ่ม 8 ตัว, ทุก query มี `WHERE creatorId = $me OR clientId = $me` |
| **สแปมคำขอ** | Vercel BotID บนฟอร์ม + rate limit + บังคับ login ก่อน submit |
| **Rate limit** | Token bucket ใน Postgres (`rate_limit` table, upsert เดียวจบ) — ไม่ต้องเพิ่ม Redis |
| **ไฟล์ส่งมอบ** | Private Blob + signed URL อายุ 15 นาที ออกให้เฉพาะเมื่อ payment ครบ |
| **XSS** | เนื้อหาจากผู้ใช้เป็น markdown จำกัด tag → sanitize ด้วย `rehype-sanitize` ห้าม `dangerouslySetInnerHTML` ดิบ |
| **Webhook** | ตรวจ Stripe signature เสมอ + ตาราง `webhook_event` กัน replay |
| **Secrets** | `vercel env` เท่านั้น, ไม่มี secret ใน client bundle, VAPID private key และ Blob RW token อยู่ server อย่างเดียว |
| **CSP** | ตั้ง header ใน `proxy.ts` — `script-src 'self'`, `img-src` เฉพาะ blob domain |

### Helper ที่ต้องมีตั้งแต่วันแรก
```ts
// lib/auth/guard.ts
export async function requireSession() { /* คืน user หรือ redirect */ }
export async function requireCreator() { /* ต้องมี creatorPage แล้ว */ }
export async function requireOrderAccess(orderCode: string, as?: 'creator' | 'client') { }
export async function requirePlan(feature: FeatureKey) { /* ดู 03-plans */ }
```

---

## 9. โครงสร้างโฟลเดอร์

```
.
├── app/
│   ├── (marketing)/        landing, pricing, explore, legal
│   ├── (public)/           @handle, listings — cache หนัก
│   ├── (auth)/             sign-in, onboarding
│   ├── (app)/              backoffice ครีเอเตอร์ — dynamic
│   ├── (client)/           my/requests — ฝั่งลูกค้า
│   └── api/                auth, blob, stripe, cron, og
├── components/
│   ├── ui/                 shadcn primitives
│   ├── forms/              form builder + field renderer
│   ├── media/              uploader, gallery, thumbhash image
│   └── app/                shell, sidebar, kanban ฯลฯ
├── lib/
│   ├── db/                 schema.ts, index.ts, migrations/
│   ├── auth/               auth.ts, guard.ts
│   ├── billing/            plans.ts, entitlements.ts, stripe.ts
│   ├── media/              prepare.ts, thumbhash.ts, quota.ts
│   ├── notify/             dispatch.ts, channels/*
│   ├── orders/             state-machine.ts, pricing.ts
│   ├── queries/            read model (มี 'use cache')
│   └── i18n/               th.ts, en.ts
├── docs/                   เอกสารชุดนี้
├── proxy.ts                (แทน middleware.ts ใน Next 16)
├── vercel.ts               config + crons
└── next.config.ts
```

---

## 10. Environment variables

```bash
DATABASE_URL=                     # Neon pooled connection string
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
BLOB_READ_WRITE_TOKEN=            # Vercel ใส่ให้อัตโนมัติเมื่อผูก Blob store
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_YEARLY=
RESEND_API_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
CRON_SECRET=
NEXT_PUBLIC_APP_URL=
```
จัดการด้วย `vercel env pull` → `.env.local` (อย่า commit)

---

## 11. สรุปงบประมาณโครงสร้างพื้นฐาน

| บริการ | ฟรีถึงเมื่อไหร่ | จุดที่จะเริ่มเสียเงิน |
|---|---|---|
| Vercel Hobby | ตลอด สำหรับ non-commercial | ต้องขึ้น Pro ($20/เดือน) เมื่อ (ก) เริ่มเก็บเงินจริง หรือ (ข) ต้องการ cron ถี่กว่าวันละครั้ง |
| Neon Free | 100 CU-hours + 0.5 GB | ~150–300 ครีเอเตอร์ active ถ้า cache ดี → Launch plan |
| Vercel Blob | 1 GB + 10 GB transfer | ~700–1,500 ผลงาน (หลังบีบอัด) → $0.023/GB-เดือน |
| Resend | 3,000 อีเมล/เดือน | ~300 ครีเอเตอร์ active |
| Stripe | ไม่มีค่าแรกเข้า | หัก ~3.65% ต่อธุรกรรม subscription |

**ประมาณการ:** ครีเอเตอร์ active 500 คน ≈ **$25–40/เดือน** รวมทุกอย่าง
ถ้า conversion 4% → Pro 20 คน × ฿159 ≈ ฿3,180/เดือน ≈ $88 → คุ้มทุนตั้งแต่สเกลเล็ก

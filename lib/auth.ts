import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

/** เส้นทางที่ทำให้เกิดการส่งรหัสออกไป — ทุกเส้นต้องผ่านลิมิตต่ออีเมล */
const OTP_PATHS = new Set([
  "/forget-password/email-otp",
  "/sign-in/email-otp",
  "/email-otp/send-verification-otp",
  "/email-otp/request-password-reset",
]);
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, schema } from "@/lib/db";
import { emailOTP } from "better-auth/plugins/email-otp";
import { LIMITS, rateLimit as pgRateLimit } from "@/lib/rate-limit";
import { sendOtpEmail, sendPasswordChangedEmail } from "@/lib/email/auth-mails";

/**
 * อีเมลส่งถึงคนจริงได้หรือยัง
 *
 * `EMAIL_FROM` ตั้งได้ก็ต่อเมื่อยืนยันโดเมนกับ Resend แล้ว จึงใช้เป็นสวิตช์เดียว
 * ของทั้งการสมัครด้วยรหัสผ่านและการกู้ด้วย OTP — สองอย่างนี้แยกกันไม่ได้
 */
const emailReady = !!process.env.EMAIL_FROM;

/**
 * ⚠️ ต้อง lazy — ห้ามสร้าง instance ที่ top level
 *
 * `getDb()` จะ throw ถ้าไม่มี DATABASE_URL และ Next.js ประเมินโมดูลของ route
 * ตอน "Collecting page data" ระหว่าง build → `next build` พังทั้ง build
 * เกิดขึ้นจริงทั้งตอน build ในเครื่อง (production build ไม่โหลด .env.development.local)
 * และตอน deploy ครั้งแรกก่อน env ถูก provision
 */
let _auth: ReturnType<typeof createAuth> | null = null;

export function getAuth() {
  if (!_auth) _auth = createAuth();
  return _auth;
}

function createAuth() {
  return betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),

  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  /**
   * ล็อกอินด้วยอีเมล+รหัสผ่าน — **ปิดอยู่จนกว่าจะตั้ง `EMAIL_FROM`**
   *
   * ไม่ใช่แค่ "ทดสอบไม่ได้" แต่ใช้จริงไม่ได้: ตราบใดที่ยังไม่ยืนยันโดเมนกับ Resend
   * ระบบส่งอีเมลได้เฉพาะถึงเจ้าของบัญชี Resend (ดู lib/email/send.ts) และ
   * `sendEmail()` กลืน error โดยตั้งใจ คนสมัครจึงรอรหัสที่ไม่มีวันมาถึงโดยไม่มีอะไรบอก
   *
   * ปิดทั้งชุดดีกว่าเปิดครึ่งเดียว — สมัครได้แต่ยืนยันอีเมลไม่ได้ = บัญชีที่เข้าไม่ได้
   * และกู้ไม่ได้ด้วย เพราะทางกู้ก็เดินผ่านอีเมลเหมือนกัน
   */
  emailAndPassword: {
    enabled: emailReady,
    /**
     * บังคับยืนยันอีเมลก่อนเข้าใช้ครั้งแรก
     *
     * ถ้าไม่บังคับ ใครก็สมัครด้วยอีเมลคนอื่นแล้วยึดชื่อนั้นไว้ได้ และการเชื่อมกับ
     * บัญชี Google ทีหลังก็จะเชื่อมเข้าบัญชีที่ไม่มีใครพิสูจน์ว่าเป็นเจ้าของอีเมล
     */
    requireEmailVerification: true,
    minPasswordLength: 10,
    async sendResetPassword() {
      // ไม่ใช้ลิงก์รีเซ็ต — ทางกู้รหัสของเราคือรหัส OTP (ดู emailOTP ข้างล่าง)
    },
    async onPasswordReset({ user }) {
      await sendPasswordChangedEmail(user.email);
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 วัน
    updateAge: 60 * 60 * 24, // ต่ออายุวันละครั้ง ไม่ใช่ทุก request → ลด write ลง Neon

    /**
     * ⭐ บรรทัดที่ประหยัดที่สุดในไฟล์นี้
     * เก็บ session ที่เซ็นแล้วไว้ในคุกกี้ 5 นาที → ทุก request ไม่ต้องยิง SELECT เข้า Neon
     * สำหรับแอปที่มี navigation ถี่ ลด DB read ได้ระดับ 80–90% (docs/01-architecture.md §3)
     */
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  user: {
    additionalFields: {
      /** ชื่อใน URL `/@handle` — ผู้ใช้ตั้งเองตอน onboarding */
      handle: { type: "string", required: false, input: false },
      /** free | pro | studio — เปลี่ยนได้จาก Stripe webhook เท่านั้น ห้ามรับจาก client */
      plan: { type: "string", required: false, defaultValue: "free", input: false },
      planUntil: { type: "date", required: false, input: false },
      role: { type: "string", required: false, defaultValue: "user", input: false },
      /** ผู้ดูแลระงับบัญชีนี้เมื่อไร — ตั้งได้จากฝั่ง server เท่านั้น */
      suspendedAt: { type: "date", required: false, input: false },
      suspensionReason: { type: "string", required: false, defaultValue: "", input: false },
    },
  },

  /**
   * บัญชีที่ถูกระงับสร้าง session ใหม่ไม่ได้
   *
   * ทำที่นี่ไม่ใช่เช็คทุก request เพราะ `cookieCache` ข้างบนมีไว้เพื่อไม่ต้องยิง DB
   * ทุกครั้ง — ถ้าเช็คทุก request ก็ไม่เหลือเหตุผลของ cache เลย
   *
   * ⚠️ hook นี้ทำงานตอน "สร้าง" เท่านั้น session ที่ล็อกอินค้างอยู่ไม่ถูกแตะ
   * ตอนกดระงับจึงต้องลบ session เดิมทิ้งด้วย (ดู lib/admin/actions.ts)
   * ไม่งั้นคนที่เปิดค้างไว้ใช้ต่อได้อีก 30 วันตามอายุคุกกี้
   */
  databaseHooks: {
    session: {
      create: {
        async before(session, ctx) {
          if (!ctx) return;
          const u = await ctx.context.internalAdapter.findUserById(session.userId);
          if ((u as { suspendedAt?: Date | null } | null)?.suspendedAt) {
            throw APIError.from("FORBIDDEN", { message: "account_suspended", code: "ACCOUNT_SUSPENDED" });
          }
        },
      },
    },
  },

  /**
   * ปิด endpoint ที่ไม่ได้ใช้ของ email-otp
   *
   * ทำงานใน `onRequest` คืน 404 ตั้งแต่ก่อนถึง rate limit และก่อน hook ของ plugin
   * (ตรวจแล้วที่ dist/api/index.mjs:164) — เป็นชั้นนอกสุดจริง ๆ ไม่ใช่แค่ซ่อน UI
   *
   * รอบแรกใช้แค่ "ขอรหัสเพื่อเข้าสู่ระบบ" กับ "ตั้งรหัสผ่านใหม่" ที่เหลือ
   * เป็นพื้นที่ให้โจมตีเปล่า ๆ โดยเฉพาะ check-verification-otp ที่ให้ลองรหัสได้
   * โดยไม่สร้าง session — เหมาะกับการไล่เดารหัสพอดี
   */
  /**
   * จำกัดการขอรหัส OTP **ต่ออีเมล** ก่อนเข้า endpoint
   *
   * ต้องอยู่ตรงนี้ ไม่ใช่ในตัวส่งเมล เพราะตัวส่งเมลถูกเรียกแบบ background task
   * (ดูคอมเมนต์ที่ `sendVerificationOTP`) — throw ที่นั่นไม่มีผลกับ response
   *
   * ของ Better Auth เองผูกกับ IP และเก็บใน memory ซึ่งบน serverless
   * แต่ละ instance นับแยกกัน จึงกันคนยิงจากหลาย IP ไม่ได้เลย ของเราอยู่บน Postgres
   */
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!OTP_PATHS.has(ctx.path)) return;
      const email = (ctx.body as { email?: unknown } | undefined)?.email;
      if (typeof email !== "string" || !email) return;

      const gate = await pgRateLimit(
        `otp:${email.toLowerCase()}`,
        LIMITS.otpRequest.limit,
        LIMITS.otpRequest.windowSeconds,
      );
      if (!gate.ok) {
        throw APIError.from("TOO_MANY_REQUESTS", {
          message: "otp_rate_limited",
          code: "OTP_RATE_LIMITED",
        });
      }
    }),
  },

  disabledPaths: [
    "/email-otp/check-verification-otp",
    "/email-otp/verify-email",
    "/email-otp/change-email",
    "/email-otp/request-email-change",
  ],

  // nextCookies ต้องเป็น plugin ตัวสุดท้ายเสมอ — ทำให้ Server Action เซ็ตคุกกี้ได้
  plugins: [
    ...(emailReady
      ? [
          emailOTP({
            otpLength: 6,
            /** 10 นาที ไม่ใช่ 5 ตามค่าเริ่มต้น — คนไทยส่วนใหญ่สลับไปเปิดแอปอีเมลบนมือถือ */
            expiresIn: 600,
            /** กรอกผิดครบสามครั้งรหัสตาย ต้องขอใหม่ — กันไล่เดาในหน้าต่างที่ยังไม่หมดอายุ */
            allowedAttempts: 3,
            /**
             * ⚠️ ค่าเริ่มต้นของ Better Auth คือ `"plain"` — เก็บรหัสดิบไว้ในตาราง
             * `verification` ใครอ่าน DB ได้ก็เห็นรหัสที่ยังใช้ได้ของทุกคน
             */
            storeOTP: "hashed",
            /** สมัครบัญชีใหม่ด้วย OTP ไม่ได้ — ทางสมัครมีทางเดียวคือ Google หรือรหัสผ่าน */
            disableSignUp: true,
            /**
             * ⚠️ **ห้ามใส่ด่านอะไรไว้ในนี้** — Better Auth เรียกผ่าน
             * `runInBackgroundOrAwait()` (dist/plugins/email-otp/routes.mjs:481)
             * ซึ่งบนแพลตฟอร์มที่มี background task จะยิงทิ้งไว้แล้วตอบ 200 ไปเลย
             * `throw` ตรงนี้จึงไม่มีทางหยุดคำขอได้ — เคยใส่ลิมิตไว้ตรงนี้แล้วพบว่า
             * ตัวนับขึ้นครบแต่ทุกคำขอยังตอบ 200 ลิมิตย้ายไปที่ `hooks.before` แทน
             */
            async sendVerificationOTP({ email, otp }) {
              await sendOtpEmail(email, otp, 10);
            },
          }),
        ]
      : []),
    nextCookies(),
  ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

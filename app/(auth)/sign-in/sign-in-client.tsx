"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/brand";
import { useDict } from "@/lib/i18n/client";
import { emailOtp, signIn, signUp } from "@/lib/auth-client";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}

export function SignInClient({ passwordEnabled }: { passwordEnabled: boolean }) {
  const t = useDict();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);

  // กลับไปหน้าที่ตั้งใจจะเข้าหลังล็อกอินเสร็จ — ต้องเป็น path ภายในเท่านั้น กัน open redirect
  const raw = params.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  /** password = ฟอร์มปกติ · otp = กรอกรหัสที่ส่งไปทางอีเมล */
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [signingUp, setSigningUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");

  async function handlePassword() {
    setLoading(true);
    const res = signingUp
      ? await signUp.email({ email, password, name: email.split("@")[0], callbackURL: next })
      : await signIn.email({ email, password, callbackURL: next });
    setLoading(false);
    if (res.error) {
      toast.error(res.error.message ?? t.auth.signInFailed);
      return;
    }
    /**
     * สมัครเสร็จแล้วส่งรหัสให้ยืนยันต่อทันที ไม่ใช่บอกให้ "ไปเปิดอีเมล" เฉย ๆ
     *
     * ⚠️ `requireEmailVerification: true` เปิดอยู่ แต่ไม่ได้ตั้ง
     * `emailVerification.sendVerificationEmail` ไว้ที่ไหนเลย Better Auth จึงสร้าง
     * บัญชีที่ `emailVerified: false` แล้ว**ไม่ส่งอะไรออกไปเลย** (sign-up.mjs:242-251)
     * บัญชีนั้นล็อกอินด้วยรหัสผ่านไม่ได้ (EMAIL_NOT_VERIFIED) และยัง**บล็อกการล็อกอิน
     * ด้วย Google ของอีเมลเดียวกัน**ด้วย เพราะการผูกบัญชีต้องการอีเมลที่ยืนยันแล้ว
     * (oauth2/link-account.mjs:23) — คนที่สมัครค้างไว้ครั้งเดียวจึงเข้าไม่ได้ทั้งสองทาง
     *
     * การกรอกรหัสที่ `signIn.emailOtp` ตั้ง `emailVerified: true` ให้ (routes.mjs:427)
     * ทางนี้จึงปลดล็อกทั้งรหัสผ่านและ Google ในคราวเดียว
     */
    if (signingUp) await requestOtp();
    else window.location.assign(next);
  }

  /**
   * ลืมรหัสผ่าน = ขอรหัสหกหลักทางอีเมลแล้วเอามาเข้าสู่ระบบเลย
   * ไม่ใช่ลิงก์ตั้งรหัสใหม่ — คนที่ลืมรหัสส่วนใหญ่แค่อยากเข้าให้ได้ก่อน
   *
   * ⚠️ **ต้องเป็น `type: "sign-in"` เท่านั้น ห้ามใช้ `forgetPassword.emailOtp`**
   *
   * รหัสถูกเก็บโดยตั้งชื่อกุญแจตามชนิด (`${type}-otp-${email}`) และตอนตรวจก็หา
   * ด้วยชื่อเป๊ะ ๆ — `forgetPassword.emailOtp` เก็บไว้ใต้ `forget-password-otp-…`
   * (dist/plugins/email-otp/routes.mjs:527) ส่วน `signIn.emailOtp` ที่หน้านี้ใช้กรอกรหัส
   * ไปเปิดหา `sign-in-otp-…` (routes.mjs:404) รหัสที่ส่งไปจึงไม่มีวันตรงกับที่ตรวจ
   *
   * ผลคือ "เข้าสู่ระบบด้วยรหัส" ใช้ไม่ได้เลยสักครั้งตั้งแต่วันที่เขียน:
   * อีเมลส่งออกไปจริง ผู้ใช้กรอกรหัสที่ถูกต้อง แล้วได้ "รหัสไม่ถูกต้อง" กลับมาเสมอ
   */
  async function requestOtp() {
    if (!email) return;
    setLoading(true);
    const res = await emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setLoading(false);
    if (res.error) {
      toast.error(res.error.code === "OTP_RATE_LIMITED" ? t.auth.tooManyOtp : t.error.title);
      return;
    }
    // ตอบเหมือนกันเสมอไม่ว่าอีเมลนี้จะมีบัญชีหรือไม่ — ไม่ให้หน้านี้เป็นเครื่องมือตรวจอีเมล
    setMode("otp");
    toast.success(t.auth.otpSent);
  }

  async function submitOtp() {
    setLoading(true);
    const res = await signIn.emailOtp({ email, otp });
    setLoading(false);
    if (res.error) {
      toast.error(res.error.message ?? t.error.title);
      return;
    }
    window.location.assign(next);
  }

  async function handleGoogle() {
    setLoading(true);
    const { error } = await signIn.social({ provider: "google", callbackURL: next });
    if (error) {
      setLoading(false);
      toast.error(error.message ?? t.error.title);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <Card className="gap-5 p-6">
          <div className="text-center">
            <h1 className="text-lg font-semibold">{t.common.signIn}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.brand.tagline}</p>
          </div>

          <Button onClick={handleGoogle} disabled={loading} size="lg" variant="outline">
            <GoogleMark />
            {t.common.signInWithGoogle}
          </Button>

          {/* ฟอร์มรหัสผ่านขึ้นเฉพาะตอนอีเมลใช้งานได้จริง — ดู emailReady ใน lib/auth.ts */}
          {passwordEnabled ? (
            <>
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">{t.auth.orDivider}</span>
                <Separator className="flex-1" />
              </div>

              {mode === "password" ? (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="email">{t.auth.email}</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">{t.auth.password}</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={signingUp ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1.5"
                    />
                    {signingUp ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">{t.auth.passwordHint}</p>
                    ) : null}
                  </div>
                  <Button onClick={handlePassword} disabled={loading || !email || !password} className="w-full">
                    {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                    {signingUp ? t.auth.signUp : t.common.signIn}
                  </Button>
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => setSigningUp((v) => !v)}
                      className="text-muted-foreground underline underline-offset-2"
                    >
                      {signingUp ? t.auth.haveAccount : t.auth.noAccount}
                    </button>
                    {!signingUp ? (
                      <button
                        type="button"
                        onClick={requestOtp}
                        className="text-muted-foreground underline underline-offset-2"
                      >
                        {t.auth.forgot}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="otp">{t.auth.otpTitle}</Label>
                    <Input
                      id="otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder={t.auth.otpCode}
                      className="tabular mt-1.5 text-center text-lg tracking-widest"
                    />
                  </div>
                  <Button onClick={submitOtp} disabled={loading || otp.length !== 6} className="w-full">
                    {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                    {t.auth.otpSubmit}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setMode("password")}
                    className="w-full text-center text-xs text-muted-foreground underline underline-offset-2"
                  >
                    {t.auth.otpBack}
                  </button>
                </div>
              )}
            </>
          ) : null}

          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            {t.auth.tosNotice}{" "}
            <Link href="/legal/terms" className="underline underline-offset-2">
              {t.legal.terms}
            </Link>{" "}
            {t.auth.and}{" "}
            <Link href="/legal/privacy" className="underline underline-offset-2">
              {t.legal.privacy}
            </Link>
          </p>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            ← {t.brand.name}
          </Link>
        </p>
      </div>
    </div>
  );
}

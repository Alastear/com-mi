"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/brand";
import { useDict } from "@/lib/i18n/client";
import { signIn } from "@/lib/auth-client";

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

export function SignInClient() {
  const t = useDict();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);

  // กลับไปหน้าที่ตั้งใจจะเข้าหลังล็อกอินเสร็จ — ต้องเป็น path ภายในเท่านั้น กัน open redirect
  const raw = params.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

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

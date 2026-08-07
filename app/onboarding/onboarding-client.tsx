"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand";
import { useDict } from "@/lib/i18n/client";
import { checkHandle } from "@/lib/handles";
import { claimHandle, type ClaimResult } from "./actions";
import { cn } from "@/lib/utils";
import { shopUrlPrefix } from "@/lib/site";

export function OnboardingClient({ suggested }: { suggested: string }) {
  const t = useDict();
  const [handle, setHandle] = useState(suggested);
  const [state, action, pending] = useActionState<ClaimResult, FormData>(claimHandle, undefined);

  // ตรวจรูปแบบฝั่ง client เพื่อ feedback ทันที — ฝั่ง server ตรวจซ้ำเสมอ
  const local = checkHandle(handle);
  const serverError = state?.error;
  const message =
    serverError === "taken"
      ? t.onboarding.taken
      : serverError === "reserved" || (!local.ok && local.reason === "reserved")
        ? t.onboarding.reserved
        : !local.ok && handle.length > 0
          ? t.onboarding.format
          : null;

  const valid = local.ok && !serverError;

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <Card className="gap-5 p-6">
          <div>
            <h1 className="text-lg font-semibold">{t.onboarding.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.onboarding.subtitle}</p>
          </div>

          <form action={action} className="space-y-4">
            <div>
              <Label htmlFor="handle">{t.settings.handle}</Label>
              <div className="mt-1.5 flex items-center">
                <span className="rounded-l-lg border border-r-0 bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {shopUrlPrefix()}
                </span>
                <Input
                  id="handle"
                  name="handle"
                  value={handle}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  className="rounded-l-none"
                  aria-invalid={message ? true : undefined}
                  aria-describedby="handle-msg"
                />
              </div>

              <p
                id="handle-msg"
                className={cn(
                  "mt-1.5 flex items-center gap-1.5 text-xs",
                  message ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {message ? (
                  <>
                    <X className="size-3.5 shrink-0" />
                    {message}
                  </>
                ) : valid ? (
                  <>
                    <Check className="size-3.5 shrink-0 text-success" />
                    {t.onboarding.available}
                  </>
                ) : (
                  t.onboarding.hint
                )}
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={!valid || pending}>
              {t.onboarding.submit}
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <p className="text-xs leading-relaxed text-muted-foreground">{t.onboarding.canChange}</p>

          {/*
            * ทางออก — /onboarding ไม่ใช่ด่านบังคับอีกต่อไป คนที่กดมาผิดต้องกลับได้
            * ไม่งั้นจะรู้สึกว่าติดอยู่และต้องตั้งชื่อร้านทั้งที่แค่อยากจ้างวาด
            */}
          <div className="border-t pt-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t.onboarding.buyerNote}
            </p>
            <Button asChild variant="ghost" size="sm" className="mt-1.5 -ml-2">
              <Link href="/explore">{t.onboarding.buyerBack}</Link>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

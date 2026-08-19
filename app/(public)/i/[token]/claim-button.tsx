"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDict } from "@/lib/i18n/client";
import { claimInvite, withdrawClaim } from "@/lib/orders/invite";

/**
 * ⚠️ ส่ง `revisionId` ไปด้วยเสมอ ไม่ใช่แค่โทเคน
 *
 * ครีเอเตอร์แก้ราคาได้ระหว่างที่หน้านี้ค้างอยู่ ถ้ารับด้วยโทเคนเปล่า ๆ
 * ลูกค้าจะกดตกลงกับตัวเลขที่ไม่เคยอ่าน — ระบุฉบับแล้วฉบับเก่าจะกดไม่ผ่าน
 * แล้วเรารีเฟรชหน้าให้อ่านฉบับใหม่แทน
 */
export function ClaimButton({ token, revisionId }: { token: string; revisionId: string }) {
  const t = useDict();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await claimInvite(token, revisionId);
            if (res.ok) {
              toast.success(t.invite.claimedTitle);
              router.refresh();
              return;
            }
            if (res.error === "superseded") {
              toast.error(t.quote.errorSuperseded);
              router.refresh();
              return;
            }
            toast.error(
              res.error === "wrong_account"
                ? t.invite.wrongAccountTitle
                : res.error === "closed"
                  ? t.invite.deadTitle
                  : res.error === "conflict"
                    ? t.invite.takenAlready
                    : t.error.title,
            );
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {t.invite.acceptCta}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t.invite.acceptHint}</p>
    </div>
  );
}


/** ถอนคำขอของตัวเอง — ทางออกเดียวของลูกค้า ปุ่มยืนยันอยู่ฝั่งครีเอเตอร์ทั้งหมด */
export function WithdrawClaimButton({ claimId }: { claimId: string }) {
  const t = useDict();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="mt-2 w-full"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await withdrawClaim(claimId);
          if (res.ok) toast.success(t.invite.withdrawn);
          else toast.error(t.error.title);
          router.refresh();
        })
      }
    >
      {t.invite.withdrawCta}
    </Button>
  );
}

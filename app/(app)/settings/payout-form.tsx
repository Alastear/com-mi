"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n/client";
import { PROMPTPAY_TYPES, type PromptPayType } from "@/lib/payments/promptpay-id";
import { savePayout, type SavePayoutResult } from "./actions";

export function PayoutForm({
  initial,
}: {
  initial: { type: PromptPayType; id: string; name: string; bankName: string; bankAccountNumber: string; bankAccountName: string; trueWalletPhone: string; trueWalletName: string };
}) {
  const { t, locale } = useLocale();
  const th = locale === "th";
  const [state, action, saving] = useActionState<SavePayoutResult, FormData>(savePayout, undefined);
  const [type, setType] = useState<PromptPayType>(initial.type);

  if (state?.ok) {
    queueMicrotask(() => toast.success(t.settings.saved));
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="promptpayType" value={type} />

      <div>
        <Label>{t.settings.promptpayType}</Label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {PROMPTPAY_TYPES.map((x) => (
            <Button
              key={x}
              type="button"
              size="sm"
              variant={x === type ? "default" : "outline"}
              onClick={() => setType(x)}
            >
              {x === "phone" ? t.settings.promptpayPhone : t.settings.promptpayNationalId}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="promptpayId">{t.settings.promptpayLabel}</Label>
          <Input
            id="promptpayId"
            name="promptpayId"
            defaultValue={initial.id}
            inputMode="numeric"
            maxLength={40}
            placeholder={type === "phone" ? "08X-XXX-XXXX" : "X-XXXX-XXXXX-XX-X"}
            className="tabular mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="promptpayName">{t.settings.promptpayName}</Label>
          <Input
            id="promptpayName"
            name="promptpayName"
            defaultValue={initial.name}
            maxLength={80}
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-muted-foreground">{t.settings.promptpayNameHint}</p>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-2 font-medium">{th ? "บัญชีธนาคาร" : "Bank transfer"}</legend>
        {[{ key: "bankName", label: th ? "ธนาคาร" : "Bank" }, { key: "bankAccountNumber", label: th ? "เลขบัญชี" : "Account number" }, { key: "bankAccountName", label: th ? "ชื่อบัญชี" : "Account holder" }].map(f => <div key={f.key}>
          <Label htmlFor={f.key}>{f.label}</Label><Input id={f.key} name={f.key} defaultValue={initial[f.key as "bankName" | "bankAccountNumber" | "bankAccountName"]} maxLength={f.key === "bankAccountNumber" ? 30 : 80} className="mt-1.5" />
        </div>)}
      </fieldset>
      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-2 font-medium">TrueMoney Wallet</legend>
        <Label htmlFor="trueWalletPhone">{th ? "เบอร์ Wallet" : "Wallet phone number"}</Label>
        <Input id="trueWalletPhone" name="trueWalletPhone" defaultValue={initial.trueWalletPhone} inputMode="tel" maxLength={30} />
        <Label htmlFor="trueWalletName">{th ? "ชื่อผู้รับ" : "Recipient name"}</Label>
        <Input id="trueWalletName" name="trueWalletName" defaultValue={initial.trueWalletName} maxLength={80} />
        <p className="text-xs text-muted-foreground">{th ? "โอนตรงเข้าบัญชีผู้รับ ชื่ออาจแสดงในแอปของผู้โอน" : "Direct transfers may display the recipient's name in the payer's app."}</p>
      </fieldset>
      {state && !state.ok ? (
        <p className="text-sm text-destructive">{th ? "ข้อมูลรับเงินไม่ถูกต้อง ตรวจเลขบัญชี ชื่อบัญชี และเบอร์ Wallet" : "Check your payout numbers and account holder names."}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <p className="flex-1 text-xs text-muted-foreground">{t.settings.promptpayVerifyNote}</p>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}

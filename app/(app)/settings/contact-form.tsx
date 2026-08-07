"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDict } from "@/lib/i18n/client";
import { saveContact, type SaveContactResult } from "./actions";

/**
 * เบอร์ติดต่อ — แยกฟอร์มจากเลขรับเงินโดยตั้งใจ
 *
 * สองอย่างนี้มักเป็นเบอร์เดียวกัน แต่มีไว้คนละหน้าที่: เลขรับเงินคือปลายทางของเงิน
 * ส่วนเบอร์ติดต่อคือทางถึงตัวคน รวมฟอร์มกันแล้วผู้ใช้จะเข้าใจว่าแก้ที่เดียวได้ทั้งคู่
 */
export function ContactForm({ initial }: { initial: string }) {
  const t = useDict();
  const [state, action, saving] = useActionState<SaveContactResult, FormData>(
    saveContact,
    undefined,
  );

  if (state?.ok) {
    queueMicrotask(() => toast.success(t.settings.saved));
  }

  return (
    <form action={action} className="space-y-3">
      <div>
        <Label htmlFor="contactPhone">{t.settings.contactPhone}</Label>
        <Input
          id="contactPhone"
          name="contactPhone"
          type="tel"
          inputMode="tel"
          defaultValue={initial}
          maxLength={30}
          placeholder="08x-xxx-xxxx"
          className="tabular mt-1.5"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">{t.settings.contactPhoneHint}</p>
      </div>

      {state && !state.ok ? (
        <p className="text-sm text-destructive">{t.settings.contactPhoneInvalid}</p>
      ) : null}

      <Button type="submit" size="sm" disabled={saving}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
        {t.common.save}
      </Button>
    </form>
  );
}

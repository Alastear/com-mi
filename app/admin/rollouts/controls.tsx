"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRollout } from "@/lib/capabilities/rollout-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n/client";

export function RolloutControls({ kind, version, current, shopId }: { kind: "release" | "cohort"; version: number; current?: string; shopId?: string }) {
  const { locale } = useLocale();
  const th = locale === "th";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return <form className="space-y-3 rounded-xl border p-4" onSubmit={event => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    start(async () => {
      try {
        const base = { capability: "crm", version, reason: data.get("reason") };
        const res = await updateRollout(kind === "release" ? { ...base, kind, status: data.get("value") } : { ...base, kind, creatorPageId: shopId ?? data.get("shop"), cohort: data.get("value") });
        setMessage(res.ok ? (th ? "บันทึกพร้อมประวัติแล้ว" : "Saved with audit record") : (th ? "บันทึกไม่ได้ ข้อมูลอาจเปลี่ยนหรือเหตุผลไม่ครบ กรุณาโหลดล่าสุด" : "Could not save. Check input or reload the latest version."));
        if (res.ok) { form.reset(); router.refresh(); }
      } catch { setMessage(th ? "ยังยืนยันผลไม่ได้ กรุณาโหลดล่าสุดก่อนลองอีกครั้ง" : "Result unconfirmed. Reload before retrying."); }
    });
  }}>
    <fieldset disabled={pending} className="space-y-3">
      <legend className="font-medium">{kind === "release" ? (th ? "สถานะ CRM ทั้งระบบ" : "CRM release status") : shopId ?? (th ? "เพิ่มร้านเข้ากลุ่มทดลอง" : "Add a pilot shop")}</legend>
      {kind === "cohort" && !shopId ? <label className="block space-y-1"><span>{th ? "รหัสร้าน (creator page ID)" : "Creator page ID"}</span><Input name="shop" required maxLength={150} /></label> : null}
      <Label className="block">{th ? "เปลี่ยนเป็น" : "Change to"}<select name="value" defaultValue={current ?? (kind === "release" ? "paused" : "beta")} className="mt-2 block min-h-11 w-full rounded-lg border bg-background px-3">{(kind === "release" ? ["internal", "beta", "paused"] : ["internal", "beta", "revoked"]).map(value => <option key={value} value={value}>{value}</option>)}</select></Label>
      <label className="block space-y-1"><span>{th ? "เหตุผล (อย่างน้อย 5 ตัวอักษร)" : "Reason (at least 5 characters)"}</span><Input name="reason" required minLength={5} maxLength={500} /></label>
      <Button type="submit">{pending ? (th ? "กำลังบันทึก…" : "Saving…") : (th ? "บันทึกการเปลี่ยนสิทธิ์" : "Save access change")}</Button>
    </fieldset>
    <p role="status" className="text-sm">{message}</p>
  </form>;
}

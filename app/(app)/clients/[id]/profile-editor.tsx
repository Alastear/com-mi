"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/client";
import { saveClientProfile } from "@/lib/clients/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ProfileEditor({ clientId, profile }: { clientId: string; profile: { note: string; tags: string[]; version: number } }) {
  const { locale } = useLocale();
  const th = locale === "th";
  const router = useRouter();
  const [note, setNote] = useState(profile.note);
  const [tags, setTags] = useState(profile.tags.join(", "));
  const [version, setVersion] = useState(profile.version);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  return <form className="space-y-4 rounded-xl border p-4" onSubmit={event => {
    event.preventDefault(); setMessage("");
    start(async () => {
      try {
        const result = await saveClientProfile({ clientId, note, tags: tags.split(",").map(tag => tag.trim()).filter(Boolean), version });
        if (result.ok) { setVersion(result.version); setMessage(th ? "บันทึกแล้ว" : "Saved"); router.refresh(); }
        else if (result.error === "conflict") { setConflict(true); setMessage(th ? "ข้อมูลเปลี่ยนจากอีกแท็บ คัดลอกข้อความที่แก้ไว้ก่อนโหลดข้อมูลล่าสุด" : "This profile changed in another tab. Copy your edits before loading the latest version."); }
        else setMessage(th ? "บันทึกไม่ได้ ตรวจแท็กไม่เกิน 10 รายการ รายการละ 30 ตัวอักษร และสิทธิ์การใช้งาน" : "Could not save. Check access and use up to 10 tags, each at most 30 characters.");
      } catch { setMessage(th ? "ยังยืนยันการบันทึกไม่ได้ กรุณาลองอีกครั้ง" : "Save could not be confirmed. Please try again."); }
    });
  }}>
    <div><h2 className="font-semibold">{th ? "ข้อมูลส่วนตัวของร้าน" : "Private shop notes"}</h2><p className="mt-1 text-sm text-muted-foreground">{th ? "ลูกค้าและร้านอื่นไม่เห็นโน้ตหรือแท็กเหล่านี้" : "These notes and tags are hidden from clients and other shops."}</p></div>
    <div className="space-y-2"><Label htmlFor="client-note">{th ? "โน้ต" : "Note"}</Label><Textarea id="client-note" value={note} onChange={e => setNote(e.target.value)} maxLength={4000} rows={5} disabled={pending} /></div>
    <div className="space-y-2"><Label htmlFor="client-tags">{th ? "แท็ก (คั่นด้วยเครื่องหมายจุลภาค)" : "Tags (comma-separated)"}</Label><Input id="client-tags" value={tags} onChange={e => setTags(e.target.value)} maxLength={320} disabled={pending} /><p className="text-xs text-muted-foreground">{th ? "สูงสุด 10 แท็ก แท็กละ 30 ตัวอักษร เว้นว่างเพื่อล้าง" : "Up to 10 tags, 30 characters each. Leave blank to clear."}</p></div>
    <p role="status" className="text-sm">{message}</p>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending || conflict}>{pending ? (th ? "กำลังบันทึก…" : "Saving…") : (th ? "บันทึก" : "Save")}</Button>{conflict ? <Button type="button" variant="outline" onClick={() => window.location.reload()}>{th ? "โหลดข้อมูลล่าสุด" : "Load latest"}</Button> : null}</div>
  </form>;
}

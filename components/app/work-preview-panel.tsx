"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n/client";
import { approveWorkPreview, listWorkPreviews } from "@/lib/delivery/previews";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { watermarkedPreview } from "@/lib/media/watermark";
import { registerDelivery, uploadDelivery } from "@/lib/uploads/client";
import { canUploadDelivery } from "@/lib/delivery/path";
import type { OrderStatus } from "@/lib/types";

export function WorkPreviewPanel({ code, viewer, status }: { code: string; viewer: "creator" | "client"; status: OrderStatus }) {
  const { locale, t } = useLocale();
  const th = locale === "th";
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [files, setFiles] = useState<Awaited<ReturnType<typeof listWorkPreviews>>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try { const data = await listWorkPreviews(code); if (active) { setFiles(data); setError(false); } }
      catch { if (active) setError(true); }
    }
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 240_000);
    return () => { active = false; clearInterval(timer); };
  }, [code, refresh]);

  async function upload(file: File) {
    setBusy(true);
    try {
      const preview = await watermarkedPreview(file, `com-mi • ${code} • PREVIEW`);
      const up = await uploadDelivery(code, preview, undefined, "wip");
      const res = await registerDelivery(up);
      if (!res.ok) throw new Error(res.error);
      setRefresh(n => n + 1);
      router.refresh();
      toast.success(th ? "ส่งภาพตัวอย่างพร้อมลายน้ำแล้ว" : "Watermarked preview sent");
    } catch { toast.error(th ? "ส่งตัวอย่างไม่สำเร็จ ใช้ไฟล์ PNG, JPEG หรือ WebP ไม่เกิน 50 MB แล้วลองอีกครั้ง" : "Preview failed. Use PNG, JPEG or WebP up to 50 MB and retry."); }
    finally { setBusy(false); }
  }
  async function approve() {
    if (!files[0] || busy) return;
    setBusy(true);
    try {
      if (!await approveWorkPreview(code, files[0].id)) throw new Error("stale");
      setConfirming(false); setRefresh(n => n + 1); router.refresh();
      toast.success(th ? "ยืนยันงานแล้ว สามารถแจ้งชำระยอดสุดท้ายได้" : "Work approved. You can report the final payment.");
    } catch { toast.error(t.error.title); setRefresh(n => n + 1); router.refresh(); }
    finally { setBusy(false); }
  }
  return <Card id="work-previews" className="mt-4 gap-3 p-5">
    <p className="font-semibold">{th ? "ภาพตัวอย่างสำหรับตรวจงาน" : "Work previews"}</p>
    <p className="text-sm text-muted-foreground">{th ? "ภาพตัวอย่างมีลายน้ำ ไฟล์ต้นฉบับจะอยู่ในส่วนส่งมอบงาน" : "Previews are watermarked. Original files are provided in delivery."}</p>
    {viewer === "creator" && canUploadDelivery(status) ? <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border bg-secondary px-4 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-ring">
      {busy ? (th ? "กำลังส่งตัวอย่าง…" : "Uploading…") : (th ? "เพิ่มภาพตัวอย่างพร้อมลายน้ำ" : "Upload watermarked preview")}
      <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
    </label> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{t.error.title}</p> : null}
    <Button variant="outline" size="sm" disabled={busy} onClick={() => setRefresh(n => n + 1)}>{th ? "โหลดตัวอย่างล่าสุด" : "Refresh previews"}</Button>
    {files[0]?.approved ? <p className="rounded-lg border bg-primary/10 p-3 text-sm font-medium">{th ? "ลูกค้ายืนยันตัวอย่างงานล่าสุดแล้ว" : "The client approved the latest preview."}</p> : viewer === "client" && status === "in_review" && files.length > 0 ? <Button disabled={busy} onClick={() => setConfirming(true)}>{th ? "ยืนยันตัวอย่างงานล่าสุด" : "Approve latest preview"}</Button> : null}
    <Dialog open={confirming} onOpenChange={open => { if (!busy) setConfirming(open); }}><DialogContent showCloseButton={!busy}><DialogTitle>{th ? "ยืนยันตัวอย่างงานนี้?" : "Approve this preview?"}</DialogTitle><DialogDescription>{th ? "ยืนยันว่าตัวอย่างงานล่าสุดตรงตามที่ตกลง จากนั้นแจ้งชำระยอดสุดท้าย ผู้รับงานจะตรวจเงินเข้าแล้วปลดล็อกไฟล์ต้นฉบับ" : "Confirm that the latest preview matches your agreement, then report the final payment. The creator will verify receipt before releasing original files."}</DialogDescription><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>{t.common.cancel}</Button><Button disabled={busy} onClick={() => void approve()}>{th ? "ยืนยันงาน" : "Approve work"}</Button></DialogFooter></DialogContent></Dialog>
    {files.length ? <ul className="grid gap-3 sm:grid-cols-2">{files.map(f => <li key={f.id} className="overflow-hidden rounded-lg border">
      {/* eslint-disable-next-line @next/next/no-img-element -- Short-lived authorized private URL. */}
      <img src={f.url} alt={f.filename} className="max-h-80 w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
      <p className="truncate p-2 text-xs">{f.filename}</p>
    </li>)}</ul> : <p className="text-sm text-muted-foreground">{th ? "ยังไม่มีภาพตัวอย่าง" : "No previews yet"}</p>}
  </Card>;
}

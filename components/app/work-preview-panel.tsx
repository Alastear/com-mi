"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n/client";
import { approveWorkPreview, listWorkPreviews } from "@/lib/delivery/previews";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { watermarkedPreview } from "@/lib/media/watermark";
import { registerDelivery, uploadDelivery, type DeliveryUpload } from "@/lib/uploads/client";
import { uploadFailure } from "@/lib/uploads/errors";
import { canUploadDelivery } from "@/lib/delivery/path";
import type { OrderStatus } from "@/lib/types";

const subscribeReady = () => () => {};

export function WorkPreviewPanel({ code, viewer, status }: { code: string; viewer: "creator" | "client"; status: OrderStatus }) {
  const { locale, t } = useLocale();
  const th = locale === "th";
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [files, setFiles] = useState<Awaited<ReturnType<typeof listWorkPreviews>>>([]);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const stage = useRef("prepare");
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  const [phase, setPhase] = useState("");
  const [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useState<DeliveryUpload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try { const data = await listWorkPreviews(code); if (active) { setFiles(data); setError(false); } }
      catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    }
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 240_000);
    return () => { active = false; clearInterval(timer); };
  }, [code, refresh]);

  useEffect(() => {
    if (!busy && !recovery) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, recovery]);

  function progress(status: string) {
    stage.current = status;
    setPhase(status === "offline" ? (th ? "ออฟไลน์ รอเชื่อมต่อเพื่อทำต่อ…" : "Offline. Waiting to reconnect…")
      : status === "retrying" ? (th ? "การเชื่อมต่อสะดุด กำลังลองซ้ำ…" : "Connection interrupted. Retrying…")
      : status === "saving" ? (th ? "อัปโหลดครบแล้ว กำลังบันทึกภาพตัวอย่าง…" : "Upload complete. Saving preview…")
      : (th ? "กำลังอัปโหลดภาพตัวอย่าง…" : "Uploading preview…"));
  }

  async function save(up: DeliveryUpload) {
    const res = await registerDelivery(up, progress);
    if (!res.ok && res.error === "unconfirmed") {
      setNotice(th ? "อัปโหลดครบแล้ว แต่ยังยืนยันการบันทึกไม่ได้ เปิดหน้านี้ไว้แล้วกดบันทึกอีกครั้ง ไม่ต้องเลือกไฟล์ใหม่" : "Upload complete, but saving is not confirmed. Keep this page open and retry saving without selecting the file again.");
      return;
    }
    setRecovery(null);
    if (!res.ok) throw new Error(res.error);
    setNotice(""); setLoading(true); setRefresh(n => n + 1); router.refresh();
    toast.success(th ? "ส่งภาพตัวอย่างพร้อมลายน้ำแล้ว" : "Watermarked preview sent");
  }

  function failure(error: unknown) {
    const code = error instanceof Error ? error.message : "unknown";
    const category = uploadFailure(code);
    // No filenames, signed URLs, credentials or raw provider errors in diagnostics.
    console.warn("[work-preview]", { category, stage: stage.current });
    setNotice(code === "invalid_image" || code === "InvalidStateError"
      ? (th ? "เปิดภาพไม่ได้ ใช้ PNG, JPEG หรือ WebP ไม่เกิน 50 MB" : "Could not open this image. Use PNG, JPEG or WebP up to 50 MB.")
      : category === "quota" ? t.delivery.quotaFullBeta
      : category === "rate_limited" ? t.delivery.rateLimited
      : category === "invalid_state" ? t.delivery.wrongState
      : (th ? "ยังส่งตัวอย่างไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง หากอัปโหลดครบแล้วให้ใช้ปุ่มบันทึกอีกครั้ง" : "Preview was not confirmed. Check your connection and retry. If upload completed, use Retry saving."));
  }

  async function retrySave() {
    if (!recovery || active.current) return;
    active.current = true; setBusy(true); setNotice("");
    try { await save(recovery); } catch (error) { failure(error); }
    finally { active.current = false; setBusy(false); setPhase(""); }
  }

  async function upload(file: File) {
    if (active.current || recovery) return;
    active.current = true; setBusy(true); setNotice("");
    stage.current = "prepare";
    setPhase(th ? "กำลังสร้างภาพลายน้ำ…" : "Preparing watermarked preview…");
    try {
      const preview = await watermarkedPreview(file, `com-mi • ${code} • PREVIEW`);
      progress("uploading");
      const up = await uploadDelivery(code, preview, undefined, "wip", progress);
      setRecovery(up);
      await save(up);
    } catch (error) { failure(error); }
    finally { active.current = false; setBusy(false); setPhase(""); }
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
      <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={!ready || busy || recovery !== null} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
    </label> : null}
    {phase ? <p role="status" className="text-sm text-muted-foreground">{phase}</p> : null}
    {notice ? <p role="alert" className="rounded-lg border bg-muted/30 p-3 text-sm">{notice}</p> : null}
    {recovery && !busy ? <Button variant="outline" onClick={() => void retrySave()}>{th ? "บันทึกอีกครั้ง (ไม่อัปโหลดใหม่)" : "Retry saving (no re-upload)"}</Button> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{t.error.title}</p> : null}
    <Button variant="outline" size="sm" disabled={busy} onClick={() => setRefresh(n => n + 1)}>{th ? "โหลดตัวอย่างล่าสุด" : "Refresh previews"}</Button>
    {files[0]?.approved ? <p className="rounded-lg border bg-primary/10 p-3 text-sm font-medium">{th ? "ลูกค้ายืนยันตัวอย่างงานล่าสุดแล้ว" : "The client approved the latest preview."}</p> : viewer === "client" && status === "in_review" && files.length > 0 ? <Button disabled={busy} onClick={() => setConfirming(true)}>{th ? "ยืนยันตัวอย่างงานล่าสุด" : "Approve latest preview"}</Button> : null}
    <Dialog open={confirming} onOpenChange={open => { if (!busy) setConfirming(open); }}><DialogContent showCloseButton={!busy}><DialogTitle>{th ? "ยืนยันตัวอย่างงานนี้?" : "Approve this preview?"}</DialogTitle><DialogDescription>{th ? "ยืนยันว่าตัวอย่างงานล่าสุดตรงตามที่ตกลง จากนั้นแจ้งชำระยอดสุดท้าย ผู้รับงานจะตรวจเงินเข้าแล้วปลดล็อกไฟล์ต้นฉบับ" : "Confirm that the latest preview matches your agreement, then report the final payment. The creator will verify receipt before releasing original files."}</DialogDescription><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>{t.common.cancel}</Button><Button disabled={busy} onClick={() => void approve()}>{th ? "ยืนยันงาน" : "Approve work"}</Button></DialogFooter></DialogContent></Dialog>
    {files.length ? <ul className="grid gap-3 sm:grid-cols-2">{files.map(f => <li key={f.id} className="overflow-hidden rounded-lg border">
      {/* eslint-disable-next-line @next/next/no-img-element -- Short-lived authorized private URL. */}
      <img src={f.url} alt={f.filename} className="max-h-80 w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
      <p className="truncate p-2 text-xs">{f.filename}</p>
    </li>)}</ul> : <p className="text-sm text-muted-foreground">{loading ? (th ? "กำลังโหลดภาพตัวอย่าง…" : "Loading previews…") : error ? (th ? "โหลดภาพตัวอย่างไม่สำเร็จ กดโหลดตัวอย่างล่าสุดเพื่อลองใหม่" : "Could not load previews. Use Refresh previews to retry.") : (th ? "ยังไม่มีภาพตัวอย่าง" : "No previews yet")}</p>}
  </Card>;
}

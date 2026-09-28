"use client";

import { quotaFullText } from "@/lib/billing/plans";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp, Loader2, Lock, Package, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useDict } from "@/lib/i18n/client";
import { formatBytes } from "@/lib/format";
import {
  attachDelivery,
  deliverAndRelease,
  removeDeliveryFile,
  requestDeliveryDownload,
  takeOutOfRound,
} from "@/lib/delivery/actions";
import { canUploadDelivery } from "@/lib/delivery/path";
import { attachPlan, namesPreview } from "@/lib/delivery/plan";
import { fill } from "@/lib/i18n/dictionaries";
import { registerDelivery, uploadDelivery, type DeliveryUpload } from "@/lib/uploads/client";
import { stopsBatch, uploadFailure, type UploadFailure } from "@/lib/uploads/errors";
import type { RegisterStatus } from "@/lib/uploads/register-retry";
import type { DeliveryFileRow, DeliveryRow } from "@/lib/delivery/rows";
import { cn } from "@/lib/utils";

/**
 * แผงไฟล์ส่งมอบ — ครีเอเตอร์อัปโหลดและกดส่ง · ลูกค้าดาวน์โหลด
 *
 * ⚠️ ไม่ใช้ `components/media-uploader.tsx` ซ้ำ เพราะตัวนั้นอัปเข้าถังสาธารณะ
 * และแปลงทุกไฟล์เป็น WebP ก่อนอัป ซึ่งจะทำลายไฟล์ส่งมอบ (PSD, ZIP, วิดีโอ)
 *
 * ⚠️ URL ดาวน์โหลดขอทีละครั้งผ่าน Server Action แล้วเปิดทันที
 * ไม่เคยถูกวางไว้ใน HTML — URL ที่ได้เป็น bearer credential ที่ใครถือก็โหลดได้
 */
export function DeliveryPanel({
  code,
  viewer,
  openRound,
  releasedRound,
  releasedFiles,
  pendingFiles,
  canDeliver,
  orderStatus,
}: {
  code: string;
  viewer: "creator" | "client";
  /** รอบที่เตรียมไว้แล้วแต่ยังไม่ปล่อย — ครีเอเตอร์กดปล่อยได้ ลูกค้ายังโหลดไม่ได้ */
  openRound: DeliveryRow | null;
  /** รอบล่าสุดที่ปล่อยไปแล้ว — ลูกค้าโหลดได้ และต้องเห็นต่อไปแม้จะมีรอบใหม่กำลังทำอยู่ */
  releasedRound: DeliveryRow | null;
  /** ไฟล์จากทุกรอบที่ปล่อยแล้ว — ของที่ลูกค้าได้ไปแล้วห้ามหายเมื่อมีรอบใหม่ */
  releasedFiles: DeliveryFileRow[];
  /** ไฟล์ที่ครีเอเตอร์อัปไว้แต่ยังไม่ได้ผูกกับการส่งมอบ */
  pendingFiles: DeliveryFileRow[];
  /** จ่ายครบแล้วหรือยัง — ตัดสินฝั่ง server มาแล้ว */
  canDeliver: boolean;
  orderStatus: string;
}) {
  const t = useDict();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusyState] = useState(false);
  /**
   * สำเนาของ `busy` ที่อ่านได้จากปุ่มใน toast — toast ถือ closure ของตอนที่ถูกสร้าง
   * ซึ่งอาจเก่ากว่าสถานะจริงเป็นนาที อ่าน state ตรง ๆ จะเห็นค่าเก่า
   */
  const busyRef = useRef(false);
  const setBusy = (v: boolean) => {
    busyRef.current = v;
    setBusyState(v);
  };
  /**
   * ความคืบหน้า: ไฟล์ที่เท่าไรจากกี่ไฟล์ เปอร์เซ็นต์ของไฟล์นั้น 0–100 และช่วงที่อยู่
   * ไฟล์ส่งมอบใหญ่ได้ถึง 2 GB ต้องเห็นว่ายังเดินอยู่ — และอัปหลายไฟล์ต้องรู้ว่าถึงไฟล์ไหนแล้ว
   * เดิมมีแค่เปอร์เซ็นต์ วิ่ง 0→100% ซ้ำห้ารอบโดยไม่รู้ว่าเป็นไฟล์ไหน
   *
   * `phase` — อัปครบแล้วยังไม่จบ: การบันทึกลองซ้ำได้เป็นนาทีเมื่อเน็ตหรือเซิร์ฟเวอร์สะดุด
   * ⚠️ ต้องบอกว่ายังบันทึกอยู่ ไม่งั้นจอค้างที่ "100%" นิ่ง ๆ แล้วครีเอเตอร์ปิดแท็บทิ้ง
   */
  const [progress, setProgress] = useState<{
    i: number;
    n: number;
    pct: number;
    phase: "upload" | RegisterStatus;
  } | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const uploadable = canUploadDelivery(orderStatus);
  // ไฟล์ค้างไปทางไหน: เตรียมรอบใหม่ หรือเติมเข้ารอบที่เตรียมไว้ (กติกาและเหตุผลอยู่ใน plan.ts)
  const plan = viewer === "creator" ? attachPlan(pendingFiles.map((f) => f.mediaId), openRound !== null, uploadable) : null;

  /**
   * สถานะที่ `deliverAndRelease()` เดินไป `delivered` ได้จริง ตามเครื่องสถานะ
   *
   * `revision_requested` อัปไฟล์กับเตรียมรอบได้ แต่ปล่อยไม่ได้ — ต้องกด "เริ่มงาน"
   * ก่อนหนึ่งครั้ง ถ้าไม่เช็คตรงนี้ ปุ่มปล่อยจะโผล่มาในสถานะที่กดแล้วขึ้น error เสมอ
   */
  const releasable = ["in_progress", "in_review"].includes(orderStatus);

  function failureText(f: UploadFailure): string {
    switch (f) {
      case "quota":
        return quotaFullText(t.delivery);
      case "too_large":
        return t.delivery.tooLarge;
      case "rate_limited":
        return t.delivery.rateLimited;
      case "invalid_state":
        return t.delivery.wrongState;
      case "empty":
        return t.delivery.emptyFile;
      default:
        return t.delivery.failed;
    }
  }

  /**
   * อัปทีละไฟล์ และจับ error **ทีละไฟล์**
   *
   * เดิม error ของไฟล์เดียวหลุดออกจากลูปทั้งชุด ไฟล์ที่เหลือไม่ถูกอัปโดยไม่มีข้อความบอก
   * (เช่นมีไฟล์ว่าง 0 ไบต์ปนมาเป็นไฟล์ที่สอง อีกสามไฟล์หายเงียบ)
   * ตอนนี้ไฟล์ที่ล้มขึ้นชื่อของมันใน toast แล้วไปต่อไฟล์ถัดไป — ยกเว้นเหตุที่ไฟล์ถัดไป
   * จะล้มเหมือนกันแน่ (`stopsBatch`: โควตาเต็ม ถี่เกิน สถานะงานเปลี่ยน) หยุดแล้วบอกว่าข้ามกี่ไฟล์
   */
  async function handleFiles(files: FileList | null) {
    if (!files?.length || busyRef.current) return;
    setBusy(true);
    const list = Array.from(files).slice(0, 20);
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const n = list.length;
        setProgress({ i: i + 1, n, pct: 0, phase: "upload" });
        let failure: UploadFailure | null = null;
        try {
          const up = await uploadDelivery(code, file, (f) =>
            setProgress({ i: i + 1, n, pct: Math.floor(f * 100), phase: "upload" }),
          );
          const res = await registerDelivery(up, (phase) => setProgress({ i: i + 1, n, pct: 100, phase }));
          if (!res.ok && res.error === "unconfirmed") {
            // ไม่ใช่ความล้มเหลวที่ทำให้ไฟล์ถัดไปล้มแน่ — ไปต่อ แล้วเปิดทางให้กดบันทึกซ้ำ
            notifyUnconfirmed(up, file.name);
            continue;
          }
          if (!res.ok) failure = uploadFailure(res.error);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          console.error("[delivery-upload]", msg);
          failure = uploadFailure(msg);
        }
        if (failure === null) continue;

        const left = list.length - i - 1;
        const stop = stopsBatch(failure) && left > 0;
        toast.error(failureText(failure), {
          description: stop ? `${file.name} · ${fill(t.delivery.skipped, { n: left })}` : file.name,
        });
        if (stopsBatch(failure)) break;
      }
    } finally {
      // ไฟล์ก่อนหน้าในชุดเดียวกันอาจบันทึกไปแล้ว — ต้องให้รายการบนจอตามทัน
      router.refresh();
      setProgress(null);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /**
   * ลองบันทึกซ้ำจนหมดเวลาแล้วยังไม่รู้ผล — ⚠️ ห้ามบอกว่าไฟล์หาย
   * คำขอไม่ถูกยกเลิก ชิ้นที่อัปไปแล้วยังอยู่ และอาจบันทึกไปแล้วด้วยซ้ำ (คำตอบหายกลางทาง)
   * toast ค้างไว้จนกว่าจะปิดเอง พร้อมปุ่มบันทึกอีกครั้งที่ใช้ `up` เดิม ไม่ต้องอัป 2 GB ใหม่
   * (`up` อยู่ในหน่วยความจำของหน้านี้เท่านั้น — ปิดหน้าไปแล้วก็ต้องอัปใหม่ ข้อความบอกไว้แล้ว)
   */
  function notifyUnconfirmed(up: DeliveryUpload, name: string) {
    toast.warning(t.delivery.unconfirmed, {
      description: fill(t.delivery.unconfirmedHint, { name }),
      duration: Infinity,
      closeButton: true,
      action: {
        label: t.delivery.saveAgain,
        onClick: (e) => {
          if (busyRef.current) {
            // กำลังอัปไฟล์อื่นอยู่ — เก็บ toast ไว้ให้กดใหม่ทีหลัง (Server Action วิ่งทีละตัวอยู่แล้ว)
            e.preventDefault();
            toast.info(t.delivery.waitCurrent);
            return;
          }
          void saveAgain(up, name);
        },
      },
    });
  }

  async function saveAgain(up: DeliveryUpload, name: string) {
    setBusy(true);
    setProgress({ i: 1, n: 1, pct: 100, phase: "saving" });
    try {
      const res = await registerDelivery(up, (phase) => setProgress({ i: 1, n: 1, pct: 100, phase }));
      if (res.ok) toast.success(t.delivery.saved, { description: name });
      else if (res.error === "unconfirmed") notifyUnconfirmed(up, name);
      else toast.error(failureText(uploadFailure(res.error)), { description: name });
    } finally {
      router.refresh();
      setProgress(null);
      setBusy(false);
    }
  }

  /** ข้อความบนช่องอัปโหลดระหว่างทำงาน */
  function busyText(): string {
    if (progress === null) return t.delivery.uploading;
    if (progress.phase === "upload") {
      return progress.n > 1
        ? fill(t.delivery.uploadingOf, { i: progress.i, n: progress.n, p: progress.pct })
        : `${t.delivery.uploading} ${progress.pct}%`;
    }
    const text =
      progress.phase === "offline"
        ? t.delivery.savingOffline
        : progress.phase === "retrying"
          ? t.delivery.savingRetry
          : t.delivery.saving;
    return progress.n > 1 ? `${progress.i}/${progress.n} · ${text}` : text;
  }

  /** ข้อความของผลที่ไม่ผ่านซึ่งเกิดจากหน้าจอเก่ากว่าของจริง — โหลดใหม่ให้ด้วยเสมอ */
  function staleText(error: string): string {
    if (error === "stale") return t.delivery.roundChanged;
    if (error === "not_allowed") return t.delivery.cannotChangeRound;
    return t.error.title;
  }

  function prepare() {
    if (!plan) return;
    /**
     * เติมเข้ารอบ = ส่งไฟล์ค้าง **ทุกไฟล์** และลูกค้าเห็นชื่อไฟล์ในรอบทันที (ล็อกไว้) — ถามก่อนพร้อมรายชื่อ
     * ปุ่มนี้คือปุ่มที่กดต่อจากอัปไฟล์ทันที ซึ่งอาจยังไม่ได้ดูว่าอัปไฟล์ถูกหรือเปล่า
     * (เอาออกจากรอบได้ด้วยปุ่มข้างไฟล์ แต่ชื่อไฟล์ที่ลูกค้าเห็นไปแล้วเอาคืนไม่ได้)
     */
    if (plan.mode === "add") {
      const ids = new Set(plan.mediaIds);
      const adding = pendingFiles.filter((f) => ids.has(f.mediaId));
      const text = fill(t.delivery.addConfirm, { n: adding.length, names: nameList(adding) });
      if (!window.confirm(text)) return;
    }
    start(async () => {
      const res = await attachDelivery({
        code,
        mediaIds: plan.mediaIds,
        note,
        licenseType: "personal",
      });
      if (res.ok) {
        if (res.added) toast.success(t.delivery.addedToRound);
        else setNote("");
      } else {
        toast.error(staleText(res.error));
      }
      router.refresh();
    });
  }

  /**
   * ลบไฟล์ที่อัปผิด — เฉพาะไฟล์ที่ยังไม่อยู่ในรอบไหน (server ตรวจซ้ำเป็น compare-and-set)
   * ถามก่อนเสมอ: ไฟล์ส่งมอบใหญ่ได้ถึง 2 GB อัปใหม่บนเน็ตบ้านใช้เวลาเป็นชั่วโมง
   */
  async function remove(f: DeliveryFileRow) {
    if (removing) return;
    if (!window.confirm(fill(t.delivery.removeConfirm, { name: f.filename || f.mediaId }))) return;
    setRemoving(f.mediaId);
    try {
      const res = await removeDeliveryFile(code, f.mediaId);
      if (res.ok) toast.success(t.delivery.removed);
      else toast.error(staleText(res.error));
      router.refresh();
    } catch {
      toast.error(t.error.title);
    } finally {
      setRemoving(null);
    }
  }

  /** รายชื่อไฟล์สำหรับกล่องยืนยัน — ย่อเมื่อยาว */
  function nameList(files: readonly DeliveryFileRow[]): string {
    const { shown, more } = namesPreview(files.map((f) => f.filename || f.mediaId));
    const lines = shown.map((n) => `• ${n}`);
    if (more > 0) lines.push(fill(t.delivery.andMore, { n: more }));
    return lines.join("\n");
  }

  /** เอาไฟล์ออกจากรอบที่ยังไม่ปล่อย — ไฟล์ไม่หาย กลับไปเป็นไฟล์ค้าง จึงไม่ต้องถาม */
  async function takeOut(f: DeliveryFileRow) {
    if (removing) return;
    setRemoving(f.mediaId);
    try {
      const res = await takeOutOfRound(code, f.mediaId);
      if (res.ok) toast.success(t.delivery.takenOut);
      else toast.error(staleText(res.error));
      router.refresh();
    } catch {
      toast.error(t.error.title);
    } finally {
      setRemoving(null);
    }
  }

  function release() {
    if (!openRound) return;
    /**
     * ⚠️ ไฟล์ค้างที่ไม่อยู่ในรอบจะไม่ถูกส่ง — ถามก่อนทุกครั้ง
     * ครีเอเตอร์อัปไฟล์เพิ่มหลังกดเตรียม แล้วกดปุ่มหลัก "ส่งมอบ" โดยเข้าใจว่าไปทั้งหมด
     * เคยเป็นแบบนั้นแล้วไฟล์นั้นหลุดไปอยู่บนออเดอร์ที่ปิดงานแล้ว (ตอนนี้ลบทิ้งได้ แต่ลูกค้าไม่ได้ไฟล์)
     */
    if (loose.length > 0) {
      const text = fill(t.delivery.releaseLeavesOut, { n: loose.length, names: nameList(loose) });
      if (!window.confirm(text)) return;
    }
    start(async () => {
      const res = await deliverAndRelease(code, openRound.id);
      if (res.ok) {
        toast.success(t.delivery.released);
      } else {
        toast.error(
          res.error === "not_paid"
            ? t.delivery.notPaid
            : res.error === "no_files"
              ? t.delivery.noFilesYet
              : staleText(res.error),
        );
      }
      // ⚠️ refresh ทุกผล — `stale` คือแท็บนี้เห็นรอบที่ถูกปล่อยไปแล้ว ไม่โหลดใหม่ก็กดแล้วพังซ้ำไม่รู้จบ
      router.refresh();
    });
  }

  async function download(mediaId: string) {
    setDownloading(mediaId);
    try {
      const res = await requestDeliveryDownload(code, mediaId);
      if (res.ok) {
        // เปิดทันที ไม่เก็บ URL ไว้ที่ไหน — อายุ 15 นาทีและใครถือก็โหลดได้
        window.location.href = res.url;
      } else {
        toast.error(res.error === "not_paid" ? t.delivery.lockedUntilPaid : t.error.title);
      }
    } finally {
      setDownloading(null);
    }
  }

  /**
   * ไฟล์ที่ยังไม่ถูกปล่อยมีสองกอง: รอบที่เตรียมไว้ กับไฟล์ค้างที่ยังไม่อยู่ในรอบไหน
   * ลูกค้าเห็นแค่รอบที่เตรียมไว้ (ล็อกอยู่) — ไฟล์ค้างเป็นของครีเอเตอร์คนเดียว
   *
   * ⚠️ เดิมรวมเป็นกองเดียว `openRound?.files ?? pendingFiles` ไฟล์ที่อัปหลังกดเตรียม
   * จึงหายไปจากจอครีเอเตอร์ทันทีที่มีรอบเปิด ทั้งที่อัปสำเร็จและกินพื้นที่อยู่
   */
  const roundFiles = openRound?.files ?? [];
  const loose = viewer === "creator" ? pendingFiles : [];

  /** `action` — ปุ่มข้างไฟล์ของครีเอเตอร์: ลบทิ้ง (ไฟล์ค้าง) หรือเอาออกจากรอบ (รอบที่ยังไม่ปล่อย) */
  function fileRow(f: DeliveryFileRow, canDownload: boolean, action: "remove" | "takeOut" | null = null) {
    return (
      <li key={f.mediaId} className="flex items-center gap-3 rounded-lg border p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{f.filename || f.mediaId}</p>
          <p className="tabular text-xs text-muted-foreground">{formatBytes(f.bytes)}</p>
        </div>
        {canDownload ? (
          <Button
            size="sm"
            variant="outline"
            disabled={downloading === f.mediaId}
            onClick={() => void download(f.mediaId)}
          >
            {downloading === f.mediaId ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {downloading === f.mediaId ? t.delivery.downloading : t.delivery.download}
          </Button>
        ) : viewer === "client" ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            {t.delivery.lockedUntilPaid}
          </span>
        ) : action === "remove" ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={t.delivery.removeFile}
            title={t.delivery.removeFile}
            disabled={removing !== null || busy || pending}
            onClick={() => void remove(f)}
          >
            {removing === f.mediaId ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </Button>
        ) : action === "takeOut" ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 text-muted-foreground"
            aria-label={t.delivery.takeOut}
            title={t.delivery.takeOut}
            disabled={removing !== null || busy || pending}
            onClick={() => void takeOut(f)}
          >
            {removing === f.mediaId ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
          </Button>
        ) : null}
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Package className="size-4" />
          {t.delivery.title}
        </p>
        {releasedRound ? <Badge variant="secondary">{t.delivery.released}</Badge> : null}
      </div>

      {releasedFiles.length === 0 && roundFiles.length === 0 && loose.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.delivery.noFiles}</p>
      ) : null}

      {/* ปล่อยแล้ว — ต้องเห็นต่อไปแม้กำลังทำรอบแก้อยู่ ลูกค้าซื้อไปแล้ว */}
      {releasedFiles.length > 0 ? (
        <ul className="space-y-2">{releasedFiles.map((f) => fileRow(f, true))}</ul>
      ) : null}

      {/* รอบที่เตรียมไว้ ยังไม่ปล่อย */}
      {roundFiles.length > 0 ? (
        <>
          {releasedFiles.length > 0 ? (
            <p className="text-xs font-medium text-muted-foreground">{t.delivery.nextRound}</p>
          ) : loose.length > 0 ? (
            <p className="text-xs font-medium text-muted-foreground">{t.delivery.files}</p>
          ) : null}
          {/* เอาออกจากรอบได้เฉพาะครีเอเตอร์และตอนงานยังเปิด — ลูกค้าเห็นแค่ไฟล์ที่ล็อกไว้ */}
          <ul className="space-y-2">
            {roundFiles.map((f) => fileRow(f, false, viewer === "creator" && uploadable ? "takeOut" : null))}
          </ul>
        </>
      ) : null}

      {/*
        ไฟล์ค้าง (ครีเอเตอร์เท่านั้น) — ลบได้ตลอดตราบที่ยังไม่อยู่ในรอบไหน **ไม่ว่างานจะอยู่สถานะไหน**
        ⚠️ งานปิดแล้วไฟล์พวกนี้ไม่มีทางไปไหนอีก ถ้าไม่มีปุ่มลบจะกินพื้นที่ตลอดกาล
        และห้ามใช้หัวข้อ "รอบถัดไป" ตอนงานปิดแล้ว — ไม่มีรอบถัดไปให้ส่ง
      */}
      {loose.length > 0 ? (
        <>
          {!uploadable ? (
            <p className="text-xs font-medium text-muted-foreground">{t.delivery.notSent}</p>
          ) : openRound ? (
            <p className="text-xs font-medium text-muted-foreground">{t.delivery.notInRound}</p>
          ) : releasedFiles.length > 0 ? (
            <p className="text-xs font-medium text-muted-foreground">{t.delivery.nextRound}</p>
          ) : null}
          <ul className="space-y-2">{loose.map((f) => fileRow(f, false, "remove"))}</ul>
        </>
      ) : null}

      {releasedRound ? (
        <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          {t.delivery.linkWarning}
        </p>
      ) : null}

      {/*
        ⚠️ ไม่ปิดทั้งแผงเมื่อปล่อยรอบก่อนไปแล้ว
        เดิมเงื่อนไขคือ `!delivery?.released` ครีเอเตอร์จึงไม่มีทั้งช่องอัปโหลด
        ปุ่มเตรียม และปุ่มปล่อย ทันทีที่ปล่อยรอบแรก — พอลูกค้าขอแก้งาน
        ออเดอร์ก็เดินต่อไม่ได้อีกเลย และไฟล์ที่อัปหลังจากนั้นหายเงียบ
      */}
      {viewer === "creator" ? (
        <>
          <Separator />
          {uploadable ? (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                id={`delivery-${code}`}
                className="sr-only"
                onChange={(e) => void handleFiles(e.target.files)}
              />
              <label
                htmlFor={`delivery-${code}`}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors hover:border-primary/50",
                  busy && "pointer-events-none opacity-60",
                )}
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin text-primary" />
                ) : (
                  <FileUp className="size-5 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {busy ? busyText() : t.delivery.upload}
                </span>
                <span className="text-xs text-muted-foreground">{t.delivery.uploadHint}</span>
              </label>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t.delivery.wrongState}</p>
          )}

          {/* เตรียมรอบใหม่ได้เมื่อมีไฟล์ค้างและยังไม่มีรอบไหนเปิดอยู่ */}
          {plan?.mode === "prepare" ? (
            <>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder={t.delivery.note}
                className="resize-none"
              />
              <Button onClick={prepare} disabled={pending || busy || removing !== null} className="w-full">
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {t.delivery.prepare}
              </Button>
            </>
          ) : null}

          {/* มีรอบที่เตรียมไว้แล้ว — ไฟล์ที่อัปทีหลังเติมเข้ารอบนั้นได้จนกว่าจะกดส่งมอบ */}
          {plan?.mode === "add" ? (
            <>
              <p className="text-xs text-muted-foreground">{t.delivery.addHint}</p>
              <Button
                variant="outline"
                onClick={prepare}
                disabled={pending || busy || removing !== null}
                className="w-full"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {fill(t.delivery.addToRound, { n: plan.mediaIds.length })}
              </Button>
            </>
          ) : null}

          {openRound ? (
            <>
              <p className="text-xs text-muted-foreground">
                {releasable ? t.delivery.releaseHint : t.delivery.startWorkFirst}
              </p>
              {releasable ? (
                <Button
                  onClick={release}
                  disabled={pending || busy || removing !== null || !canDeliver}
                  className="w-full"
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {canDeliver ? t.delivery.release : t.delivery.notPaid}
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

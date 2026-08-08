"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useDict } from "@/lib/i18n/client";
import {
  suspendShop,
  suspendUser,
  unsuspendShop,
  unsuspendUser,
  type AdminResult,
} from "@/lib/admin/actions";

type Kind = "shop" | "user";

/**
 * ปุ่มระงับ/ปลดระงับ พร้อมช่องเหตุผลที่ข้ามไม่ได้
 *
 * เหตุผลบังคับกรอกทั้งตอนระงับและตอนปลด — ตอนปลดสำคัญพอกัน เพราะคำถามที่จะถูกถาม
 * ทีหลังคือ "ทำไมถึงปลดให้" ไม่ใช่แค่ "ทำไมถึงระงับ"
 */
export function SuspendControls({
  kind,
  id,
  suspended,
}: {
  kind: Kind;
  id: string;
  suspended: boolean;
}) {
  const t = useDict().admin;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const label = suspended
    ? kind === "shop"
      ? t.unsuspend
      : t.unsuspendUser
    : kind === "shop"
      ? t.suspend
      : t.suspendUser;

  function run() {
    if (reason.trim().length < 3) {
      toast.error(t.reasonRequired);
      return;
    }
    start(async () => {
      const fn = suspended
        ? kind === "shop"
          ? unsuspendShop
          : unsuspendUser
        : kind === "shop"
          ? suspendShop
          : suspendUser;
      const res: AdminResult = await fn({ id, reason });
      if (res.ok) {
        setOpen(false);
        setReason("");
        router.refresh();
      } else {
        // เคสนี้ยาวและสำคัญพอที่จะกินพื้นที่ toast เต็ม ๆ — ไม่ใช่ error ทั่วไป
        toast.error(
          res.error === "has_unreleased_paid_work" ? t.blockedPaidWork : t.actionFailed,
          { duration: res.error === "has_unreleased_paid_work" ? 12_000 : 5_000 },
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={suspended ? "outline" : "ghost"} size="sm" className="whitespace-nowrap">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {suspended ? t.reasonHint : kind === "shop" ? t.suspendShopHint : t.suspendUserHint}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.reason}
            maxLength={500}
            autoFocus
          />
          <p className="mt-1.5 text-xs text-muted-foreground">{t.reasonHint}</p>
        </div>
        <DialogFooter>
          <Button onClick={run} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

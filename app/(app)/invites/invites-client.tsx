"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CopyLinkButton } from "@/components/copy-link-button";
import { useLocale } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/format";
import { depositFor } from "@/lib/orders/pricing";
import { createInvite, revokeInvite } from "@/lib/orders/invite";
import { siteUrl } from "@/lib/site";

/**
 * ออกลิงก์คำเชิญให้ลูกค้ามากดรับ
 *
 * ⚠️ อีเมลเป็นช่องบังคับ ไม่มีโหมด "ใครถือลิงก์ก็กดได้"
 * เหตุผลอยู่ใน `lib/orders/invite.ts` — ย่อ ๆ คือ ถ้าไม่มีอีเมลให้เทียบ
 * ขั้นยืนยันของครีเอเตอร์ก็ไม่ได้ยืนยันอะไรเลย และปุ่มกดรับจะกลายเป็นเครื่องเก็บอีเมล
 */

type Row = { key: string; label: string; baht: string };
type Invite = {
  id: string;
  token: string;
  email: string;
  serviceTitle: string;
  revokedAt: Date | null;
  confirmedAt: Date | null;
  expiresAt: Date | null;
  orderCode: string | null;
  live: { totalCents: number; depositCents: number } | null;
  claim: { name: string; email: string; claimedAt: Date } | null;
};

const DEPOSITS = [0, 25, 50, 100] as const;

let seq = 0;
const newRow = (): Row => ({ key: `r${(seq += 1)}`, label: "", baht: "" });

export function InvitesClient({
  services,
  invites,
}: {
  services: Array<{ slug: string; title: string }>;
  invites: Invite[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState(services[0]?.slug ?? "");
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [depositPercent, setDepositPercent] = useState(50);
  const [note, setNote] = useState("");

  // สูตรเดียวกับ server — บรรทัดที่ไม่มีชื่อถูกทิ้ง ยอดที่เห็นจึงตรงกับใบที่ออกจริง
  const totalBaht = rows.reduce((n, r) => {
    if (r.label.trim() === "") return n;
    const v = Number(r.baht);
    return n + (Number.isFinite(v) ? Math.trunc(v) : 0);
  }, 0);

  function submit() {
    start(async () => {
      const res = await createInvite({
        email,
        serviceSlug: slug,
        lines: rows.map((r) => ({
          label: r.label,
          amountCents: Math.trunc(Number(r.baht) || 0) * 100,
        })),
        depositPercent,
        note,
        expiresInDays: 14,
      });
      if (res.ok) {
        toast.success(t.invite.created);
        setOpen(false);
        setEmail("");
        setRows([newRow()]);
        setNote("");
        router.refresh();
        return;
      }
      toast.error(
        res.error === "empty"
          ? t.quote.errorEmpty
          : res.error === "too_large"
            ? t.quote.errorTooLarge
            : res.error === "rate_limited"
              ? t.quote.errorRateLimited
              : res.error === "shop_closed"
                ? t.invite.errorShopClosed
                : res.error === "not_found"
                  ? t.invite.errorNoService
                  : t.error.title,
      );
    });
  }

  if (services.length === 0) {
    // ออเดอร์ต้องผูกกับบริการเสมอ — ไม่มีบริการก็ออกใบไม่ได้
    return (
      <Card className="mt-6 gap-1.5 p-6">
        <p className="font-medium">{t.invite.errorNoService}</p>
        <p className="text-sm text-muted-foreground">{t.invite.noServiceHint}</p>
      </Card>
    );
  }

  return (
    <>
      <div className="mt-6 flex justify-end">
        <Button size="sm" onClick={() => setOpen((o) => !o)} variant={open ? "outline" : "default"}>
          {open ? t.common.cancel : t.invite.newCta}
        </Button>
      </div>

      {open ? (
        <Card className="mt-4 gap-4 p-5">
          <div>
            <Label htmlFor="inv-email">{t.invite.email}</Label>
            <Input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              className="mt-1.5"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{t.invite.emailHint}</p>
          </div>

          <div>
            <Label className="text-sm">{t.invite.service}</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {services.map((s) => (
                <Button
                  key={s.slug}
                  type="button"
                  size="sm"
                  variant={s.slug === slug ? "default" : "outline"}
                  onClick={() => setSlug(s.slug)}
                >
                  {s.title}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center gap-2">
                <Input
                  value={r.label}
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)),
                    )
                  }
                  placeholder={t.quote.linePlaceholder}
                  maxLength={120}
                  className="flex-1"
                />
                <Input
                  value={r.baht}
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((x) =>
                        x.key === r.key
                          ? { ...x, baht: e.target.value.replace(/[^\d-]/g, "") }
                          : x,
                      ),
                    )
                  }
                  inputMode="numeric"
                  placeholder="0"
                  aria-label={t.quote.amount}
                  className="tabular w-28 text-right"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={rows.length === 1}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  aria-label={t.common.delete}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setRows((rs) => [...rs, newRow()])}
          >
            <Plus className="size-4" />
            {t.quote.addLine}
          </Button>

          <div className="flex items-center justify-between">
            <span className="font-medium">{t.order.total}</span>
            <span className="tabular text-lg font-semibold">
              {formatMoney(totalBaht * 100, "THB", locale)}
            </span>
          </div>

          <div>
            <Label className="text-sm">{t.quote.deposit}</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {DEPOSITS.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={d === depositPercent ? "default" : "outline"}
                  onClick={() => setDepositPercent(d)}
                >
                  {d === 0 ? t.quote.depositNone : `${d}%`}
                </Button>
              ))}
            </div>
            {depositPercent > 0 ? (
              <p className="tabular mt-1.5 text-sm text-muted-foreground">
                {t.quote.depositAmount.replace(
                  "{amount}",
                  formatMoney(depositFor(totalBaht * 100, depositPercent), "THB", locale),
                )}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="inv-note" className="text-sm">
              {t.quote.note}
            </Label>
            <Textarea
              id="inv-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
              className="mt-1.5"
            />
          </div>

          <Button onClick={submit} disabled={pending || totalBaht <= 0 || !email} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t.invite.createCta}
          </Button>
        </Card>
      ) : null}

      <div className="mt-5 space-y-3">
        {invites.length === 0 ? (
          <Card className="gap-1.5 p-6 text-center">
            <p className="text-sm text-muted-foreground">{t.invite.empty}</p>
          </Card>
        ) : null}

        {invites.map((inv) => {
          const dead = Boolean(inv.revokedAt) || Boolean(inv.confirmedAt);
          return (
            <Card key={inv.id} className="gap-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{inv.email}</p>
                  <p className="text-sm text-muted-foreground">{inv.serviceTitle}</p>
                </div>
                <Badge variant={inv.confirmedAt ? "default" : inv.revokedAt ? "secondary" : "outline"}>
                  {inv.confirmedAt
                    ? t.invite.stateConfirmed
                    : inv.revokedAt
                      ? t.invite.stateRevoked
                      : inv.claim
                        ? t.invite.stateClaimed
                        : t.invite.stateWaiting}
                </Badge>
              </div>

              {inv.live ? (
                <p className="tabular text-sm">
                  {formatMoney(inv.live.totalCents, "THB", locale)}
                  {inv.live.depositCents > 0
                    ? ` · ${t.quote.deposit} ${formatMoney(inv.live.depositCents, "THB", locale)}`
                    : ""}
                </p>
              ) : null}

              {/*
                คนที่กดรับ — แสดง **อีเมล** ไม่ใช่แค่ชื่อ
                ชื่อกับรูปผู้ใช้แก้เองได้ทั้งคู่ อีเมลจึงเป็นสิ่งเดียวที่ยืนยันตัวคนได้
                และเป็นเหตุผลทั้งหมดที่ขั้นยืนยันนี้มีอยู่
              */}
              {inv.claim ? (
                <div className="rounded-lg border border-primary/30 bg-primary/[0.05] p-3 text-sm">
                  <p className="font-medium">{t.invite.claimedBy}</p>
                  <p className="tabular mt-0.5 truncate">{inv.claim.email}</p>
                  {inv.claim.email.toLowerCase() !== inv.email.toLowerCase() ? (
                    <p className="mt-1 text-xs text-destructive">{t.invite.emailMismatch}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {!dead ? (
                  <CopyLinkButton
                    value={`${siteUrl()}/i/${inv.token}`}
                    label={t.invite.copyLink}
                    size="sm"
                  />
                ) : null}
                {inv.orderCode ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={`/orders/${inv.orderCode}`}>
                      <Link2 className="size-3.5" />
                      {inv.orderCode}
                    </a>
                  </Button>
                ) : null}
                {!dead ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await revokeInvite(inv.id);
                        if (res.ok) {
                          toast.success(t.invite.revoked);
                          router.refresh();
                        } else toast.error(t.error.title);
                      })
                    }
                  >
                    {t.invite.revoke}
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

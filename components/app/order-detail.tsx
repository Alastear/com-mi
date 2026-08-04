"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CircleDollarSign,
  Download,
  Lock,
  Paperclip,
  Send,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { ArtAvatar, ArtImage } from "@/components/art-image";
import { OrderStatusPill } from "@/components/status-pill";
import { LockedFeature } from "@/components/locked-feature";
import { PromptPayQrDialog } from "@/components/app/promptpay-qr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useLocale } from "@/lib/i18n/client";
import { daysUntil, formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { creator } from "@/lib/mock/data";

/**
 * ปุ่มหลัก "ปุ่มเดียว" ตามสถานะปัจจุบัน
 * หลักการ: หนึ่งหน้าจอต้องตอบได้ทันทีว่าตอนนี้ต้องทำอะไรต่อ (docs/04-ux-and-ia.md §3.4)
 */
function primaryAction(status: OrderStatus, t: Dictionary) {
  const map: Partial<Record<OrderStatus, { label: string; disabled?: boolean }>> = {
    requested: { label: t.orderAction.sendQuote },
    reviewing: { label: t.orderAction.sendQuote },
    quoted: { label: t.orderAction.waitingClient, disabled: true },
    accepted: { label: t.orderAction.startWork },
    in_progress: { label: t.orderAction.submitWip },
    in_review: { label: t.orderAction.waitingClient, disabled: true },
    revision_requested: { label: t.orderAction.submitRevision },
    delivered: { label: t.orderAction.waitingClient, disabled: true },
  };
  return map[status] ?? null;
}

export function OrderDetail({ order }: { order: Order }) {
  const { t, locale } = useLocale();
  const [draft, setDraft] = useState("");

  const remaining = Math.max(0, order.totalCents - order.paidCents);
  const paidPercent =
    order.totalCents > 0 ? Math.round((order.paidCents / order.totalCents) * 100) : 0;
  const filesLocked = remaining > 0;
  const days = order.dueAt !== undefined ? daysUntil(order.dueAt) : null;
  const action = primaryAction(order.status, t);

  function send() {
    if (!draft.trim()) return;
    toast.success(
      t.prototype.messageSent,
    );
    setDraft("");
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:py-8">
      {/* หัวเรื่อง */}
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {t.order.title}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{order.serviceTitle}</h1>
        <span className="tabular font-mono text-sm text-muted-foreground">#{order.code}</span>
        <OrderStatusPill status={order.status} />
        {days !== null && (
          <span
            className={cn(
              "tabular text-sm",
              days < 0 ? "text-destructive" : days <= 2 ? "text-warning" : "text-muted-foreground",
            )}
          >
            {days < 0 ? t.order.overdue : days === 0 ? t.order.dueToday : t.order.dueIn}
            {days !== 0 && ` ${Math.abs(days)} ${t.common.days}`}
          </span>
        )}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_320px] xl:items-start">
        {/* ── ซ้าย: สรุป ──────────────────────────────── */}
        <aside className="space-y-4">
          <Card className="gap-3 p-4">
            <p className="text-sm font-medium">{t.order.client}</p>
            <div className="flex items-center gap-2.5">
              <ArtAvatar seed={order.clientSeed} alt={order.clientName} className="size-9" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{order.clientName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatRelative(order.createdAt, locale)}
                </p>
              </div>
            </div>

            {order.privateNote ? (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium">{t.order.privateNote}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {order.privateNote}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t.order.privateNoteHint}
                  </p>
                </div>
              </>
            ) : null}
          </Card>

          <Card className="gap-3 p-4">
            <p className="text-sm font-medium">{t.order.service}</p>
            {order.lineItems.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {order.lineItems.map((li) => (
                  <li key={li.label} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{li.label}</span>
                    <span className="tabular shrink-0">
                      {formatMoney(li.priceCents, order.currency, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t.order.noQuoteYet}
              </p>
            )}

            {order.totalCents > 0 && (
              <>
                <Separator />
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">{t.order.total}</span>
                  <span className="tabular text-lg font-semibold">
                    {formatMoney(order.totalCents, order.currency, locale)}
                  </span>
                </div>
              </>
            )}
          </Card>

          {/* การชำระเงิน */}
          {order.totalCents > 0 && (
            <Card className="gap-3 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CircleDollarSign className="size-4 text-primary" />
                {t.order.payment}
              </p>

              <div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t.order.paid}</span>
                  <span className="tabular">
                    {formatMoney(order.paidCents, order.currency, locale)}
                  </span>
                </div>
                <Progress value={paidPercent} className="mt-1.5 h-1.5" />
                {remaining > 0 && (
                  <p className="tabular mt-1.5 text-xs text-muted-foreground">
                    {t.order.remaining} {formatMoney(remaining, order.currency, locale)}
                  </p>
                )}
              </div>

              {remaining > 0 ? (
                <>
                  <PromptPayQrDialog
                    amountCents={remaining}
                    currency={order.currency}
                    orderCode={order.code}
                    creatorName={creator.displayName}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() =>
                      toast.success(t.prototype.paymentRecorded)
                    }
                  >
                    <Check className="size-4" />
                    {t.order.markPaid}
                  </Button>
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <Check className="size-4" />
                  {t.order.fullyPaid}
                </p>
              )}
            </Card>
          )}

          <Card className="gap-2 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t.order.revisionsUsed}</span>
              <span className="tabular">
                {order.revisionsUsed} / {order.revisionsAllowed}
              </span>
            </div>
            <Progress
              value={(order.revisionsUsed / order.revisionsAllowed) * 100}
              className="h-1.5"
            />
          </Card>

          {/* Milestones เป็นฟีเจอร์ Pro */}
          <LockedFeature
            title={t.order.milestones}
            description={
              t.order.milestonesDesc
            }
          >
            <Card className="gap-3 p-4">
              {[
                { label: "Sketch", pct: 30 },
                { label: "Line art", pct: 30 },
                { label: "Final", pct: 40 },
              ].map((m) => (
                <div key={m.label} className="flex items-center justify-between text-sm">
                  <span>{m.label}</span>
                  <span className="tabular text-muted-foreground">{m.pct}%</span>
                </div>
              ))}
            </Card>
          </LockedFeature>
        </aside>

        {/* ── กลาง: timeline + แชท ──────────────────────── */}
        <section className="min-w-0">
          <Card className="gap-0 p-0">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <p className="text-sm font-medium">{t.order.timeline}</p>
            </div>

            <ul className="space-y-4 p-4">
              {order.timeline.map((entry) =>
                entry.kind === "event" ? (
                  <li key={entry.id} className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-center text-xs text-muted-foreground">
                      {entry.body} · {formatDateTime(entry.createdAt, locale)}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </li>
                ) : (
                  <li
                    key={entry.id}
                    className={cn(
                      "flex gap-2.5",
                      entry.author === "creator" && "flex-row-reverse",
                    )}
                  >
                    <ArtAvatar
                      seed={entry.author === "creator" ? creator.avatarSeed : order.clientSeed}
                      alt={entry.authorName}
                      className="size-8 shrink-0"
                    />
                    <div
                      className={cn(
                        "min-w-0 max-w-[80%]",
                        entry.author === "creator" && "items-end text-right",
                      )}
                    >
                      <p className="text-xs text-muted-foreground">
                        {entry.authorName} · {formatDateTime(entry.createdAt, locale)}
                      </p>
                      <div
                        className={cn(
                          "mt-1 inline-block rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                          entry.author === "creator"
                            ? "rounded-tr-sm bg-primary text-primary-foreground"
                            : "rounded-tl-sm bg-muted",
                        )}
                      >
                        {entry.body}
                      </div>

                      {entry.attachments?.length ? (
                        <div
                          className={cn(
                            "mt-2 flex gap-2",
                            entry.author === "creator" && "justify-end",
                          )}
                        >
                          {entry.attachments.map((a) => (
                            <ArtImage
                              key={a.seed}
                              seed={a.seed}
                              alt={a.label}
                              ratio={1}
                              className="size-20"
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ),
              )}
            </ul>

            {/* กล่องพิมพ์ */}
            <div className="border-t p-3">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t.order.writeMessage}
                rows={2}
                className="resize-none border-0 shadow-none focus-visible:ring-0"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
                }}
              />
              <div className="mt-1 flex items-center gap-2">
                <Button variant="ghost" size="icon" aria-label={t.order.files}>
                  <Paperclip className="size-4" />
                </Button>
                <Button size="sm" className="ml-auto" onClick={send} disabled={!draft.trim()}>
                  <Send className="size-3.5" />
                  {t.order.send}
                </Button>
              </div>
            </div>
          </Card>

          {/* บรีฟจากลูกค้า */}
          <Card className="mt-5 gap-3 p-4">
            <p className="text-sm font-medium">{t.order.brief}</p>
            <dl className="space-y-2 text-sm">
              {order.brief.map((b) => (
                <div key={b.label} className="grid gap-1 sm:grid-cols-[180px_1fr] sm:gap-3">
                  <dt className="text-muted-foreground">{b.label}</dt>
                  <dd>{b.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* แถบปุ่มหลัก */}
          {action && (
            <div className="sticky bottom-0 mt-5 flex items-center gap-2 rounded-xl border bg-background/90 p-3 backdrop-blur-md">
              <Button variant="ghost" size="sm">
                <Settings2 className="size-4" />
                {t.common.edit}
              </Button>
              <Button
                className="ml-auto"
                disabled={action.disabled}
                onClick={() =>
                  toast.success(
                    t.prototype.actionDone,
                  )
                }
              >
                {action.label}
              </Button>
            </div>
          )}
        </section>

        {/* ── ขวา: ไฟล์ ────────────────────────────────── */}
        <aside className="space-y-4">
          <Card className="gap-3 p-4">
            <p className="text-sm font-medium">{t.order.references}</p>
            {order.referenceSeeds.length ? (
              <div className="grid grid-cols-3 gap-2">
                {order.referenceSeeds.map((s) => (
                  <ArtImage key={s} seed={s} alt="reference" ratio={1} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </Card>

          <Card className="gap-3 p-4">
            <p className="text-sm font-medium">{t.order.wip}</p>
            {order.wipSeeds.length ? (
              <div className="grid grid-cols-3 gap-2">
                {order.wipSeeds.map((s) => (
                  <ArtImage key={s} seed={s} alt="wip" ratio={1}>
                    {/* ลายน้ำติดอัตโนมัติตอนอัปโหลด WIP */}
                    <span className="absolute inset-0 grid place-items-center text-[9px] font-semibold tracking-widest text-white/45 uppercase">
                      preview
                    </span>
                  </ArtImage>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t.order.finalFiles}</p>
              {filesLocked && <Lock className="size-3.5 text-muted-foreground" />}
            </div>

            {order.finalSeeds.length ? (
              <>
                <div className={cn("grid grid-cols-3 gap-2", filesLocked && "blur-sm")}>
                  {order.finalSeeds.map((s) => (
                    <ArtImage key={s} seed={s} alt="final" ratio={1} />
                  ))}
                </div>
                {filesLocked ? (
                  <p className="text-xs text-muted-foreground">{t.order.lockedUntilPaid}</p>
                ) : (
                  <Button size="sm" variant="outline" className="w-full">
                    <Download className="size-4" />
                    {t.order.finalFiles}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

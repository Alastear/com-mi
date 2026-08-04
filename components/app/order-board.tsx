"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, LayoutGrid, List, MessageSquare, MoveRight } from "lucide-react";
import { toast } from "sonner";
import { ArtImage } from "@/components/art-image";
import { OrderStatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "@/lib/i18n/client";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { daysUntil, formatMoney, formatRelative } from "@/lib/format";
import { BOARD_COLUMNS, type BoardColumn, type Order } from "@/lib/types";
import { cn } from "@/lib/utils";
import { orderHref } from "@/lib/routes";

/**
 * บอร์ดคิวงาน
 *
 * prototype ใช้ HTML5 drag-and-drop + เมนู "ย้ายไป…" เป็นทางเลือกสำหรับคีย์บอร์ดและมือถือ
 * ของจริงเปลี่ยนเป็น @dnd-kit (รองรับคีย์บอร์ดในตัว) + optimistic update ที่ rollback ได้
 * เมื่อ Server Action ปฏิเสธ transition — ดู docs/02-data-model.md §5
 */
export function OrderBoard({ orders: initial }: { orders: Order[] }) {
  const { t, locale } = useLocale();
  const [view, setView] = useState<"board" | "list">("board");
  const [orders, setOrders] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<BoardColumn | null>(null);

  const columns = useMemo(
    () =>
      BOARD_COLUMNS.map((status) => ({
        status,
        items: orders.filter((o) => matchesColumn(o, status)),
      })),
    [orders],
  );

  function move(code: string, to: BoardColumn) {
    setOrders((prev) =>
      prev.map((o) => (o.code === code ? { ...o, status: to } : o)),
    );
    toast.success(`#${code} → ${t.orderStatus[to]}`, {
      description:
        t.prototype.notSavedNote,
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t.order.title}</h1>

        <div className="inline-flex rounded-lg border p-0.5">
          {(
            [
              { id: "board", icon: LayoutGrid, label: t.order.boardView },
              { id: "list", icon: List, label: t.order.listView },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              aria-pressed={view === v.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
                view === v.id
                  ? "bg-secondary font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <v.icon className="size-3.5" />
              {/* sr-only ไม่ใช่ hidden — ไอคอน lucide เป็น aria-hidden โดยอัตโนมัติ
                  ถ้าซ่อน label ด้วย `hidden` ปุ่มจะไม่มีชื่อเลยบนจอเล็ก */}
              <span className="sr-only sm:not-sr-only">{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      {view === "board" ? (
        <div className="no-scrollbar mt-5 flex gap-3 overflow-x-auto pb-4">
          {columns.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                setOverColumn(col.status);
              }}
              onDragLeave={() => setOverColumn((c) => (c === col.status ? null : c))}
              onDrop={(e) => {
                // ต้อง preventDefault ที่ drop ด้วย ไม่ใช่แค่ที่ dragOver
                // ไม่งั้นเบราว์เซอร์จะทำ default action กับ URL ที่อยู่ใน drag data store
                // (การ์ดมี <Link> อยู่ข้างใน → เบราว์เซอร์ใส่ text/uri-list ให้เอง)
                // ผลคือปล่อยการ์ดแล้วเด้งออกจากบอร์ดไปหน้าออเดอร์ทันที
                e.preventDefault();
                if (dragging) move(dragging, col.status);
                setDragging(null);
                setOverColumn(null);
              }}
              className={cn(
                "flex w-[268px] shrink-0 flex-col rounded-xl border bg-card/40 transition-colors",
                overColumn === col.status && "border-primary bg-primary/5",
              )}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="text-sm font-medium">{t.orderStatus[col.status]}</span>
                <span className="tabular grid size-5 place-items-center rounded-full bg-muted text-[11px] text-muted-foreground">
                  {col.items.length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {col.items.length === 0 ? (
                  <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                    {t.order.empty}
                  </p>
                ) : (
                  col.items.map((o) => (
                    <OrderCard
                      key={o.code}
                      order={o}
                      locale={locale}
                      t={t}
                      onDragStart={() => setDragging(o.code)}
                      onDragEnd={() => setDragging(null)}
                      onMove={(to) => move(o.code, to)}
                      dragging={dragging === o.code}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="mt-5 gap-0 overflow-hidden p-0">
          <ul className="divide-y">
            {orders.map((o) => {
              const overdue = o.dueAt !== undefined && daysUntil(o.dueAt) < 0;
              return (
                <li key={o.code}>
                  <Link
                    href={orderHref(o.code)}
                    className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/40"
                  >
                    <ArtImage seed={o.coverSeed} alt="" ratio={1} className="size-10 shrink-0" />
                    <span className="tabular hidden font-mono text-xs text-muted-foreground sm:block">
                      #{o.code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{o.serviceTitle}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {o.clientName}
                      </span>
                    </span>
                    <OrderStatusPill status={o.status} className="hidden sm:inline-flex" />
                    <span
                      className={cn(
                        "tabular hidden w-24 text-right text-xs md:block",
                        overdue ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {o.dueAt ? formatRelative(o.dueAt, locale) : "—"}
                    </span>
                    <span className="tabular w-20 shrink-0 text-right text-sm">
                      {o.totalCents > 0 ? formatMoney(o.totalCents, o.currency, locale) : "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

function matchesColumn(order: Order, column: BoardColumn): boolean {
  // reviewing รวมกับ requested และ revision_requested/accepted รวมกับ in_progress
  // เพื่อให้บอร์ดมี 5 คอลัมน์ที่อ่านง่าย ไม่ใช่ 9 คอลัมน์ตาม state machine เต็ม
  switch (column) {
    case "requested":
      return order.status === "requested" || order.status === "reviewing";
    case "in_progress":
      return (
        order.status === "in_progress" ||
        order.status === "accepted" ||
        order.status === "revision_requested"
      );
    default:
      return order.status === column;
  }
}

function OrderCard({
  order,
  locale,
  t,
  onDragStart,
  onDragEnd,
  onMove,
  dragging,
}: {
  order: Order;
  locale: Locale;
  t: Dictionary;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: BoardColumn) => void;
  dragging: boolean;
}) {
  const days = order.dueAt !== undefined ? daysUntil(order.dueAt) : null;
  const urgency =
    days === null ? null : days < 0 ? "overdue" : days <= 2 ? "soon" : "ok";

  return (
    <div
      draggable
      onDragStart={(e) => {
        // ยึดการ์ดทั้งใบเป็น drag source และเขียนทับ payload ที่เบราว์เซอร์
        // จะใส่ URL ของ <Link> ข้างในให้เอง (ต้นเหตุที่ทำให้ปล่อยแล้วเด้งออกจากหน้า)
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", order.code);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative rounded-lg border bg-card transition-opacity",
        dragging && "opacity-40",
      )}
    >
      {/* แถบสีบอกความเร่งด่วน */}
      {urgency ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-2 left-0 w-0.5 rounded-full",
            urgency === "overdue" && "bg-destructive",
            urgency === "soon" && "bg-warning",
            urgency === "ok" && "bg-success/60",
          )}
        />
      ) : null}

      {/* draggable={false} — anchor ลากได้เองโดยปริยาย ต้องปิดไม่ให้แย่งเป็น drag source */}
      <Link href={orderHref(order.code)} draggable={false} className="block p-3 pl-3.5">
        <div className="flex gap-2.5">
          <ArtImage seed={order.coverSeed} alt="" ratio={1} className="size-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="tabular font-mono text-[11px] text-muted-foreground">#{order.code}</p>
            <p className="truncate text-sm font-medium">{order.serviceTitle}</p>
            <p className="truncate text-xs text-muted-foreground">{order.clientName}</p>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2 text-xs">
          {order.totalCents > 0 ? (
            <span className="tabular font-medium">
              {formatMoney(order.totalCents, order.currency, locale)}
            </span>
          ) : (
            <span className="text-muted-foreground">
{t.order.needsQuote}
            </span>
          )}

          {days !== null && (
            <span
              className={cn(
                "tabular inline-flex items-center gap-1",
                urgency === "overdue"
                  ? "text-destructive"
                  : urgency === "soon"
                    ? "text-warning"
                    : "text-muted-foreground",
              )}
            >
              {urgency === "overdue" ? (
                <AlertTriangle className="size-3" />
              ) : (
                <Clock className="size-3" />
              )}
              {fill(days < 0 ? t.order.daysLate : t.order.daysLeft, { n: Math.abs(days) })}
            </span>
          )}

          {order.unreadCount > 0 && (
            <span className="tabular ml-auto inline-flex items-center gap-1 text-primary">
              <MessageSquare className="size-3" />
              {order.unreadCount}
            </span>
          )}
        </div>

        {order.progressPercent > 0 && (
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${order.progressPercent}%` }}
            />
          </div>
        )}
      </Link>

      {/* ทางเลือกสำหรับคีย์บอร์ดและมือถือ — HTML5 DnD ใช้ไม่ได้บนสองอย่างนี้ */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1.5 right-1.5 size-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={t.order.moveTo}
          >
            <MoveRight className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t.order.moveTo}</DropdownMenuLabel>
          {BOARD_COLUMNS.map((c) => (
            <DropdownMenuItem key={c} onClick={() => onMove(c)}>
              {t.orderStatus[c]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

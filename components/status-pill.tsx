"use client";

import { useDict } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { OrderStatus, ShopStatus } from "@/lib/types";

/** สีต่อสถานะ — ต้องตรงกันทั้งระบบ จึงรวมไว้ที่เดียว */
const ORDER_TONE: Record<OrderStatus, string> = {
  requested: "bg-info/12 text-info border-info/25",
  reviewing: "bg-info/12 text-info border-info/25",
  quoted: "bg-warning/12 text-warning border-warning/25",
  accepted: "bg-primary/12 text-primary border-primary/25",
  in_progress: "bg-primary/12 text-primary border-primary/25",
  in_review: "bg-warning/12 text-warning border-warning/25",
  revision_requested: "bg-warning/14 text-warning border-warning/30",
  delivered: "bg-success/12 text-success border-success/25",
  completed: "bg-success/14 text-success border-success/30",
  declined: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
};

export function OrderStatusPill({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const t = useDict();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        ORDER_TONE[status],
        className,
      )}
    >
      {t.orderStatus[status]}
    </span>
  );
}

const SHOP_TONE: Record<ShopStatus, { dot: string; text: string }> = {
  open: { dot: "bg-success", text: "text-success" },
  closed: { dot: "bg-muted-foreground", text: "text-muted-foreground" },
  waitlist: { dot: "bg-warning", text: "text-warning" },
  vacation: { dot: "bg-info", text: "text-info" },
};

export function ShopStatusPill({
  status,
  note,
  className,
}: {
  status: ShopStatus;
  note?: string;
  className?: string;
}) {
  const t = useDict();
  const tone = SHOP_TONE[status];
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-medium", className)}>
      <span className={cn("relative flex size-2", tone.text)}>
        {status === "open" && (
          <span
            className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", tone.dot)}
          />
        )}
        <span className={cn("relative inline-flex size-2 rounded-full", tone.dot)} />
      </span>
      <span className={tone.text}>{t.shopStatus[status]}</span>
      {note ? <span className="text-muted-foreground">· {note}</span> : null}
    </span>
  );
}

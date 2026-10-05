"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocale } from "@/lib/i18n/client";
import { formatRelative } from "@/lib/format";
import { dynamicHref } from "@/lib/routes";
import { notificationText } from "@/lib/notifications/labels";
import { markNotificationsRead } from "@/lib/notifications/actions";
import { cn } from "@/lib/utils";
/**
 * กระดิ่งแจ้งเตือน
 *
 * **Polling ไม่ใช่ SSE** — Vercel Fluid Compute คิดเงินตาม active CPU + memory ที่จอง
 * สตรีมค้างหนึ่งเส้นต่อผู้ใช้ที่เปิดแท็บทิ้งไว้แพงกว่าประโยชน์มาก (docs/01 §6)
 *
 * สามอย่างที่ทำให้ polling ถูกจริง:
 *   1. ไม่ยิงเลยเมื่อแท็บไม่ได้อยู่หน้าจอ — คนเปิดทิ้งไว้ข้ามคืนไม่กินอะไรเลย
 *   2. ถอยจังหวะเป็นทวีคูณเมื่อไม่มีอะไรใหม่ (5 วิ → 10 → 20 … สูงสุด 60)
 *      แล้วรีเซ็ตกลับทันทีที่มีของใหม่
 *   3. ส่ง If-None-Match — ถ้าไม่มีอะไรเปลี่ยน ได้ 304 ตัวเปล่า ไม่มี payload
 */
export function NotificationBell() {
  const { t, locale } = useLocale();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const etag = useRef<string | null>(null);
  const emptyPolls = useRef(0);
  const revision = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let polling = false;
    let lastSnapshot = "";
    const controller = new AbortController();

    async function poll() {
      if (cancelled || polling) return;
      if (document.visibilityState !== "visible") return schedule();
      polling = true;
      const requestedRevision = revision.current;
      try {
        const res = await fetch("/api/notifications", {
          signal: controller.signal,
          headers: etag.current ? { "If-None-Match": etag.current } : {},
        });
        if (res.status === 304) {
          emptyPolls.current++;
        } else if (res.ok) {
          const data = (await res.json()) as { unread: number; items: NotificationItem[] };
          const snapshot = `${data.unread}:${data.items[0]?.id ?? ""}`;
          const changed = snapshot !== lastSnapshot;
          lastSnapshot = snapshot;
          emptyPolls.current = changed ? 0 : emptyPolls.current + 1;
          etag.current = res.headers.get("ETag");
          if (!cancelled && requestedRevision === revision.current) {
            setUnread(data.unread);
            setItems(data.items);
          }
        } else {
          emptyPolls.current++;
        }
      } catch {
        // เน็ตหลุดชั่วคราวไม่ใช่เรื่องต้องแจ้งผู้ใช้ — รอบหน้าลองใหม่เอง
        emptyPolls.current++;
      }
      polling = false;
      schedule();
    }

    function schedule() {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(poll, Math.min(60_000, 5_000 * 2 ** emptyPolls.current));
    }

    void poll();
    // กลับมาที่แท็บแล้วต้องเห็นของใหม่ทันที ไม่ใช่รอจังหวะถัดไปที่อาจนานถึงนาที
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        emptyPolls.current = 0;
        clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("com-mi-notifications") : null;
    if (channel) channel.onmessage = () => { revision.current++; etag.current = null; emptyPolls.current = 0; void poll(); };

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
    };
    // Snapshot lives in this effect so comparisons use the last response, not mount-time state.
  }, []);

  const [saving, setSaving] = useState(false);
  async function markRead(id?: string) {
    if (saving) return;
    setSaving(true);
    try {
      if (!await markNotificationsRead(id)) throw new Error("unauthorized");
      revision.current++;
      etag.current = null;
      setItems(prev => prev.map(n => !id || n.id === id ? { ...n, read: true } : n));
      setUnread(prev => id ? Math.max(0, prev - (items.some(n => n.id === id && !n.read) ? 1 : 0)) : 0);
      if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("com-mi-notifications"); channel.postMessage("read"); channel.close(); }
    } catch {
      toast.error(t.error.title);
    } finally { setSaving(false); }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t.notification.title}>
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="tabular absolute -top-0.5 -right-0.5 grid min-w-5 h-5 px-1 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          {t.notification.title}
          {unread > 0 ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void markRead()}
              className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {t.notification.markAllRead}
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t.notification.empty}
          </p>
        ) : (
          items.map((n) => {
            const text = notificationText(t, n.type, n.data);
            if (!text) return null;
            return (
              <DropdownMenuItem key={n.id} asChild className="flex-col items-start gap-0.5 py-2.5">
                <Link href={dynamicHref(n.url)} onClick={() => { if (!n.read) void markRead(n.id); }}>
                  <span className="flex w-full items-center gap-2">
                    {!n.read ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                    ) : null}
                    <span className={cn("truncate text-sm", !n.read && "font-medium")}>{text}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(n.createdAt, locale)}
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type NotificationItem = {
  id: string;
  type: string;
  data: Record<string, string | number>;
  url: string;
  read: boolean;
  createdAt: string;
};


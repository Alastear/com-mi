"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/lib/i18n/client";
import { formatRelative } from "@/lib/format";
import { actorText, eventText } from "@/lib/orders/labels";
import { sendOrderMessage } from "@/lib/orders/actions";
import { cn } from "@/lib/utils";

export type ThreadEntry = {
  id: string;
  body: string;
  isSystemEvent: boolean;
  eventType: string | null;
  eventData: Record<string, string | number> | null;
  createdAt: string;
  senderUserId: string | null;
  senderName: string | null;
  senderImage: string | null;
};

/**
 * เธรดของออเดอร์ — แชทกับ timeline อยู่ในสตรีมเดียวกัน
 *
 * ตาราง `message` เก็บทั้งข้อความคนพิมพ์และเหตุการณ์ระบบ (`isSystemEvent`)
 * จึงเรียงตามเวลาจริงได้โดยไม่ต้อง merge สองแหล่งที่ UI
 * ผลคือทั้งสองฝ่ายเห็นว่า "ตอนที่ตกลงกันไว้แบบนี้ สถานะเปลี่ยนตอนไหน"
 * ซึ่งเป็นหลักฐานที่ Google Form + DM ให้ไม่ได้
 */
export function OrderThread({
  code,
  entries,
  currentUserId,
}: {
  code: string;
  entries: ThreadEntry[];
  currentUserId: string;
}) {
  const { t, locale } = useLocale();
  const [pending, startSend] = useTransition();
  const [draft, setDraft] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * ข้อความโผล่ทันทีที่กดส่ง แล้วค่อยรอเซิร์ฟเวอร์
   * ถ้าส่งไม่ผ่าน useOptimistic จะเอาออกให้เองตอน transition จบ
   */
  const [shown, addOptimistic] = useOptimistic(
    entries,
    (prev: ThreadEntry[], body: string) => [
      ...prev,
      {
        id: `pending-${prev.length}`,
        body,
        isSystemEvent: false,
        eventType: null,
        eventData: null,
        createdAt: new Date().toISOString(),
        senderUserId: currentUserId,
        senderName: null,
        senderImage: null,
      },
    ],
  );

  function submit() {
    const body = draft.trim();
    if (!body || pending) return;

    startSend(async () => {
      addOptimistic(body);
      setDraft("");
      const res = await sendOrderMessage({ code, body });
      if (!res.ok) {
        // ข้อความหายไปเองเมื่อ transition จบ — คืนสิ่งที่พิมพ์ให้ไม่ต้องพิมพ์ใหม่
        setDraft(body);
        toast.error(res.error === "rate_limited" ? t.order.sendTooFast : t.error.title);
      }
    });
  }

  return (
    <Card className="gap-0 p-0">
      <p className="border-b px-5 py-3 font-medium">{t.order.timeline}</p>

      <ol className="max-h-[28rem] space-y-4 overflow-y-auto px-5 py-4">
        {shown.map((m) => {
          if (m.isSystemEvent) {
            const text = eventText(t, m.eventType, m.eventData);
            // event ที่ยังไม่มีข้อความรองรับ ไม่แสดงดีกว่าโชว์ key ดิบ
            if (!text) return null;
            return (
              <li key={m.id} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <span aria-hidden className="h-px flex-1 bg-border" />
                <span className="shrink-0">
                  {text} · {actorText(t, m.eventData?.actor as string | undefined)} ·{" "}
                  {formatRelative(m.createdAt, locale)}
                </span>
                <span aria-hidden className="h-px flex-1 bg-border" />
              </li>
            );
          }

          const mine = m.senderUserId === currentUserId;
          return (
            <li key={m.id} className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
              <UserAvatar
                user={{ name: m.senderName ?? "", email: m.senderUserId ?? "", image: m.senderImage }}
                className="size-7 shrink-0"
              />
              <div className={cn("min-w-0 max-w-[80%]", mine && "text-right")}>
                <div
                  className={cn(
                    "inline-block rounded-2xl px-3.5 py-2 text-left text-sm whitespace-pre-wrap",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted",
                    // ข้อความที่ยังไม่ยืนยันจากเซิร์ฟเวอร์ — จางไว้ให้รู้ว่ากำลังส่ง
                    m.id.startsWith("pending-") && "opacity-60",
                  )}
                >
                  {m.body}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatRelative(m.createdAt, locale)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <form
        ref={formRef}
        action={submit}
        className="flex items-end gap-2 border-t p-3"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่ — พฤติกรรมที่คนคาดหวังจากแชท
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={t.order.writeMessage}
          aria-label={t.order.writeMessage}
          className="max-h-32 min-h-10 flex-1 resize-none"
        />
        <Button type="submit" size="icon" disabled={pending || !draft.trim()} aria-label={t.order.send}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </Card>
  );
}

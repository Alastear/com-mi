"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useLocale } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/format";
import { acceptQuote } from "@/lib/orders/quote";

/**
 * ใบเสนอราคาฝั่งลูกค้า
 *
 * ⚠️ ปุ่มยอมรับส่ง `quoteId` ไปด้วยเสมอ ไม่ใช่แค่ `code`
 *
 * ถ้าส่งแค่ code แล้วครีเอเตอร์ออกใบใหม่ระหว่างที่หน้านี้ค้างอยู่ ลูกค้าจะกดยอมรับ
 * ราคาที่ยังไม่เคยเห็น พอส่ง id ไปด้วย ใบเก่าถูกปิดแล้วจะได้ `superseded`
 * แล้วเรารีเฟรชหน้าให้อ่านใบใหม่ — ปฏิเสธแล้วให้อ่านใหม่ ดีกว่าผูกพันเงียบ ๆ
 */
export function QuoteCard({
  code,
  currency,
  expired,
  quote,
}: {
  code: string;
  currency: string;
  /**
   * คิดจากเวลาฝั่งเซิร์ฟเวอร์แล้วส่งมา ไม่ได้เทียบ `Date.now()` ตอน render
   * เพราะหน้านี้ render สองรอบ (เซิร์ฟเวอร์แล้วเบราว์เซอร์) เวลาคนละค่าจะทำให้
   * HTML สองฝั่งไม่ตรงกัน — และด่านจริงอยู่ที่ `acceptQuote()` อยู่แล้ว
   */
  expired: boolean;
  quote: {
    id: string;
    lines: Array<{ label: string; amountCents: number }>;
    totalCents: number;
    depositCents: number;
    note: string;
    expiresAt: Date | null;
  };
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  function accept() {
    start(async () => {
      const res = await acceptQuote({ code, quoteId: quote.id });
      if (res.ok) {
        toast.success(t.quote.accepted);
        router.refresh();
        return;
      }
      // ใบถูกเปลี่ยนหรือหมดอายุ = ดึงของใหม่มาให้ดู ไม่ใช่แค่บอกว่าพลาด
      if (res.error === "superseded" || res.error === "expired") {
        toast.error(res.error === "expired" ? t.quote.errorExpired : t.quote.errorSuperseded);
        router.refresh();
        return;
      }
      toast.error(t.error.title);
    });
  }

  return (
    <Card className="gap-3 border-primary/40 bg-primary/[0.03] p-5">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-primary" />
        <p className="font-medium">{t.quote.cardTitle}</p>
      </div>

      <ul className="space-y-1.5 text-sm">
        {quote.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="text-muted-foreground">{l.label}</span>
            <span className="tabular shrink-0">
              {formatMoney(l.amountCents, currency, locale)}
            </span>
          </li>
        ))}
      </ul>

      <Separator />

      <div className="flex justify-between">
        <span className="font-medium">{t.order.total}</span>
        <span className="tabular text-lg font-semibold">
          {formatMoney(quote.totalCents, currency, locale)}
        </span>
      </div>

      {quote.depositCents > 0 ? (
        <p className="tabular text-sm text-muted-foreground">
          {t.quote.depositDue.replace(
            "{amount}",
            formatMoney(quote.depositCents, currency, locale),
          )}
        </p>
      ) : null}

      {quote.note ? (
        <p className="rounded-lg bg-muted/60 p-3 text-sm whitespace-pre-wrap">{quote.note}</p>
      ) : null}

      {quote.expiresAt && !expired ? (
        <p className="text-xs text-muted-foreground">
          {t.quote.expiresOn.replace(
            "{date}",
            new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
              dateStyle: "medium",
            }).format(quote.expiresAt),
          )}
        </p>
      ) : null}

      {/* หมดอายุแล้วกดยังไงก็ไม่ผ่าน — ปุ่มที่กดไม่ได้ผลคือปุ่มที่ไม่ควรกดได้ */}
      <Button onClick={accept} disabled={pending || expired} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {expired ? t.quote.expiredCta : t.quote.accept}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {expired ? t.quote.expiredHint : t.quote.acceptHint}
      </p>
    </Card>
  );
}

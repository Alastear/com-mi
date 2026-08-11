"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/format";
import { depositFor } from "@/lib/orders/pricing";
import { issueQuote } from "@/lib/orders/quote";
import { cn } from "@/lib/utils";

/**
 * ตัวเขียนใบเสนอราคาของครีเอเตอร์
 *
 * ตั้งต้นจากรายการที่ลูกค้าสั่งมาจริง ไม่ใช่ฟอร์มเปล่า — เพราะงานส่วนใหญ่คือ
 * "เอาที่เขาสั่งมาแล้วปรับ" ไม่ใช่ "คิดใหม่ทั้งใบ" เริ่มจากฟอร์มเปล่าแปลว่า
 * ครีเอเตอร์ต้องพิมพ์สิ่งที่ระบบรู้อยู่แล้วใหม่ทุกครั้ง และพิมพ์ผิดได้ด้วย
 *
 * ⚠️ ยอดในฟอร์มนี้เป็น **บาท** แต่ที่ส่งออกไปเป็น **สตางค์** — แปลงที่ขอบเดียว
 * ตรง `submit()` ข้างล่าง ไม่กระจายการคูณ 100 ไปทั่วไฟล์
 */

type Row = { key: string; label: string; baht: string };

const DEPOSITS = [0, 25, 50, 100] as const;
const EXPIRIES = [7, 14, 30, 0] as const;

let seq = 0;
function newRow(label = "", baht = ""): Row {
  seq += 1;
  return { key: `r${seq}`, label, baht };
}

export function QuoteBuilder({
  code,
  currency,
  initialLines,
  initialDepositPercent,
  outstandingCents,
}: {
  code: string;
  currency: string;
  /** บรรทัดตั้งต้น — ใบที่เปิดอยู่ถ้ามี ไม่งั้นใช้รายการที่ลูกค้าสั่ง */
  initialLines: Array<{ label: string; amountCents: number }>;
  initialDepositPercent: number;
  /**
   * ยอดของใบที่ส่งไปแล้วและยังรอลูกค้าอยู่ — `null` คือยังไม่เคยส่ง
   *
   * ต้องบอกให้ชัด ไม่งั้นครีเอเตอร์เปิดหน้ามาเจอฟอร์มที่มีตัวเลขกรอกไว้แล้ว
   * แต่แยกไม่ออกว่า "ส่งไปแล้ว" หรือ "ยังเป็นแค่ร่าง" — แล้วก็กดส่งซ้ำ
   */
  outstandingCents: number | null;
}) {
  const { t, locale } = useLocale();
  const [rows, setRows] = useState<Row[]>(() =>
    initialLines.length > 0
      ? initialLines.map((l) => newRow(l.label, String(Math.round(l.amountCents / 100))))
      : [newRow()],
  );
  const [depositPercent, setDepositPercent] = useState(initialDepositPercent);
  const [expiresInDays, setExpiresInDays] = useState<number>(14);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  /** ยอดรวมสด ๆ ระหว่างพิมพ์ — เลขที่พิมพ์ไม่เสร็จ (เช่น "1e") นับเป็นศูนย์ ไม่ใช่ NaN */
  const totalBaht = rows.reduce((n, r) => {
    const v = Number(r.baht);
    return n + (Number.isFinite(v) ? Math.trunc(v) : 0);
  }, 0);
  // สูตรเดียวกับที่ server ใช้เขียนลง DB — พรีวิวจึงตรงกับของจริงเสมอ
  const depositCents = depositFor(totalBaht * 100, depositPercent);

  function patch(key: string, next: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)));
  }

  function submit() {
    start(async () => {
      const res = await issueQuote({
        code,
        lines: rows.map((r) => ({
          label: r.label,
          amountCents: Math.trunc(Number(r.baht) || 0) * 100,
        })),
        depositPercent,
        note,
        expiresInDays,
      });
      if (res.ok) {
        toast.success(t.quote.sent);
        return;
      }
      toast.error(
        res.error === "empty"
          ? t.quote.errorEmpty
          : res.error === "too_large"
            ? t.quote.errorTooLarge
            : res.error === "wrong_status"
              ? t.quote.errorWrongStatus
              : res.error === "conflict"
                ? t.quote.errorConflict
                : t.error.title,
      );
    });
  }

  return (
    <Card className="gap-4 p-5">
      <div>
        <p className="font-medium">{t.quote.builderTitle}</p>
        <p className="text-sm text-muted-foreground">{t.quote.builderHint}</p>
      </div>

      {outstandingCents !== null ? (
        <p className="tabular rounded-lg border border-primary/30 bg-primary/[0.05] px-3 py-2 text-sm">
          {t.quote.outstanding.replace("{amount}", formatMoney(outstandingCents, currency, locale))}
        </p>
      ) : null}

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <Input
              value={r.label}
              onChange={(e) => patch(r.key, { label: e.target.value })}
              placeholder={t.quote.linePlaceholder}
              maxLength={120}
              className="flex-1"
            />
            <Input
              value={r.baht}
              onChange={(e) => patch(r.key, { baht: e.target.value.replace(/[^\d-]/g, "") })}
              inputMode="numeric"
              placeholder="0"
              aria-label={t.quote.amount}
              className="tabular w-28 text-right"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              // เหลือบรรทัดเดียวแล้วลบไม่ได้ — ฟอร์มที่ไม่มีบรรทัดเลยกดส่งไม่ผ่านอยู่ดี
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

      <Separator />

      <div className="flex items-center justify-between">
        <span className="font-medium">{t.order.total}</span>
        <span className="tabular text-lg font-semibold">
          {formatMoney(totalBaht * 100, currency, locale)}
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
              formatMoney(depositCents, currency, locale),
            )}
          </p>
        ) : null}
      </div>

      <div>
        <Label className="text-sm">{t.quote.expiry}</Label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {EXPIRIES.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={d === expiresInDays ? "default" : "outline"}
              onClick={() => setExpiresInDays(d)}
            >
              {d === 0 ? t.quote.expiryNone : t.quote.expiryDays.replace("{n}", String(d))}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="quote-note" className="text-sm">
          {t.quote.note}
        </Label>
        <Textarea
          id="quote-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={t.quote.notePlaceholder}
          className="mt-1.5"
        />
      </div>

      <Button onClick={submit} disabled={pending || totalBaht <= 0} className={cn("w-full")}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {/* ส่งทับใบเดิมคือคนละเรื่องกับส่งครั้งแรก — ปุ่มต้องบอกว่ากำลังจะทับ */}
        {outstandingCents !== null ? t.quote.resend : t.quote.send}
      </Button>
    </Card>
  );
}

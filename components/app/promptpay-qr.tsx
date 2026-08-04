"use client";

import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLocale } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/format";

/**
 * PromptPay QR
 *
 * prototype วาดลายจำลองเพื่อให้เห็นเลย์เอาต์
 * ของจริงประกอบ EMVCo payload จาก PromptPay ID ของครีเอเตอร์ + จำนวนเงิน แล้ว render ฝั่ง client ล้วน
 * เงินโอนตรงจากลูกค้าเข้าบัญชีครีเอเตอร์ — แพลตฟอร์มไม่แตะเงิน (docs/00-product-overview.md §5.2)
 */
const QR_CELLS = 25;

/**
 * คำนวณช่องที่ต้องระบายจาก seed — เป็นฟังก์ชันบริสุทธิ์นอก component
 *
 * ห้ามย้ายลอจิกนี้เข้าไปใน body ของคอมโพเนนต์: React Compiler ห้าม mutate
 * ตัวแปรที่ประกาศใน component scope ระหว่าง render (กฎ react-hooks/immutability)
 */
function qrCells(seed: string): Array<[number, number]> {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0 || 1;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % 100;
  };

  const isFinder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    return inBox(0, 0) || inBox(QR_CELLS - 7, 0) || inBox(0, QR_CELLS - 7);
  };

  const out: Array<[number, number]> = [];
  for (let y = 0; y < QR_CELLS; y++) {
    for (let x = 0; x < QR_CELLS; x++) {
      if (isFinder(x, y)) continue;
      if (rand() < 47) out.push([x, y]);
    }
  }
  return out;
}

function FakeQr({ seed, size = 224 }: { seed: string; size?: number }) {
  const cells = QR_CELLS;
  const rects = qrCells(seed).map(([x, y]) => (
    <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
  ));

  const finder = (ox: number, oy: number) => (
    <g key={`f${ox}-${oy}`}>
      <rect x={ox} y={oy} width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x={ox + 2} y={oy + 2} width="3" height="3" />
    </g>
  );

  return (
    <svg
      viewBox={`0 0 ${cells} ${cells}`}
      width={size}
      height={size}
      className="text-foreground"
      role="img"
      aria-label="PromptPay QR"
      shapeRendering="crispEdges"
    >
      <rect width={cells} height={cells} className="fill-background" />
      <g fill="currentColor">
        {rects}
        {finder(0, 0)}
        {finder(cells - 7, 0)}
        {finder(0, cells - 7)}
      </g>
    </svg>
  );
}

export function PromptPayQrDialog({
  amountCents,
  currency,
  orderCode,
  creatorName,
}: {
  amountCents: number;
  currency: string;
  orderCode: string;
  creatorName: string;
}) {
  const { t, locale } = useLocale();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <QrCode className="size-4" />
          {t.order.showQr}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.order.payment}</DialogTitle>
          <DialogDescription>
            {t.payment.scanHint}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <div className="rounded-xl border bg-background p-4">
            <FakeQr seed={orderCode} />
          </div>
          <p className="tabular text-2xl font-semibold">
            {formatMoney(amountCents, currency, locale)}
          </p>
          <p className="text-sm text-muted-foreground">{creatorName}</p>
          <p className="tabular font-mono text-xs text-muted-foreground">#{orderCode}</p>
        </div>

        <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          {t.payment.noEscrowNote}
        </p>
      </DialogContent>
    </Dialog>
  );
}

import Link from "next/link";
import { ArrowRight, Check, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyLinkButton } from "@/components/copy-link-button";
import { Progress } from "@/components/ui/progress";
import { dynamicHref } from "@/lib/routes";
import { fill, getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { SetupProgress } from "@/lib/queries/setup";
import { shopUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * เช็กลิสต์พาครีเอเตอร์ใหม่ตั้งร้าน
 *
 * เป็น Server Component ล้วน — ไม่มี state ฝั่ง client เลย เพราะสถานะทุกข้อ
 * อ่านจาก DB โดยตรง ติ๊กเองเมื่อทำเสร็จ และหายไปเองเมื่อครบ
 * ไม่มีปุ่ม "ข้าม" เพราะไม่ได้บังหน้าจอ — อยู่บนแดชบอร์ดเหมือนการ์ดปกติ
 */
export function SetupChecklist({
  progress,
  handle,
  locale,
}: {
  progress: SetupProgress;
  handle: string;
  locale: Locale;
}) {
  const t = getDictionary(locale);

  // ร้านเปิดแล้วและตั้งค่าครบ — เหลือแค่การ์ดสั้น ๆ ชวนเอาลิงก์ไปแชร์
  if (progress.isPublished && progress.complete) {
    return (
      <Card className="flex-row flex-wrap items-center gap-4 border-success/40 bg-success/5 p-5">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/15">
          <PartyPopper className="size-4 text-success" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t.setup.publishedTitle}</p>
          <p className="text-sm text-muted-foreground">{t.setup.publishedBody}</p>
        </div>
        <CopyLinkButton value={shopUrl(handle)} label={t.common.share} size="sm" />
      </Card>
    );
  }

  const next = progress.steps.find((s) => !s.done);

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{t.setup.title}</p>
          <p className="text-sm text-muted-foreground">
            {progress.complete ? t.setup.readyBody : t.setup.subtitle}
          </p>
        </div>
        <span className="tabular text-sm text-muted-foreground">
          {fill(t.setup.progress, { done: progress.doneCount, total: progress.total })}
        </span>
      </div>

      <Progress value={(progress.doneCount / progress.total) * 100} className="h-1.5" />

      <ol className="space-y-1">
        {progress.steps.map((step) => {
          const isNext = step.id === next?.id;
          return (
            <li key={step.id}>
              <Link
                href={dynamicHref(step.href)}
                className={cn(
                  "flex items-start gap-3 rounded-lg p-2.5 transition-colors",
                  step.done ? "opacity-60" : "hover:bg-muted/60",
                  isNext && "bg-primary/8 ring-1 ring-primary/25",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px]",
                    step.done
                      ? "border-success bg-success text-success-foreground"
                      : "border-muted-foreground/40 text-muted-foreground",
                  )}
                >
                  {step.done ? <Check className="size-3" /> : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-sm font-medium", step.done && "line-through")}>
                      {t.setup.steps[step.id]}
                    </span>
                    {!step.required && !step.done ? (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        {t.setup.optional}
                      </Badge>
                    ) : null}
                  </span>
                  {/* คำอธิบายเฉพาะข้อที่ยังไม่ทำ — ข้อที่เสร็จแล้วไม่ต้องอธิบายซ้ำให้รก */}
                  {!step.done ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t.setup.steps[`${step.id}Body` as const]}
                    </span>
                  ) : null}
                </span>

                {isNext ? (
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>

      {progress.complete && !progress.isPublished ? (
        <Button asChild className="self-start">
          <Link href="/shop">{t.shop.publishCta}</Link>
        </Button>
      ) : null}
    </Card>
  );
}

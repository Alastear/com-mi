import { MessageSquareReply, ShieldCheck, Sprout, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Stars } from "@/components/stars";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { formatNumber, formatYearMonth } from "@/lib/format";
import {
  TRACK_RECORD_MIN_COMPLETED,
  type TrackRecord,
  type Turnaround,
} from "@/lib/reputation/track-record";
import type { PublicReview } from "@/lib/queries/reputation";

/**
 * ประวัติร้าน + รีวิวบนหน้าร้าน — เรนเดอร์ฝั่ง server ล้วน (ไม่มี "use client")
 *
 * รับ `t` เป็น prop แทนการอ่าน context เพราะหน้าร้านเป็น server component
 * และคอมโพเนนต์นี้ไม่มีอะไรต้องโต้ตอบ — ไม่ต้องส่ง JS ลงเบราว์เซอร์เลย
 */

function turnaroundText(t: Dictionary, x: Turnaround | null, locale: Locale): string {
  if (!x) return t.reputation.noData;
  if (x.kind === "under_day") return t.reputation.turnaroundUnderDay;
  if (x.days === 1) return t.reputation.turnaroundOneDay;
  return fill(t.reputation.turnaroundDays, { n: formatNumber(x.days, locale) });
}

function reviewCountText(t: Dictionary, n: number, locale: Locale): string {
  return fill(n === 1 ? t.reputation.reviewCountOne : t.reputation.reviewCountMany, {
    n: formatNumber(n, locale),
  });
}

export function ShopTrackRecord({
  record,
  t,
  locale,
  isOwner,
}: {
  record: TrackRecord;
  t: Dictionary;
  locale: Locale;
  isOwner: boolean;
}) {
  /**
   * ร้านใหม่ = ข้อความกลาง ๆ ไม่มีตัวเลขเลย
   * ⚠️ ห้ามโชว์ "0 งาน" หรือ "ตรงเวลา 0%" — ร้านที่ยังไม่มีประวัติไม่ใช่ร้านที่แย่
   * เจ้าของร้านเห็นความคืบหน้าของตัวเองได้ คนนอกไม่เห็น
   */
  if (record.locked) {
    return (
      <Card className="mt-6 flex-row items-start gap-3 p-4">
        <Sprout className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{t.reputation.newShop}</p>
          <p className="text-sm text-muted-foreground">
            {fill(t.reputation.newShopBody, { min: TRACK_RECORD_MIN_COMPLETED })}
          </p>
          {isOwner ? (
            <p className="tabular text-xs text-muted-foreground">
              {fill(t.reputation.ownerProgress, {
                n: record.completed,
                min: TRACK_RECORD_MIN_COMPLETED,
              })}
            </p>
          ) : null}
        </div>
      </Card>
    );
  }

  const stats: Array<{ label: string; value: string }> = [
    { label: t.reputation.completed, value: formatNumber(record.completed, locale) },
    {
      label: t.reputation.onTime,
      value:
        record.onTimePercent === null
          ? t.reputation.noData
          : `${formatNumber(record.onTimePercent, locale)}%`,
    },
    { label: t.reputation.turnaround, value: turnaroundText(t, record.turnaround, locale) },
    {
      label: t.reputation.creatorCancelled,
      value: fill(t.reputation.creatorCancelledValue, {
        n: formatNumber(record.creatorCancelled, locale),
      }),
    },
  ];

  return (
    <section aria-labelledby="track-record" className="mt-6">
      <Card className="gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="track-record" className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-success" />
            {t.reputation.title}
          </h2>
          {record.rating ? (
            <p className="tabular inline-flex items-center gap-1.5 text-sm">
              <Star aria-hidden className="size-4 fill-warning text-warning" />
              <span className="font-medium">
                {fill(t.reputation.ratingValue, {
                  avg: record.rating.average.toFixed(1),
                })}
              </span>
              <span className="text-muted-foreground">
                · {reviewCountText(t, record.rating.count, locale)}
              </span>
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="tabular mt-0.5 text-lg font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>
        {/* นิยามต้องอยู่คู่ตัวเลขเสมอ — ลูกค้าใช้ตัวเลขนี้ตัดสินใจโอนเงินจริง */}
        <p className="text-xs leading-relaxed text-muted-foreground">{t.reputation.footnote}</p>
      </Card>
    </section>
  );
}

export function ShopReviews({
  reviews,
  total,
  t,
  locale,
}: {
  reviews: PublicReview[];
  /** จำนวนรีวิวที่โชว์ได้ทั้งหมด — รายการข้างบนตัดไว้แค่ล่าสุด */
  total: number;
  t: Dictionary;
  locale: Locale;
}) {
  return (
    <section aria-labelledby="reviews" className="max-w-2xl">
      <h2 id="reviews" className="text-xl font-semibold tracking-tight">
        {t.reputation.reviewsTitle}
        {total > 0 ? (
          <span className="tabular ml-2 text-base font-normal text-muted-foreground">
            {reviewCountText(t, total, locale)}
          </span>
        ) : null}
      </h2>

      {reviews.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t.reputation.noReviews}</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card className="gap-2.5 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars
                    rating={r.rating}
                    label={fill(t.reputation.starsLabel, { n: r.rating })}
                  />
                  <span className="text-sm font-medium">
                    {r.initial ? `${r.initial}.` : t.reputation.anonymous}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fill(t.reputation.orderedIn, { month: formatYearMonth(r.orderMonth, locale) })}
                    {r.edited ? ` · ${t.reputation.edited}` : null}
                  </span>
                </div>
                {r.body ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.body}</p>
                ) : null}
                {r.reply ? (
                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium">
                      <MessageSquareReply className="size-3.5" />
                      {t.reputation.shopReply}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{r.reply}</p>
                    {r.repliedBeforeEdit ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {t.reputation.repliedBeforeEdit}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

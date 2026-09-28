"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquareReply, Pencil, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Stars } from "@/components/stars";
import { useLocale } from "@/lib/i18n/client";
import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import {
  createReview,
  editReview,
  replyToReview,
  type ReviewResult,
} from "@/lib/reputation/actions";
import {
  REVIEW_BODY_MAX,
  REVIEW_EDIT_DAYS,
  REVIEW_REPLY_MAX,
} from "@/lib/reputation/review-rules";
import type { OrderReviewView } from "@/lib/reputation/view";
import { cn } from "@/lib/utils";

/**
 * รีวิวบนหน้าออเดอร์ — ลูกค้าเขียน/แก้ (`ClientReviewCard`) ร้านตอบ (`CreatorReviewCard`)
 *
 * ⚠️ คอมโพเนนต์นี้ไม่ได้เป็นคนตัดสินสิทธิ์ — ปุ่มแก้โชว์ตาม `editable` ที่ server คิดมาให้
 * ด่านจริงอยู่ใน lib/reputation/actions.ts ทุกข้อ (เป็นลูกค้าจริงไหม งานเสร็จ+มีเงินไหม ยังไม่เกิน 7 วันไหม
 * ตอบไปแล้วหรือยัง) หน้าที่ค้างไว้นานแล้วกดจึงได้ error ที่ตรงเรื่อง แล้วรีเฟรชให้เห็นของจริง
 */

type Failure = Extract<ReviewResult, { ok: false }>["error"];

function errorText(t: Dictionary, error: Failure): string {
  switch (error) {
    case "exists":
      return t.review.errorExists;
    case "not_completed":
      return t.review.errorNotCompleted;
    case "unpaid":
      return t.review.errorUnpaid;
    case "edit_closed":
      return fill(t.review.errorEditClosed, { days: REVIEW_EDIT_DAYS });
    case "already_replied":
      return t.review.errorAlreadyReplied;
    case "rate_limited":
      return t.review.errorRateLimited;
    case "invalid":
      return t.review.pickRating;
    default:
      return t.error.title;
  }
}

/** ข้อผิดพลาดที่แปลว่า "หน้าจอนี้เก่าแล้ว" — รีเฟรชให้เห็นสถานะจริงแทนการค้างฟอร์มเดิมไว้ */
const STALE: readonly Failure[] = [
  "exists",
  "edit_closed",
  "already_replied",
  "not_completed",
  "unpaid",
];

function StarPicker({
  value,
  onChange,
  disabled,
  t,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
  t: Dictionary;
}) {
  return (
    <div role="radiogroup" aria-label={t.review.ratingLabel} className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={fill(t.review.starN, { n })}
          disabled={disabled}
          onClick={() => onChange(n)}
          className="rounded-md p-1 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          <Star
            aria-hidden
            className={cn(
              "size-6",
              n <= value ? "fill-warning text-warning" : "text-muted-foreground/50",
            )}
          />
        </button>
      ))}
    </div>
  );
}

function ReviewBody({ review, t }: { review: OrderReviewView; t: Dictionary }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Stars rating={review.rating} label={fill(t.reputation.starsLabel, { n: review.rating })} />
        {review.edited ? (
          <span className="text-xs text-muted-foreground">{t.reputation.edited}</span>
        ) : null}
      </div>
      {review.body ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{review.body}</p>
      ) : null}
    </div>
  );
}

function ReplyBlock({ label, text, note }: { label: string; text: string; note: string | null }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <MessageSquareReply className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
      {note ? <p className="mt-1.5 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** ฝั่งลูกค้า — เขียนครั้งแรก หรือดู/แก้รีวิวของตัวเองภายใน 7 วัน */
export function ClientReviewCard({
  code,
  review,
}: {
  code: string;
  review: OrderReviewView | null;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(review === null);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [body, setBody] = useState(review?.body ?? "");

  function submit() {
    if (rating < 1) {
      toast.error(t.review.pickRating);
      return;
    }
    start(async () => {
      const input = { code, rating, body };
      const res = review ? await editReview(input) : await createReview(input);
      if (res.ok) {
        toast.success(review ? t.review.saved : t.review.posted);
        setEditing(false);
        router.refresh();
        return;
      }
      toast.error(errorText(t, res.error));
      if (STALE.includes(res.error)) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function cancelEdit() {
    setRating(review?.rating ?? 0);
    setBody(review?.body ?? "");
    setEditing(false);
  }

  return (
    <Card className="gap-3 p-6">
      <div className="space-y-1">
        <p className="font-medium">{review ? t.review.yours : t.review.title}</p>
        {!review ? <p className="text-sm text-muted-foreground">{t.review.hint}</p> : null}
      </div>

      {editing ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <StarPicker value={rating} onChange={setRating} disabled={pending} t={t} />
          <div className="space-y-1.5">
            <Label htmlFor={`review-body-${code}`}>{t.review.bodyLabel}</Label>
            <Textarea
              id={`review-body-${code}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={REVIEW_BODY_MAX}
              placeholder={t.review.bodyPlaceholder}
              rows={3}
              disabled={pending}
            />
            <p className="tabular text-right text-xs text-muted-foreground">
              {body.length}/{REVIEW_BODY_MAX}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {review ? t.review.save : t.review.submit}
            </Button>
            {review ? (
              <Button type="button" variant="ghost" onClick={cancelEdit} disabled={pending}>
                {t.common.cancel}
              </Button>
            ) : null}
          </div>
        </form>
      ) : review ? (
        <>
          <ReviewBody review={review} t={t} />
          {review.reply ? (
            <ReplyBlock
              label={t.reputation.shopReply}
              text={review.reply}
              note={review.repliedBeforeEdit ? t.reputation.repliedBeforeEdit : null}
            />
          ) : null}
          {review.editable ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" />
                {t.review.edit}
              </Button>
              <span className="text-xs text-muted-foreground">
                {fill(t.review.editableUntil, { date: review.editableUntilText })}
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {fill(t.review.editClosed, { days: REVIEW_EDIT_DAYS })}
            </p>
          )}
        </>
      ) : null}
    </Card>
  );
}

/** ฝั่งร้าน — อ่านรีวิว แล้วตอบได้ครั้งเดียว */
export function CreatorReviewCard({ code, review }: { code: string; review: OrderReviewView }) {
  const { t } = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reply, setReply] = useState("");

  function submit() {
    const body = reply.trim();
    if (!body) return;
    start(async () => {
      const res = await replyToReview({ code, body });
      if (res.ok) {
        toast.success(t.review.replied);
        setReply("");
        router.refresh();
        return;
      }
      toast.error(errorText(t, res.error));
      if (STALE.includes(res.error)) router.refresh();
    });
  }

  return (
    <Card className="gap-3 p-5">
      <p className="font-medium">{t.review.clientReviewed}</p>
      <ReviewBody review={review} t={t} />

      {review.reply !== null ? (
        <ReplyBlock
          label={t.review.yourReply}
          text={review.reply}
          note={review.repliedBeforeEdit ? t.reputation.repliedBeforeEdit : null}
        />
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Label htmlFor={`review-reply-${code}`}>{t.review.replyTitle}</Label>
          <p className="text-xs text-muted-foreground">{t.review.replyHint}</p>
          <Textarea
            id={`review-reply-${code}`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={REVIEW_REPLY_MAX}
            placeholder={t.review.replyPlaceholder}
            rows={3}
            disabled={pending}
          />
          <Button type="submit" size="sm" disabled={pending || reply.trim().length === 0}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t.review.replySubmit}
          </Button>
        </form>
      )}
    </Card>
  );
}

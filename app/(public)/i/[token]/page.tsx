import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/user-avatar";
import { getSession } from "@/lib/auth-guard";
import { getInviteByToken } from "@/lib/queries/orders";
import { formatMoney } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { ClaimButton } from "./claim-button";

export const metadata: Metadata = {
  // ลิงก์ส่วนตัวที่ส่งกันในแชต — ห้ามเข้าดัชนีเด็ดขาด
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const invite = await getInviteByToken(token);
  if (!invite) notFound();

  const t = getDictionary(await getLocale());
  const locale = await getLocale();
  const session = await getSession();
  const rev = invite.revisions[0] ?? null;

  /**
   * ⚠️ เทียบอีเมลที่นี่ แล้วส่งลงไปแค่ค่าจริง/เท็จ
   * ห้ามส่งตัวอีเมลของใบลงไปที่ client component และห้ามแสดงบนหน้าจอ
   * ไม่งั้นลิงก์ที่ถูกส่งต่อกันมาจะกลายเป็นเครื่องมือตรวจอีเมลของคนอื่น
   */
  const emailMatches =
    Boolean(session) &&
    (session!.user.email ?? "").toLowerCase() === invite.email.toLowerCase();

  const dead = Boolean(invite.revokedAt) || invite.expired || Boolean(invite.confirmedAt);
  const claimedByMe = invite.claims[0]?.userId === session?.user.id;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="flex items-center gap-3">
        <UserAvatar
          user={{
            name: invite.page.user?.name ?? invite.page.displayName,
            email: "",
            image: invite.page.user?.image,
          }}
          className="size-11"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold">{invite.page.displayName}</p>
          {invite.page.user?.handle ? (
            <Link
              href={`/@${invite.page.user.handle}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              @{invite.page.user.handle}
            </Link>
          ) : null}
        </div>
      </div>

      <Card className="mt-6 gap-3 border-primary/40 bg-primary/[0.03] p-6">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-primary" />
          <p className="font-medium">{t.invite.previewTitle}</p>
        </div>
        <p className="text-sm text-muted-foreground">{invite.service?.title ?? "—"}</p>

        {rev ? (
          <>
            <ul className="mt-1 space-y-1.5 text-sm">
              {rev.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{l.label}</span>
                  <span className="tabular shrink-0">
                    {formatMoney(l.amountCents, "THB", locale)}
                  </span>
                </li>
              ))}
            </ul>

            <Separator />

            <div className="flex justify-between">
              <span className="font-medium">{t.order.total}</span>
              <span className="tabular text-lg font-semibold">
                {formatMoney(rev.totalCents, "THB", locale)}
              </span>
            </div>

            {rev.depositCents > 0 ? (
              <p className="tabular text-sm text-muted-foreground">
                {t.quote.depositDue.replace(
                  "{amount}",
                  formatMoney(rev.depositCents, "THB", locale),
                )}
              </p>
            ) : null}

            <p className="text-sm text-muted-foreground">
              {t.invite.terms
                .replace("{days}", String(rev.deliveryDays))
                .replace("{revisions}", String(rev.revisionsIncluded))}
            </p>

            {rev.note ? (
              <p className="rounded-lg bg-muted/60 p-3 text-sm whitespace-pre-wrap">{rev.note}</p>
            ) : null}

            {rev.tosSnapshot.length > 0 ? (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">{t.creator.tosTitle}</p>
                <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  {rev.tosSnapshot.map((line, i) => (
                    <li key={i}>• {line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t.invite.noRevision}</p>
        )}
      </Card>

      <div className="mt-5">
        {invite.confirmedAt ? (
          <Card className="gap-1.5 p-5">
            <p className="font-medium">{t.invite.alreadyOrder}</p>
          </Card>
        ) : dead ? (
          <Card className="gap-1.5 p-5">
            <p className="font-medium">{t.invite.deadTitle}</p>
            <p className="text-sm text-muted-foreground">{t.invite.deadBody}</p>
          </Card>
        ) : !session ? (
          <Card className="gap-3 p-5">
            <p className="text-sm text-muted-foreground">{t.invite.signInFirst}</p>
            <Button asChild className="w-full">
              <Link href={`/sign-in?next=${encodeURIComponent(`/i/${token}`)}`}>
                {t.invite.signInCta}
              </Link>
            </Button>
          </Card>
        ) : claimedByMe ? (
          <Card className="gap-1.5 p-5">
            <p className="font-medium">{t.invite.claimedTitle}</p>
            <p className="text-sm text-muted-foreground">{t.invite.claimedBody}</p>
          </Card>
        ) : !emailMatches ? (
          /* ไม่บอกว่าใบนี้ออกให้อีเมลไหน — บอกแค่ว่าไม่ใช่บัญชีนี้ */
          <Card className="gap-1.5 p-5">
            <p className="font-medium">{t.invite.wrongAccountTitle}</p>
            <p className="text-sm text-muted-foreground">{t.invite.wrongAccountBody}</p>
          </Card>
        ) : rev ? (
          <ClaimButton token={token} revisionId={rev.id} />
        ) : null}
      </div>
    </div>
  );
}

import { count } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/auth-guard";
import { getDb, schema } from "@/lib/db";
import { listAllShopsForAdmin } from "@/lib/queries/creator";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/server";
import { formatDate } from "@/lib/format";
import { formatPromptPayId } from "@/lib/payments/promptpay-id";

/**
 * ภาพรวมสำหรับผู้ดูแล — รอบแรกเป็นหน้าอ่านอย่างเดียว
 *
 * `requireAdmin()` เรียกซ้ำถึงแม้ layout จะเรียกไปแล้ว: `cache()` ทำให้ไม่โดน DB สองรอบ
 * และการพึ่ง layout อย่างเดียวแปลว่าวันที่ย้ายหน้านี้ออกจากกลุ่ม การป้องกันจะหลุดเงียบ ๆ
 */
export default async function AdminPage() {
  await requireAdmin();
  const t = getDictionary(await getLocale()).admin;
  const locale = await getLocale();

  const db = getDb();
  const [[users], [shops], [orders], rows] = await Promise.all([
    db.select({ n: count() }).from(schema.user),
    db.select({ n: count() }).from(schema.creatorPage),
    db.select({ n: count() }).from(schema.order),
    listAllShopsForAdmin(),
  ]);

  const published = rows.filter((r) => r.isPublished).length;

  const stats = [
    { label: t.totalUsers, value: users.n },
    { label: t.totalShops, value: shops.n },
    { label: t.publishedShops, value: published },
    { label: t.totalOrders, value: orders.n },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:py-8">
      <h1 className="text-xl font-semibold tracking-tight">{t.overview}</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="gap-1 p-4">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="tabular text-2xl font-semibold">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <p className="font-medium">{t.shopsTitle}</p>
        <p className="text-sm text-muted-foreground">{t.shopsHint}</p>
      </div>

      {rows.length === 0 ? (
        <Card className="mt-4 p-10 text-center text-sm text-muted-foreground">{t.empty}</Card>
      ) : (
        <Card className="mt-4 gap-0 overflow-x-auto p-0">
          <table className="w-full min-w-160 text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">{t.colShop}</th>
                <th className="p-3 font-medium">{t.colOwner}</th>
                <th className="p-3 font-medium">{t.colContact}</th>
                <th className="p-3 font-medium">{t.colState}</th>
                <th className="p-3 font-medium">{t.colUpdated}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="p-3">
                    <p className="font-medium">{r.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.user.handle ? `/@${r.user.handle}` : "—"}
                    </p>
                  </td>
                  <td className="p-3">
                    <p>{r.user.name}</p>
                    <p className="text-xs break-all text-muted-foreground">{r.user.email}</p>
                  </td>
                  <td className="p-3">
                    <p className="tabular text-xs">
                      {r.contactPhone
                        ? formatPromptPayId("phone", r.contactPhone)
                        : t.noPhone}
                    </p>
                    <p className="tabular text-xs text-muted-foreground">
                      {r.promptpayId ? formatPromptPayId("phone", r.promptpayId) : t.noPayout}
                    </p>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {!r.isPublished ? (
                        <Badge variant="secondary">{t.notPublished}</Badge>
                      ) : null}
                      {r.isDemo ? <Badge variant="outline">{t.demoShop}</Badge> : null}
                    </div>
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap text-muted-foreground">
                    {formatDate(r.updatedAt, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

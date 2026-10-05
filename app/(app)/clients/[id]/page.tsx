import Link from "next/link";
import { notFound } from "next/navigation";
import { CapabilityAccessError } from "@/lib/capabilities/authorize";
import { clientHistory } from "@/lib/clients/queries";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/format";
import { orderHref } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { ClientPagination } from "../pagination";
import { ProfileEditor } from "./profile-editor";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const th = locale === "th";
  const t = getDictionary(locale);
  let result;
  try { result = await clientHistory(id, (await searchParams).page); }
  catch (error) { if (!(error instanceof CapabilityAccessError)) throw error; }
  if (!result) notFound();
  return <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 lg:py-8">
    <Button asChild variant="outline"><Link href="/clients">{th ? "กลับไปรายชื่อลูกค้า" : "Back to clients"}</Link></Button>
    <header><h1 className="text-xl font-semibold [overflow-wrap:anywhere]">{result.client.name}</h1><p className="mt-1 text-sm text-muted-foreground">{th ? "แสดงเฉพาะงานที่สั่งกับร้านของคุณ" : "Only orders placed with your shop."}</p></header>
    <ul className="space-y-3">{result.orders.map(order => <li key={order.code} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><Link className="font-medium underline underline-offset-4" href={orderHref(order.code)}>#{order.code}</Link><p className="mt-1 text-sm text-muted-foreground">{t.orderStatus[order.status as keyof typeof t.orderStatus] ?? order.status} · {new Date(order.created_at).toLocaleDateString(th ? "th-TH" : "en-US", { timeZone: "Asia/Bangkok" })}</p></div><div className="text-sm"><p>{th ? "มูลค่างาน" : "Order total"}: {formatMoney(order.total, order.currency, locale)}</p><p className="mt-1 text-muted-foreground">{th ? "รับยืนยันแล้ว" : "Confirmed receipts"}: {formatMoney(Number(order.received), order.currency, locale)}</p></div></div></li>)}</ul>
    {!result.orders.length ? <p className="text-muted-foreground">{th ? "ไม่มีรายการในหน้านี้" : "No orders on this page."}</p> : null}
    <ClientPagination page={result.page} hasNext={result.hasNext} base={`/clients/${encodeURIComponent(id)}`} th={th} />
    {result.canEdit ? <ProfileEditor clientId={result.client.id} profile={result.profile} /> : <section className="space-y-3 rounded-xl border p-4"><h2 className="font-medium">{th ? "โน้ตและแท็กส่วนตัว (อ่านอย่างเดียว)" : "Private notes and tags (read only)"}</h2><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{result.profile.note || "—"}</p><p className="text-sm text-muted-foreground">{result.profile.tags.join(", ") || "—"}</p></section>}
  </div>;
}

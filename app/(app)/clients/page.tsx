import Link from "next/link";
import { CapabilityAccessError } from "@/lib/capabilities/authorize";
import { listClients } from "@/lib/clients/queries";
import { getLocale } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dynamicHref } from "@/lib/routes";
import { ClientPagination } from "./pagination";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const locale = await getLocale();
  const th = locale === "th";
  let result;
  try { result = await listClients(await searchParams); }
  catch (error) { if (!(error instanceof CapabilityAccessError)) throw error; }
  return <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 lg:py-8">
    <header><h1 className="text-xl font-semibold">{th ? "ลูกค้า" : "Clients"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{th ? "ประวัติการสั่งงานกับร้านของคุณ และยอดรับที่ยืนยันแล้ว" : "Order history with your shop and confirmed receipts."}</p></header>
    {!result ? <div className="rounded-xl border bg-muted/30 p-6"><h2 className="font-medium">{th ? "ยังไม่เปิดให้ใช้งาน" : "Not available yet"}</h2><p className="mt-2 text-sm text-muted-foreground">{th ? "ส่วนลูกค้ากำลังเตรียมเปิดใช้งาน คุณยังดูข้อมูลลูกค้าจากแต่ละออเดอร์ได้" : "Client management is being prepared. You can still view client details in each order."}</p><Button asChild variant="outline" className="mt-4"><Link href="/orders">{th ? "ดูออเดอร์" : "View orders"}</Link></Button></div> : <>
      <form className="space-y-2"><Label htmlFor="client-search">{th ? "ค้นหาชื่อลูกค้า" : "Search client name"}</Label><div className="flex gap-2"><Input id="client-search" name="q" defaultValue={result.q} maxLength={100} /><Button type="submit">{th ? "ค้นหา" : "Search"}</Button></div></form>
      <p className="text-xs text-muted-foreground">{th ? "ยอดรับแสดงเฉพาะ THB ที่ยืนยันแล้ว ไม่นับรายการถูกปฏิเสธหรือยกเลิกการยืนยัน จำนวนงานรวมทุกสถานะ" : "Receipts include confirmed THB payments, excluding rejected or voided records. Order counts include all statuses."}</p>
      {result.clients.length ? <ul className="divide-y rounded-xl border">{result.clients.map(client => <li key={client.id}><Link href={dynamicHref(`/clients/${encodeURIComponent(client.id)}`)} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"><div className="min-w-0"><p className="font-medium [overflow-wrap:anywhere]">{client.name}</p><p className="mt-1 text-sm text-muted-foreground">{client.orders} {th ? "งาน" : "orders"} · {new Date(client.last_order).toLocaleDateString(th ? "th-TH" : "en-US", { timeZone: "Asia/Bangkok" })}</p>{client.tags.length ? <div className="mt-2 flex flex-wrap gap-1">{client.tags.map(tag => <span key={tag} className="rounded-md bg-muted px-2 py-1 text-xs [overflow-wrap:anywhere]">{tag}</span>)}</div> : null}</div><p className="text-sm font-medium tabular-nums">{formatMoney(Number(client.received), "THB", locale)}</p></Link></li>)}</ul> : <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{th ? "ไม่พบลูกค้าในรายการนี้" : "No clients found."}</p>}
      <ClientPagination page={result.page} hasNext={result.hasNext} base="/clients" q={result.q} th={th} />
    </>}
  </div>;
}

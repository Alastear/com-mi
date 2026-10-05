import Link from "next/link";
import { and, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { requireCreator } from "@/lib/auth-guard";
import { getDb, schema } from "@/lib/db";
import { usedBytesSql, planLimits } from "@/lib/uploads/intent";
import { getLocale } from "@/lib/i18n/server";
import { formatBytes } from "@/lib/format";
import { dynamicHref } from "@/lib/routes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default async function FilesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; kind?: string }> }) {
  const { user } = await requireCreator();
  const th = await getLocale() === "th";
  const params = await searchParams;
  const q = (params.q ?? "").slice(0, 100);
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1") || 1));
  const kinds = ["avatar", "banner", "portfolio", "service_cover", "wip", "final"];
  const kindLabels: Record<string, string> = th
    ? { avatar: "รูปโปรไฟล์", banner: "แบนเนอร์", portfolio: "ผลงานหน้าร้าน", service_cover: "ปกเมนู", wip: "ตัวอย่างงาน", final: "ไฟล์ส่งมอบ" }
    : { avatar: "Profile photo", banner: "Banner", portfolio: "Portfolio", service_cover: "Service cover", wip: "Work preview", final: "Delivery" };
  const kind = kinds.includes(params.kind ?? "") ? params.kind : undefined;
  const db = getDb();
  const where = and(eq(schema.media.ownerUserId, user.id), q ? ilike(schema.media.filename, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined, kind ? eq(schema.media.kind, kind) : undefined);
  const [files, totals, usage] = await Promise.all([
    db.query.media.findMany({ where, orderBy: [desc(schema.media.createdAt), desc(schema.media.id)], limit: 50, offset: (page - 1) * 50, columns: { id: true, filename: true, kind: true, bytes: true, status: true, orderId: true, createdAt: true } }),
    db.select({ n: count() }).from(schema.media).where(where),
    db.execute(sql`select ${usedBytesSql(user.id)} as bytes`),
  ]);
  const orderIds = files.flatMap(f => f.orderId ? [f.orderId] : []);
  const orders = orderIds.length ? await db.query.order.findMany({ where: inArray(schema.order.id, orderIds), columns: { id: true, code: true } }) : [];
  const byOrder = new Map(orders.map(o => [o.id, o.code]));
  const bytes = Number(usage.rows[0]?.bytes ?? 0);
  const limit = planLimits(user.plan).storage_bytes;
  const pages = Math.max(1, Math.ceil((totals[0]?.n ?? 0) / 50));
  const href = (n: number) => dynamicHref(`/files?${new URLSearchParams({ q, kind: kind ?? "", page: String(n) })}`);
  return <div className="mx-auto w-full max-w-5xl space-y-5 p-5 sm:p-8">
    <h1 className="text-2xl font-semibold">{th ? "จัดการไฟล์" : "File manager"}</h1>
    <Card className="gap-3 p-5"><p className="font-medium">{th ? "พื้นที่ใช้รวมไฟล์ที่กำลังอัปโหลด" : "Storage, including reserved uploads"}</p>
      <p className="tabular-nums">{formatBytes(bytes)} / {formatBytes(limit)}</p>
      <progress value={Math.min(bytes, limit)} max={limit} className="h-3 w-full" aria-label={th ? "พื้นที่จัดเก็บ" : "Storage used"} />
      <p className="text-sm text-muted-foreground">{th ? "ไฟล์ที่ใช้ในร้านหรือออเดอร์ต้องจัดการจากรายการที่เกี่ยวข้อง เพื่อรักษาประวัติและสิทธิ์ของลูกค้า" : "Manage linked files from their shop or order to preserve history and client access."}</p>
    </Card>
    <form className="flex flex-wrap gap-2"><Input name="q" defaultValue={q} placeholder={th ? "ค้นหาชื่อไฟล์" : "Search filename"} aria-label={th ? "ค้นหาชื่อไฟล์" : "Search filename"} className="min-w-48 flex-1" />
      <select name="kind" defaultValue={kind ?? ""} className="rounded-lg border bg-background px-3 py-2" aria-label={th ? "ประเภทไฟล์" : "File type"}><option value="">{th ? "ทุกประเภท" : "All types"}</option>{kinds.map(k => <option key={k} value={k}>{kindLabels[k]}</option>)}</select>
      <Button type="submit">{th ? "ค้นหา" : "Search"}</Button>
    </form>
    <p className="text-sm text-muted-foreground">{totals[0]?.n ?? 0} {th ? "ไฟล์" : "files"}</p>
    <ul className="space-y-2">{files.map(f => <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-4"><div className="min-w-0 flex-1"><p className="truncate font-medium">{f.filename || kindLabels[f.kind] || (th ? "ไฟล์" : "File")}</p><p className="text-xs text-muted-foreground">{formatBytes(f.bytes)} · {kindLabels[f.kind] ?? (th ? "ไฟล์แนบ" : "Attachment")} · {f.createdAt.toLocaleDateString(th ? "th-TH" : "en-US", { timeZone: "Asia/Bangkok" })}</p></div>
      <Badge variant="secondary">{f.status === "linked" ? (th ? "กำลังใช้งาน" : "Linked") : (th ? "ยังไม่ผูกกับรายการ" : "Unlinked")}</Badge>
      <Button asChild size="sm" variant="outline"><Link href={dynamicHref(f.orderId && byOrder.has(f.orderId) ? `/orders/${byOrder.get(f.orderId)}` : f.kind === "portfolio" ? "/portfolio" : f.kind === "service_cover" ? "/services" : "/shop")}>{th ? "จัดการรายการ" : "Manage"}</Link></Button>
    </li>)}</ul>
    {!files.length ? <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{th ? "ไม่พบไฟล์" : "No files found"}</p> : null}
    <div className="flex items-center justify-between">{page <= 1 ? <Button variant="outline" disabled>{th ? "ก่อนหน้า" : "Previous"}</Button> : <Button asChild variant="outline"><Link href={href(page - 1)}>{th ? "ก่อนหน้า" : "Previous"}</Link></Button>}<span>{page} / {pages}</span>{page >= pages ? <Button variant="outline" disabled>{th ? "ถัดไป" : "Next"}</Button> : <Button asChild variant="outline"><Link href={href(page + 1)}>{th ? "ถัดไป" : "Next"}</Link></Button>}</div>
  </div>;
}

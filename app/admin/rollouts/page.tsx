import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { getDb, schema } from "@/lib/db";
import { getLocale } from "@/lib/i18n/server";
import { RolloutControls } from "./controls";

export default async function RolloutsPage({ searchParams }: { searchParams: Promise<{ shop?: string }> }) {
  await requireAdmin();
  const th = (await getLocale()) === "th";
  const db = getDb();
  const search = (await searchParams).shop;
  const shopFilter = typeof search === "string" ? search.trim().slice(0, 150) : "";
  const [release] = await db.select().from(schema.capabilityRollout).where(eq(schema.capabilityRollout.capability, "crm")).limit(1);
  const members = await db.select({ shopId: schema.capabilityCohort.creatorPageId, cohort: schema.capabilityCohort.cohort, version: schema.capabilityCohort.version })
    .from(schema.capabilityCohort).where(and(eq(schema.capabilityCohort.capability, "crm"), shopFilter ? eq(schema.capabilityCohort.creatorPageId, shopFilter) : undefined)).orderBy(desc(schema.capabilityCohort.updatedAt)).limit(50);
  const audit = await db.select({ id: schema.capabilityAudit.id, actor: schema.capabilityAudit.actorUserId, target: schema.capabilityAudit.target, reason: schema.capabilityAudit.reason, after: schema.capabilityAudit.after, createdAt: schema.capabilityAudit.createdAt })
    .from(schema.capabilityAudit).where(eq(schema.capabilityAudit.capability, "crm")).orderBy(desc(schema.capabilityAudit.createdAt)).limit(30);
  return <div className="mx-auto max-w-4xl space-y-6 px-4 py-8"><Link href="/admin" className="underline">{th ? "กลับหน้าผู้ดูแล" : "Back to admin"}</Link><h1 className="text-xl font-semibold">CRM rollout</h1>
    <p className="text-sm text-muted-foreground">{th ? "internal ใช้ได้เฉพาะ staging/development ส่วน beta ต้องอยู่ในรายชื่อร้านที่อนุญาต paused หยุดการแก้ไขแต่ยังอ่านข้อมูลเดิมได้ ไม่มีปุ่มเปิด live" : "Internal access requires staging/development. Beta requires shop membership. Paused blocks new writes while retaining existing reads. Public launch is not available here."}</p>
    <p>{th ? "สถานะปัจจุบัน" : "Current status"}: {release?.status ?? "planned"}</p>
    <RolloutControls key={`release-${release?.version ?? 0}`} kind="release" current={release?.status} version={release?.version ?? 0} />
    <RolloutControls kind="cohort" version={0} />
    <h2 className="font-semibold">{th ? "สมาชิกที่แก้ไขล่าสุด (สูงสุด 50 ร้าน)" : "Recently updated members (up to 50)"}</h2>
    <form className="flex flex-wrap items-end gap-2"><label className="flex-1 text-sm">{th ? "ค้นหาสมาชิกด้วยรหัสร้าน" : "Find member by shop ID"}<input name="shop" defaultValue={shopFilter} maxLength={150} className="mt-1 block min-h-11 w-full rounded-lg border bg-background px-3" /></label><button className="min-h-11 rounded-lg border px-4">{th ? "ค้นหา" : "Search"}</button></form>
    {members.map(member => <RolloutControls key={`${member.shopId}-${member.version}`} kind="cohort" shopId={member.shopId} current={member.cohort} version={member.version} />)}
    <h2 className="font-semibold">{th ? "ประวัติล่าสุด 30 รายการ" : "Latest 30 audit records"}</h2>
    <ul className="divide-y rounded-xl border">{audit.map(row => <li key={row.id} className="space-y-1 p-3 text-sm [overflow-wrap:anywhere]"><p>{row.target} → {String(row.after.status ?? row.after.cohort ?? "")}</p><p>{row.reason}</p><p className="text-xs text-muted-foreground">{th ? "ผู้แก้ไข" : "Actor"}: {row.actor ?? "—"}</p><time className="text-muted-foreground">{row.createdAt.toLocaleString(th ? "th-TH" : "en-US", { timeZone: "Asia/Bangkok" })}</time></li>)}</ul>
  </div>;
}

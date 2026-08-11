import { del, list } from "@vercel/blob";
import { and, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * เก็บกวาดไฟล์ที่ไม่มีใครใช้แล้ว
 *
 * `registerMedia()` เขียนแถวใหม่เป็น `status: "orphan"` พร้อมคอมเมนต์ว่า
 * "cron เก็บกวาดตัวที่ค้างเกิน 24 ชม." มาตั้งแต่ต้น — แต่ cron ตัวนั้นไม่เคยถูกสร้าง
 *
 * มีขยะสองชนิด และชนิดที่สองมองจากฐานข้อมูลไม่เห็นเลย:
 *
 * 1. **แถวที่ค้างเป็น `orphan`** — อัปโหลดขึ้นไปแล้วแต่ไม่เคยถูกผูกกับอะไร
 * 2. **ไฟล์ที่ไม่มีแถวเลย** — เกิดตอน `put()` สำเร็จแล้วผู้ใช้ปิดแท็บก่อน
 *    `registerMedia()` จะถูกเรียก ไฟล์นั้นจะอยู่ในถังตลอดกาลโดยไม่มีอะไรชี้ถึง
 *    และไม่มี query ไหนหาเจอ ตอนตรวจจริงพบว่าเป็น 8 จาก 10 ไฟล์ในถังสาธารณะ
 *
 * ⚠️ **ไม่แตะถังส่วนตัวเลย** ถังนั้นเก็บไฟล์งานที่ลูกค้าจ่ายเงินแล้ว
 * ลบผิดหนึ่งไฟล์คือลูกค้าเสียของที่ซื้อไปแล้วและกู้คืนไม่ได้
 * ส่วนที่ได้คืนมาคือพื้นที่ไม่กี่ KB — ไม่คุ้มกันเลย
 * (ทางนั้นมี `registerDeliveryFile` ลบไฟล์ให้เองอยู่แล้วเมื่อผูกไม่สำเร็จ)
 */

/** เวลาผ่อนผัน — ไฟล์ที่เพิ่งอัปยังอยู่ระหว่างทางไป `registerMedia()` ได้ */
export const GRACE_MS = 24 * 60 * 60 * 1000;

export type CleanupReport = {
  orphanRowsDeleted: number;
  strayBlobsDeleted: number;
  scanned: number;
  keptTooRecent: number;
  keptReferenced: number;
  errors: string[];
};

/**
 * ไฟล์นี้ลบได้ไหม — แยกออกมาเป็นฟังก์ชันล้วนเพื่อให้เทสต์ได้โดยไม่ต้องต่อเน็ต
 *
 * เขียนเป็น "เงื่อนไขที่ต้องจริงทั้งหมดถึงจะลบ" ไม่ใช่ "เงื่อนไขที่ห้ามลบ" —
 * ตัวแปรใหม่ที่โผล่มาทีหลังจะตกไปอยู่ฝั่งไม่ลบเสมอ ซึ่งเป็นฝั่งที่ปลอดภัย
 */
export function isStray(
  blob: { pathname: string; uploadedAt: Date },
  referenced: ReadonlySet<string>,
  now: number,
  graceMs: number = GRACE_MS,
): boolean {
  if (referenced.has(blob.pathname)) return false;
  return now - blob.uploadedAt.getTime() > graceMs;
}

/**
 * ทุก pathname ที่ยังมีแถวชี้ถึง
 *
 * ⚠️ ต้องรวม `posterPathname` ด้วย ไม่ใช่แค่ `pathname`
 * โปสเตอร์ของวิดีโอถูกเก็บเป็น "คอลัมน์ของแถวอื่น" ไม่ได้มีแถวเป็นของตัวเอง
 * (`components/portfolio-uploader.tsx` ส่ง `posterPathname` มาพร้อมวิดีโอ)
 * ถ้าดูแค่ `pathname` โปสเตอร์ทุกอันจะดูเหมือนไฟล์กำพร้าและถูกลบทิ้งหมด
 */
export function referencedPaths(
  rows: ReadonlyArray<{ pathname: string | null; posterPathname: string | null }>,
): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.pathname) set.add(r.pathname);
    if (r.posterPathname) set.add(r.posterPathname);
  }
  return set;
}

export async function cleanupMedia(
  opts: { dryRun?: boolean; now?: number } = {},
): Promise<CleanupReport> {
  const dryRun = opts.dryRun ?? false;
  const now = opts.now ?? Date.now();
  const cutoff = new Date(now - GRACE_MS);
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  const report: CleanupReport = {
    orphanRowsDeleted: 0,
    strayBlobsDeleted: 0,
    scanned: 0,
    keptTooRecent: 0,
    keptReferenced: 0,
    errors: [],
  };

  const db = getDb();

  /* ── 1. แถวที่ค้างเป็น orphan เกินเวลาผ่อนผัน ─────────────────────── */

  const stale = await db.query.media.findMany({
    columns: { id: true, url: true, posterUrl: true, access: true },
    where: and(eq(schema.media.status, "orphan"), lt(schema.media.createdAt, cutoff)),
    limit: 500,
  });

  for (const row of stale) {
    // ถังส่วนตัวไม่แตะ — เหตุผลอยู่ในคอมเมนต์หัวไฟล์
    if (row.access !== "public") continue;
    try {
      if (!dryRun) {
        // ลบไฟล์ก่อน แล้วค่อยลบแถว — พังกลางทางแล้วยังเหลือแถวไว้ให้รอบหน้าตามเก็บ
        // ถ้าลบแถวก่อน ไฟล์จะกลายเป็นของที่ไม่มีใครรู้จักทันที
        await del([row.url, ...(row.posterUrl ? [row.posterUrl] : [])], { token });
        await db.delete(schema.media).where(eq(schema.media.id, row.id));
      }
      report.orphanRowsDeleted += 1;
    } catch (err) {
      report.errors.push(`row ${row.id}: ${String(err).slice(0, 120)}`);
    }
  }

  /* ── 2. ไฟล์ในถังที่ไม่มีแถวไหนชี้ถึงเลย ──────────────────────────── */

  /**
   * อ่านรายการแถว **หลัง** ลบรอบแรกเสร็จ
   * ไฟล์ของแถวที่เพิ่งลบไปจึงไม่ถูกนับว่ายังมีคนใช้ และถูกเก็บในรอบนี้เลยถ้ายังค้างอยู่
   */
  const rows = await db.query.media.findMany({
    columns: { pathname: true, posterPathname: true },
  });
  const referenced = referencedPaths(rows);

  let cursor: string | undefined;
  do {
    const page = await list({ token, cursor, limit: 500 });
    cursor = page.hasMore ? page.cursor : undefined;

    for (const blob of page.blobs) {
      report.scanned += 1;
      if (referenced.has(blob.pathname)) {
        report.keptReferenced += 1;
        continue;
      }
      if (!isStray(blob, referenced, now)) {
        report.keptTooRecent += 1;
        continue;
      }
      try {
        if (!dryRun) await del(blob.url, { token });
        report.strayBlobsDeleted += 1;
      } catch (err) {
        report.errors.push(`blob ${blob.pathname}: ${String(err).slice(0, 120)}`);
      }
    }
  } while (cursor);

  return report;
}

import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { abortPrivateMultipart, deleteObjects, listObjects } from "@/lib/storage/r2";
import { affectedRows } from "@/lib/uploads/intent";
import {
  GRACE_MS,
  INTENT_EXPIRY_MARGIN_MS,
  intentVerdict,
  isOrphanDue,
  isStray,
  referencedPaths,
} from "./cleanup-rules";
import { dueOrphanSql, mediaReferencedSql, relinkReferencedOrphansSql } from "./references";

/**
 * เก็บกวาดไฟล์ที่ไม่มีใครใช้แล้ว
 *
 * `registerMedia()` เขียนแถวใหม่เป็น `status: "orphan"` พร้อมคอมเมนต์ว่า
 * "cron เก็บกวาดตัวที่ค้างเกิน 24 ชม." มาตั้งแต่ต้น — แต่ cron ตัวนั้นไม่เคยถูกสร้าง
 *
 * มีขยะสามชนิด:
 *
 * 1. **แถวที่ค้างเป็น `orphan`** — อัปโหลดขึ้นไปแล้วแต่ไม่เคยถูกผูกกับอะไร หรือเคยผูกแล้ว
 *    ถูกปลดทีหลัง (เปลี่ยนรูปหน้าร้าน/ปกเมนู ลบผลงาน — `orphanUnreferenced` ใน references.ts)
 * 2. **คำขออัปโหลดที่ไม่เคยได้บันทึก** — ผู้ใช้ปิดแท็บก่อน `registerMedia()` หรือ
 *    บันทึกไม่ผ่าน ไฟล์ขึ้นไปแล้ว (หรือขึ้นไปครึ่งเดียวเป็น multipart) แต่ไม่มีแถวชี้ถึง
 *    `upload_intent` บอกได้แม่นยำว่าไฟล์ไหน จึงเก็บกวาดถังส่วนตัวได้ด้วย
 * 3. **ไฟล์ในถังสาธารณะที่ไม่มีแถวเลย** — ของที่เกิดก่อนมี `upload_intent`
 *    ตอนตรวจสมัย Vercel Blob พบว่าเป็น 8 จาก 10 ไฟล์ในถังสาธารณะ
 *
 * ⚠️ **ถังส่วนตัวแตะได้ทางเดียว: ผ่านคำขออัปโหลดที่ไม่มีแถวไหนชี้ถึง key ของมันเลย**
 * ถังนั้นเก็บไฟล์งานที่ลูกค้าจ่ายเงินแล้ว ลบผิดหนึ่งไฟล์คือลูกค้าเสียของที่ซื้อไปแล้ว
 * และกู้คืนไม่ได้ ห้ามไล่ list ถังส่วนตัวแล้วลบตามการเดา และห้ามลบแถว orphan ของถังนั้น
 * (ไฟล์ที่อัปแล้วแต่ยังไม่ได้เตรียมส่งมอบก็เป็น orphan — ครีเอเตอร์อาจกลับมาทำต่อ)
 */

export type CleanupReport = {
  orphanRowsDeleted: number;
  intentsCleared: number;
  abandonedUploadsDeleted: number;
  strayBlobsDeleted: number;
  scanned: number;
  keptTooRecent: number;
  keptReferenced: number;
  /** แถว orphan ที่ถึงเวลาแล้วแต่ตอนจะลบกลับมีคนผูกใช้อยู่ — ไม่ลบ (ดู `sweepOrphanRows`) */
  orphanRowsKeptInUse: number;
  /** แถวสาธารณะที่เป็น orphan ทั้งที่ยังมีคนใช้ — คืนเป็น linked (ดู `relinkReferencedOrphansSql`) */
  orphanRowsRelinked: number;
  errors: string[];
};

export async function cleanupMedia(
  opts: { dryRun?: boolean; now?: number } = {},
): Promise<CleanupReport> {
  const dryRun = opts.dryRun ?? false;
  const now = opts.now ?? Date.now();
  const cutoff = new Date(now - GRACE_MS);

  const report: CleanupReport = {
    orphanRowsDeleted: 0,
    intentsCleared: 0,
    abandonedUploadsDeleted: 0,
    strayBlobsDeleted: 0,
    scanned: 0,
    keptTooRecent: 0,
    keptReferenced: 0,
    orphanRowsKeptInUse: 0,
    orphanRowsRelinked: 0,
    errors: [],
  };

  const db = getDb();

  /* ── 1. แถวที่ค้างเป็น orphan เกินเวลาผ่อนผัน ─────────────────────── */

  await sweepOrphanRows({ dryRun, now, report });

  /**
   * อ่านซ้ำ **หลัง** ลบรอบแรกเสร็จ — ไฟล์ของแถวที่เพิ่งลบไปจะได้ไม่ถูกนับว่ายังมีคนใช้
   * และถูกเก็บในรอบถัดไปเลยถ้ายังค้างอยู่ในถัง
   *
   * ⚠️ รวมแถว orphan ด้วย (ต่างจากชุดแรก) — ไฟล์ส่งมอบที่อัปแล้วแต่ยังไม่เตรียมส่ง
   * เป็น orphan และต้องปลอดภัยจากรอบที่สองกับสาม
   */
  const rows = await db.query.media.findMany({
    columns: { pathname: true, posterPathname: true },
  });
  const stillReferenced = referencedPaths(rows);

  /* ── 2. คำขออัปโหลดที่ไม่เคยได้บันทึก ─────────────────────────────── */

  /**
   * เก่าสุดก่อนเสมอ — เดิมไม่มี orderBy บัญชีเดียวที่กองคำขอไว้เยอะ ๆ เบียด 500 แถวต่อรอบ
   * จนคำขอเก่าของคนอื่นไม่ถูกเก็บเลย ตอนนี้งานค้างเดินหน้าเสมอ (เก่าสุดถูกเก็บก่อน)
   *
   * ดึงสองแบบ (กติกาเต็มอยู่ที่ `intentVerdict`): พ้นเวลาผ่อนผันแล้ว หรือไม่เคยถูกใช้
   * และหมดอายุเกินระยะเผื่อ — แบบหลังเก็บได้ตั้งแต่วันที่หมดอายุ ไม่ต้องรออีกวัน
   */
  const intents = await db.query.uploadIntent.findMany({
    columns: {
      id: true,
      bucket: true,
      key: true,
      uploadId: true,
      expiresAt: true,
      createdAt: true,
      consumedAt: true,
    },
    where: or(
      lt(schema.uploadIntent.createdAt, cutoff),
      and(
        isNull(schema.uploadIntent.consumedAt),
        lt(schema.uploadIntent.expiresAt, new Date(now - INTENT_EXPIRY_MARGIN_MS)),
      ),
    ),
    orderBy: [asc(schema.uploadIntent.createdAt)],
    limit: 500,
  });

  for (const intent of intents) {
    const verdict = intentVerdict(intent, stillReferenced, now);
    if (verdict === "keep") continue;
    try {
      if (!dryRun && verdict === "purge") {
        const bucket = intent.bucket === "private" ? "private" : "public";
        // multipart ที่ค้างครึ่งทางไม่ใช่ object — ลบ key อย่างเดียวไม่หาย ต้องยกเลิก upload ด้วย
        if (bucket === "private" && intent.uploadId) {
          await abortPrivateMultipart(intent.key, intent.uploadId);
        }
        await deleteObjects(bucket, [intent.key]);
      }
      if (!dryRun) {
        // ลบไฟล์ก่อน แล้วค่อยลบแถว — พังกลางทางแล้วยังเหลือแถวไว้ให้รอบหน้าตามเก็บ
        await db.delete(schema.uploadIntent).where(eq(schema.uploadIntent.id, intent.id));
      }
      report.intentsCleared += 1;
      if (verdict === "purge") report.abandonedUploadsDeleted += 1;
    } catch (err) {
      report.errors.push(`intent ${intent.id}: ${String(err).slice(0, 120)}`);
    }
  }

  /* ── 3. ไฟล์ในถังสาธารณะที่ไม่มีแถวไหนชี้ถึงเลย ────────────────────── */

  let cursor: string | undefined;
  do {
    const page = await listObjects("public", cursor);
    cursor = page.cursor;

    for (const obj of page.objects) {
      const blob = { pathname: obj.key, uploadedAt: obj.lastModified };
      report.scanned += 1;
      if (stillReferenced.has(blob.pathname)) {
        report.keptReferenced += 1;
        continue;
      }
      if (!isStray(blob, stillReferenced, now)) {
        report.keptTooRecent += 1;
        continue;
      }
      try {
        if (!dryRun) await deleteObjects("public", [blob.pathname]);
        report.strayBlobsDeleted += 1;
      } catch (err) {
        report.errors.push(`object ${blob.pathname}: ${String(err).slice(0, 120)}`);
      }
    }
  } while (cursor);

  return report;
}

/**
 * รอบที่ 1 — ลบแถว orphan ที่พ้นเวลาผ่อนผัน พร้อมไฟล์ของมันในถังสาธารณะ
 *
 * แยกออกมาเป็นฟังก์ชันให้สคริปต์ตรวจบนเครื่องเรียกได้โดยจำกัดด้วย `onlyIds`
 * (เครื่อง dev ต่อ DB กับถังตัวเดียวกับ production — รันทั้งระบบไม่ได้)
 * cron เรียกโดยไม่ส่ง `onlyIds` เสมอ
 *
 * ลำดับ: **ลบแถวแบบมีเงื่อนไขก่อน แล้วค่อยลบไฟล์**
 * เดิมลบไฟล์ก่อนแล้วค่อยลบแถวด้วย id เปล่า ๆ — ระหว่างสองคำสั่งนั้นครีเอเตอร์อาจกดผูกแถวนี้
 * (อัปแล้วยังไม่ทันผูก 24 ชม. หรือตั้งรูปเดิมกลับมา) ไฟล์หายไปแล้วแต่แถวถูกผูกเป็นรูปหน้าร้าน
 * ตอนนี้ delete ตรวจ `dueOrphanSql` ซ้ำในคำสั่งเดียวกัน (compare-and-set): ยังเป็น orphan
 * ยังพ้นเวลาผ่อนผัน และไม่มีใครอ้างถึง ถึงจะลบ — ไม่ผ่านก็ไม่แตะไฟล์
 *
 * ⚠️ ลบไฟล์ไม่สำเร็จหลังลบแถวแล้ว ไม่ทำให้ไฟล์ค้างถาวร: ไฟล์นั้นเก่ากว่าเวลาผ่อนผันแน่นอน
 * (อัปก่อน `created_at`/`orphaned_at` ซึ่งพ้น 24 ชม. แล้ว) และไม่มีแถวชี้ถึง
 * รอบที่ 3 ในการรันเดียวกันจึงเห็นเป็นไฟล์กำพร้าและลบให้เอง
 */
export async function sweepOrphanRows(opts: {
  dryRun: boolean;
  now: number;
  report: CleanupReport;
  /** จำกัดเฉพาะแถวเหล่านี้ — สำหรับสคริปต์ตรวจกับข้อมูลทดสอบเท่านั้น */
  onlyIds?: string[];
}): Promise<void> {
  const { dryRun, now, report, onlyIds } = opts;
  const cutoff = new Date(now - GRACE_MS);
  const db = getDb();

  /**
   * ⚠️ อ่านชุดไฟล์ที่ยังมีคนใช้ **ก่อน** ลบอะไรในรอบนี้
   *
   * เดิมสร้างชุดนี้หลังรอบแรกไปแล้ว รอบแรกจึงลบไฟล์โดยดูแค่ "แถวนี้เป็น orphan"
   * ซึ่งเปิดช่องให้ทำลายของคนอื่นได้จริง: `registerMedia()` เชื่อ `url` ที่ client
   * ส่งมาตรง ๆ ใครก็เอา URL รูปแบนเนอร์ของร้านอื่น (ซึ่งอยู่ใน `<img src>` บนหน้าร้าน
   * สาธารณะ) มาลงทะเบียนเป็นของตัวเองได้ แล้วปล่อยค้างไว้ ๒๔ ชั่วโมง
   * cron จะลบ **ไฟล์จริงของเหยื่อ** ทิ้ง เหลือแถวของเหยื่อชี้ไปยัง URL ที่ตายแล้ว
   *
   * กฎที่ปิดช่องนี้: ไฟล์ที่มีแถวอื่นชี้ถึงอยู่ ห้ามลบ ไม่ว่าแถวที่กำลังเก็บกวาด
   * จะบอกว่าอะไร — ลบแค่แถวทิ้งพอ
   */
  const allRows = await db.query.media.findMany({
    columns: { id: true, pathname: true, posterPathname: true, status: true },
  });
  const referenced = referencedPaths(allRows.filter((r) => r.status !== "orphan"));

  /**
   * เรียงเก่าสุดก่อน และกรองถังสาธารณะตั้งแต่ใน SQL — เดิมดึงแถว orphan ทุกถังมา 500 แถว
   * โดยไม่เรียง แล้วค่อยข้ามถังส่วนตัวในลูป ไฟล์ส่งมอบที่ค้างเยอะ ๆ จึงเบียดจนแถวสาธารณะไม่ถูกเก็บ
   */
  if (onlyIds && onlyIds.length === 0) return;
  const scope = onlyIds
    ? sql` and m.id in (${sql.join(onlyIds.map((id) => sql`${id}`), sql`, `)})`
    : sql``;

  /**
   * คืนสถานะแถวที่ถูกปลดผิด ๆ ก่อนเลือกแถวที่จะลบ — ไม่งั้นมันถูกข้ามเงียบ ๆ ทุกรอบ (SELECT กรองแถวที่ยังใช้อยู่ทิ้ง
   * ตั้งแต่ใน SQL ไม่ถูกนับแม้แต่ใน `orphanRowsKeptInUse`) แล้ววันที่เลิกใช้ก็ถูกลบทันทีด้วย `orphaned_at` เก่า
   * dry run ไม่เขียน — แค่นับ
   */
  try {
    if (dryRun) {
      const found = await db.execute(sql`
        select count(*)::int as n from media m
         where m.status = 'orphan' and m.access = 'public'
           and ${mediaReferencedSql(sql`m.id`)}${scope}
      `);
      report.orphanRowsRelinked += Number((found.rows as Array<{ n: number }>)[0]?.n ?? 0);
    } else {
      report.orphanRowsRelinked += affectedRows(await db.execute(relinkReferencedOrphansSql(scope)));
    }
  } catch (err) {
    // คืนสถานะไม่ได้ไม่ทำให้ลบผิด — delete ข้างล่างตรวจ `mediaReferencedSql` ซ้ำเองอยู่แล้ว
    report.errors.push(`relink: ${String(err).slice(0, 120)}`);
  }
  const result = await db.execute(sql`
    select m.id, m.pathname, m.poster_pathname, m.status, m.access, m.created_at, m.orphaned_at
      from media m
     where ${dueOrphanSql(cutoff)}${scope}
     order by coalesce(m.orphaned_at, m.created_at)
     limit 500
  `);
  const stale = (result.rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    pathname: String(r.pathname),
    posterPathname: r.poster_pathname == null ? null : String(r.poster_pathname),
    status: String(r.status),
    access: String(r.access),
    // neon-http อาจคืน timestamptz เป็นสตริงหรือ Date แล้วแต่การตั้งค่า — แปลงเองให้แน่
    createdAt: new Date(r.created_at as string | Date),
    orphanedAt: r.orphaned_at == null ? null : new Date(r.orphaned_at as string | Date),
  }));

  for (const row of stale) {
    // ยืนยันซ้ำด้วยกฎล้วนที่มีเทสต์ — SQL กับกฎต้องเห็นตรงกันถึงจะลบ
    if (!isOrphanDue(row, now)) continue;

    /**
     * ไฟล์นี้มีแถวที่ใช้งานอยู่จริงชี้ถึงไหม — ถ้ามี ลบแค่แถวขยะ ห้ามแตะไฟล์
     * นี่คือด่านที่กันไม่ให้ใครใช้ cron ตัวนี้เป็นเครื่องมือลบของคนอื่น
     */
    const stillUsed =
      (row.pathname && referenced.has(row.pathname)) ||
      (row.posterPathname && referenced.has(row.posterPathname));

    if (dryRun) {
      report.orphanRowsDeleted += 1;
      continue;
    }
    try {
      const deleted = await db.execute(
        sql`delete from media m where m.id = ${row.id} and ${dueOrphanSql(cutoff)} returning m.id`,
      );
      if (affectedRows(deleted) === 0) {
        // ถูกผูกกลับหรือถูกอ้างถึงระหว่างทาง — ไฟล์นี้มีคนใช้ ห้ามแตะ
        report.orphanRowsKeptInUse += 1;
        continue;
      }
      report.orphanRowsDeleted += 1;
      if (!stillUsed) {
        await deleteObjects("public", [row.pathname, ...(row.posterPathname ? [row.posterPathname] : [])]);
      }
    } catch (err) {
      report.errors.push(`row ${row.id}: ${String(err).slice(0, 120)}`);
    }
  }
}

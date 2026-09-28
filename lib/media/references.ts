import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";

/**
 * "แถว media นี้ยังมีใครใช้อยู่ไหม" — ตัวตัดสินเดียวของทั้งการปลดเป็น orphan และการลบจริง
 *
 * ทุกคอลัมน์ที่ชี้ไป `media.id` ต้องอยู่ในนี้ครบ (grep `media.id` / `media_ids` ใน lib/db/schema):
 *   creator_page.avatar_media_id, creator_page.banner_media_id — รูปหน้าร้าน
 *   service.cover_media_id        — ปกเมนู **เฉพาะเมนูที่ยังไม่ถูกลบ**
 *   service_tier.preview_media_id — ยังไม่มีหน้าจอไหนเขียน แต่ schema เปิดไว้ ใส่ไว้ก่อนดีกว่าลืม
 *                                   (เฉพาะแพ็กของเมนูที่ยังไม่ถูกลบ เหตุผลเดียวกับปก)
 *
 * ⚠️ เมนูที่ soft delete แล้ว (`service.deleted_at`) ไม่นับเป็นผู้ใช้ — ไม่มีที่ไหนแสดงปกของมันอีก:
 * ทุกคิวรีที่โหลด `cover`/`preview` กรอง `deleted_at is null` (lib/queries/creator.ts) หน้าออเดอร์
 * โหลดแค่ชื่อ/slug/จำนวนวันของเมนู ไม่โหลดปก และไม่มีทางกู้เมนูที่ลบแล้วกลับมา
 * เดิมนับรวม ปกของเมนูที่ลบไปค้างเป็น linked ตลอดไป กินโควตาและไม่มีวันถูกเก็บกวาด
 * ถ้าวันหนึ่งมีหน้าที่แสดงปกของเมนูที่ลบแล้ว (เช่นประวัติออเดอร์โชว์ปก) ต้องเอาเงื่อนไขนี้ออกก่อน
 * ไม่งั้นรูปในหน้านั้นหายหลังเวลาผ่อนผัน — แถว media ถูกลบแล้ว FK `set null` ปกเป็นว่าง
 *   portfolio_item.media_id       — ผลงาน
 *   payment_record.proof_media_id — สลิป
 *   delivery.media_ids, message.attachment_media_ids — jsonb อาร์เรย์ของ id
 *
 * ไม่นับ `delivery_issuance.media_id` — เป็นบันทึกว่าเคยออก URL ให้ใคร ไม่ใช่ที่ที่แสดงไฟล์
 *
 * ⚠️ เพิ่มคอลัมน์ที่ชี้ `media.id` ใหม่เมื่อไร ต้องมาเพิ่มที่นี่ด้วย ไม่งั้นไฟล์ที่ยังใช้อยู่
 * จะถูกปลดเป็น orphan และถูกลบทิ้งหลังเวลาผ่อนผัน — ลบผิดคือรูปหายถาวร
 *
 * jsonb ใช้ `in (select jsonb_array_elements_text …)` แทน `@>` ต่อแถว — ซับคิวรีไม่ผูกกับ
 * แถวนอก Postgres จึงคำนวณครั้งเดียวต่อคำสั่ง (hashed subplan) ไม่ต้องไล่ทั้งตารางซ้ำทุกแถว
 * ถ้ามีสมาชิกเป็น JSON null ผล `in` จะเป็น null แล้วทั้งก้อนตกไปฝั่ง "ไม่ปลด / ไม่ลบ" ซึ่งปลอดภัย
 *
 * @param id นิพจน์ SQL ของ id แถว media ที่กำลังพิจารณา (เช่น sql`m.id`)
 */
export function mediaReferencedSql(id: SQL): SQL {
  return sql`(
    exists (select 1 from creator_page p where p.avatar_media_id = ${id} or p.banner_media_id = ${id})
    or exists (select 1 from service s where s.cover_media_id = ${id} and s.deleted_at is null)
    or exists (
      select 1 from service_tier t join service ts on ts.id = t.service_id
      where t.preview_media_id = ${id} and ts.deleted_at is null
    )
    or exists (select 1 from portfolio_item i where i.media_id = ${id})
    or exists (select 1 from payment_record r where r.proof_media_id = ${id})
    or ${id} in (select jsonb_array_elements_text(d.media_ids) from delivery d)
    or ${id} in (select jsonb_array_elements_text(x.attachment_media_ids) from message x)
  )`;
}

/**
 * ปลดไฟล์สาธารณะของเจ้าของคนนี้ที่ไม่มีใครใช้แล้วกลับเป็น orphan — ใส่ต่อท้ายใน `db.batch()`
 * **หลัง** คำสั่งที่ปลดการอ้างถึง (เปลี่ยนรูป ลบผลงาน) เพื่อให้เห็นผลของคำสั่งนั้นในทรานแซกชันเดียวกัน
 *
 * เดิมเปลี่ยนอวาตาร์/แบนเนอร์/ปกเมนู หรือลบผลงาน แล้วแถวเก่ายังเป็น linked ตลอดไป:
 * ไฟล์ค้างในถัง นับเข้าโควตา และงานเก็บกวาดไม่มีวันแตะ
 *
 * กวาดทั้งเจ้าของ ไม่ใช่แค่ id ที่เพิ่งถูกปลด —
 *   - ไม่ต้องอ่าน id เก่าก่อนเขียน (อ่านแล้วค่อยเขียนคือช่องให้สองคำขอแทรกกัน)
 *   - แถวที่รั่วไว้ก่อนมีโค้ดนี้ของคนเดียวกันถูกเก็บไปด้วยในการเปลี่ยนครั้งถัดไป
 *
 * ⚠️ แตะเฉพาะ `access = 'public'` — ไฟล์ในถังส่วนตัว (ส่งมอบ สลิป) ห้ามถูกปลดด้วยทางนี้เด็ดขาด
 * ไฟล์ที่ลูกค้าจ่ายเงินแล้วหายคือกู้คืนไม่ได้ (เหตุผลเดียวกับหัวไฟล์ lib/media/cleanup.ts)
 * และแตะเฉพาะ `status = 'linked'` — แถว orphan ที่เพิ่งอัป (`orphaned_at` ว่าง) ต้องคงนับเวลา
 * ผ่อนผันจาก `created_at` เหมือนเดิม
 *
 * ⚠️ **ทุก batch ที่เรียกตัวนี้ หรือผูกไฟล์สาธารณะเข้ากับอะไรก็ตาม ต้องเริ่มด้วย `lockStorage(เจ้าของ)`**
 * สองคำขอที่วิ่งพร้อมกัน (เช่นตั้งรูป Y เป็นปกเมนูขณะเปลี่ยนอวาตาร์ออกจาก Y) — UPDATE ของตัวนี้รอ lock
 * แถว Y แล้วเช็ค WHERE ซ้ำกับแถวใหม่ แต่ซับคิวรี `not exists` ยังใช้ snapshot ตอนเริ่มคำสั่ง
 * จึงไม่เห็นปกที่อีกคำขอเพิ่ง commit — Y กลายเป็น orphan (`orphaned_at` = ตอนนั้น) ทั้งที่เป็นปกอยู่
 * วันที่ปกเปลี่ยนจริง Y ไม่ถูกประทับเวลาใหม่ (ตัวนี้แตะแค่ linked) งานเก็บกวาดลบทันทีไม่รอ 24 ชม.
 * ล็อกของเจ้าของก่อน = batch ของคนเดียวกันเรียงกัน คำสั่งใน batch หลังเริ่มหลังอีกอันจบแล้วจึงเห็นผลครบ
 * แถวที่เคยพังไปแล้ว `sweepOrphanRows` คืนสถานะให้ (`relinkReferencedOrphansSql`)
 * และงานเก็บกวาดยังตรวจ `mediaReferencedSql` ซ้ำในคำสั่ง delete เอง — แถวที่ยังถูกใช้ไม่มีวันถูกลบ
 */
export function orphanUnreferenced(ownerUserId: string) {
  return getDb().execute(sql`
    update media m
       set status = 'orphan', orphaned_at = now()
     where m.owner_user_id = ${ownerUserId}
       and m.status = 'linked'
       and m.access = 'public'
       and not ${mediaReferencedSql(sql`m.id`)}
    returning m.id
  `);
}

/**
 * เงื่อนไข "แถว orphan นี้ลบได้แล้ว" ในรูป SQL (alias `m`) — ใช้ทั้งตอนเลือกและในคำสั่ง delete
 *
 * ต้องตรงกับ `isOrphanDue` ใน lib/media/cleanup-rules.ts (ตัวนั้นมีเทสต์ ตัวนี้ทำงานจริง)
 * งานเก็บกวาดเช็คทั้งสองทาง: SQL เลือก/ลบ และฟังก์ชันล้วนยืนยันซ้ำก่อนลบไฟล์
 */
export function dueOrphanSql(cutoff: Date): SQL {
  return sql`(
    m.status = 'orphan'
    and m.access = 'public'
    and coalesce(m.orphaned_at, m.created_at) < ${cutoff.toISOString()}::timestamptz
    and not ${mediaReferencedSql(sql`m.id`)}
  )`;
}

/**
 * คืนสถานะแถวสาธารณะที่ถูกปลดเป็น orphan ทั้งที่ยังมีคนใช้อยู่ — กลับเป็น linked และล้าง `orphaned_at`
 *
 * แถวแบบนี้เกิดจากการแข่งที่ `orphanUnreferenced` อธิบายไว้ (ก่อนมี `lockStorage` ในทุก batch) ถ้าไม่คืน
 * มันค้างเป็น orphan ที่มี `orphaned_at` เก่า งานเก็บกวาดข้ามไปเงียบ ๆ ตราบที่ยังถูกใช้ แล้ววันที่เลิกใช้
 * ก็ถูกลบทันทีโดยไม่มีเวลาผ่อนผัน (`orphanUnreferenced` ไม่ประทับเวลาใหม่ให้แถวที่ไม่ใช่ linked)
 * คืนเป็น linked แล้ว การเลิกใช้ครั้งถัดไปจะเดินทางปกติ: linked → orphan พร้อมเวลาใหม่
 *
 * รวมแถว `orphaned_at` ว่าง (อัปแล้วถูกผูกโดยไม่ได้ตั้ง linked) ด้วย — เลิกใช้เมื่อไรก็โดนลบทันทีเหมือนกัน
 * เพราะเวลาผ่อนผันนับจาก `created_at` ที่เก่าไปนานแล้ว
 * ⚠️ แตะเฉพาะ public เหมือน `orphanUnreferenced` — ไฟล์ส่วนตัวใช้ `orphan` เป็นสถานะ "ไฟล์ค้าง" ของการส่งมอบ
 *
 * @param scope เงื่อนไขเพิ่ม (alias `m`) — สคริปต์ตรวจจำกัดเฉพาะแถวทดสอบ
 */
export function relinkReferencedOrphansSql(scope: SQL = sql``): SQL {
  return sql`
    update media m
       set status = 'linked', orphaned_at = null
     where m.status = 'orphan'
       and m.access = 'public'
       and ${mediaReferencedSql(sql`m.id`)}${scope}
    returning m.id
  `;
}

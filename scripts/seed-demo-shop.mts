/**
 * สร้างร้านตัวอย่าง @nongfah ขึ้นใน DB จริง
 *
 * ทำไมต้องมี: ปุ่ม "ดูตัวอย่างหน้าร้าน" บนหน้าแรกชี้ไป `/nongfah` มาตั้งแต่ตอนทำ prototype
 * ตอนหน้าร้านยังอ่านจาก lib/mock/data.ts มันเปิดได้ พอ Phase 1a เปลี่ยนไปอ่าน DB จริง
 * ลิงก์นั้นก็ตายทันทีเพราะไม่มีใครถือ handle นี้ — สคริปต์นี้ทำให้กลับมามีอยู่จริง
 *
 * อ่านจาก lib/mock/data.ts โดยตรง เพื่อไม่ให้มีคำบรรยายร้านสองชุดที่ต้องคอยแก้ให้ตรงกัน
 *
 * ข้อมูลที่ "ต้องมีออเดอร์จริงถึงจะมี" (เรตติ้ง รีวิว จำนวนงานที่เสร็จ) ไม่ถูก seed
 * หน้าร้านจริงไม่แสดงตัวเลขพวกนี้อยู่แล้วถ้าไม่มีข้อมูล — ตั้งใจไม่ปั้นตัวเลขปลอม
 *
 * ⚠️ dev/staging tool — ลบด้วย `pnpm db:seed-demo --clean`
 */
import { neon } from "@neondatabase/serverless";

/**
 * อีเมลของบัญชีร้านตัวอย่าง — ตั้งผ่าน DEMO_SHOP_EMAIL ได้
 * ถ้าใส่อีเมล Google จริง จะล็อกอินเข้าบัญชีนี้เพื่อทดสอบฝั่งครีเอเตอร์ได้เลย
 * (Better Auth ผูก account เข้ากับ user ที่อีเมลตรงกัน)
 * ไม่ hardcode ไว้ในไฟล์เพราะเป็นอีเมลส่วนตัวและไฟล์นี้เข้า git
 */
import { creator, portfolio, services } from "@/lib/mock/data";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ต้องมี DATABASE_URL");
  process.exit(1);
}
const sql = neon(url);

const DEMO_EMAIL = process.env.DEMO_SHOP_EMAIL || "demo@com-mi.local";

const USER_ID = "demo_user_nongfah";
const PAGE_ID = "demo_page_nongfah";
const P = "demo_"; // prefix ของทุกแถวที่สคริปต์นี้สร้าง — ใช้ตอนลบ

if (process.argv.includes("--clean")) {
  // media/service/portfolio ผูก cascade กับ user กับ page อยู่แล้ว ลบต้นทางพอ
  await sql`delete from "user" where id = ${USER_ID}`;
  console.log("ลบร้านตัวอย่างแล้ว");
  process.exit(0);
}

await sql`
  insert into "user" (id, name, email, email_verified, handle, plan, role)
  values (${USER_ID}, ${creator.displayName}, ${DEMO_EMAIL}, true, ${creator.handle}, 'free', 'user')
  on conflict (id) do update set name = excluded.name, handle = excluded.handle, email = excluded.email
`;

await sql`
  insert into creator_page (
    id, user_id, display_name, tagline, about, status, status_note,
    slots_total, tos, is_published, socials, is_demo
  ) values (
    ${PAGE_ID}, ${USER_ID}, ${creator.displayName}, ${creator.tagline}, ${creator.about},
    ${creator.status}, '', ${creator.slotsTotal}, ${JSON.stringify(creator.tos)}::jsonb,
    true, ${JSON.stringify(creator.socials)}::jsonb, true
  )
  on conflict (id) do update set
    display_name = excluded.display_name, tagline = excluded.tagline,
    about = excluded.about, status = excluded.status, tos = excluded.tos,
    is_published = true, socials = excluded.socials, is_demo = true
`;

// เริ่มใหม่ทุกครั้งเพื่อให้ผลลัพธ์เหมือนเดิมเสมอไม่ว่ารันกี่รอบ
await sql`delete from service where creator_page_id = ${PAGE_ID}`;
await sql`delete from portfolio_item where creator_page_id = ${PAGE_ID}`;
await sql`delete from media where owner_user_id = ${USER_ID}`;

for (const [i, s] of services.entries()) {
  const id = P + s.id;
  await sql`
    insert into service (
      id, creator_page_id, slug, title, description, kind, mode,
      base_price_cents, delivery_days, revisions_included, includes, is_active, sort_order
    ) values (
      ${id}, ${PAGE_ID}, ${s.slug}, ${s.title}, ${s.description}, ${s.kind}, ${s.mode},
      ${s.basePriceCents}, ${s.deliveryDays}, ${s.revisionsIncluded},
      ${JSON.stringify(s.includes)}::jsonb, true, ${i}
    )
  `;

  // id ของ tier/option ในข้อมูลจำลองใช้ซ้ำข้ามเมนู (t_sketch โผล่หลายเมนู)
  // จึงต้องผูกกับ id ของเมนูด้วย ไม่งั้นชน primary key
  for (const [j, t] of s.tiers.entries()) {
    await sql`
      insert into service_tier (id, service_id, label, price_delta_cents, sort_order)
      values (${id + "_" + t.id}, ${id}, ${t.label}, ${t.priceDeltaCents}, ${j})
    `;
  }
  for (const [j, o] of s.options.entries()) {
    await sql`
      insert into service_option (
        id, service_id, group_label, label, price_delta_cents, input_type, max_quantity, sort_order
      ) values (
        ${id + "_" + o.id}, ${id}, ${o.groupLabel}, ${o.label}, ${o.priceDeltaCents},
        ${o.inputType}, ${o.maxQuantity ?? null}, ${j}
      )
    `;
  }
}

/**
 * ผลงานยังไม่มีไฟล์จริง — สร้างแถว media ที่ url ว่างไว้
 *
 * ArtImage ถือว่า src ที่เป็นค่าว่าง = "ยังไม่ได้อัปโหลด" แล้ววาด gradient จาก seed แทน
 * (ดูคอมเมนต์ prop `src` ใน components/art-image.tsx) จึงได้ภาพเดียวกับตอนเป็น prototype
 * bytes เป็น 0 โควตาพื้นที่จึงไม่เพี้ยน
 */
for (const [i, p] of portfolio.entries()) {
  const mediaId = P + "med_" + p.id;
  await sql`
    insert into media (id, owner_user_id, pathname, url, access, kind, content_type, bytes, status)
    values (${mediaId}, ${USER_ID}, ${"demo/" + p.seed}, '', 'public', 'portfolio', 'image/webp', 0, 'linked')
  `;

  const linked = p.linkedServiceSlug
    ? (services.find((s) => s.slug === p.linkedServiceSlug)?.id ?? null)
    : null;

  await sql`
    insert into portfolio_item (id, creator_page_id, media_id, title, tags, linked_service_id, sort_order)
    values (
      ${P + p.id}, ${PAGE_ID}, ${mediaId}, ${p.title},
      ${JSON.stringify(p.tags ?? [])}::jsonb, ${linked ? P + linked : null}, ${i}
    )
  `;
}

console.log(`สร้างร้านตัวอย่าง @${creator.handle} แล้ว`);
console.log(`  เมนู ${services.length} รายการ · ผลงาน ${portfolio.length} ชิ้น`);
console.log(`  เปิดดูที่ /${creator.handle}`);

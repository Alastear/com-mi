/**
 * สร้างออเดอร์ตัวอย่างครบทุกสถานะสำหรับทดสอบบอร์ด
 *
 * เขียนสถานะลงตรง ๆ ไม่ผ่าน state machine โดยตั้งใจ — นี่คือ fixture ไม่ใช่ flow จริง
 * (flow จริงทดสอบผ่านเบราว์เซอร์ที่ /[handle]/s/[slug])
 *
 * ⚠️ เครื่องมือ dev เท่านั้น — ลบทิ้งด้วย `pnpm db:seed-orders --clean`
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ต้องมี DATABASE_URL");
  process.exit(1);
}
const sql = neon(url);

const PREFIX = "seed_ord_";

if (process.argv.includes("--clean")) {
  const del = await sql`delete from "order" where id like ${PREFIX + "%"} returning id`;
  console.log(`ลบออเดอร์ตัวอย่างแล้ว ${(del as unknown[]).length} รายการ`);
  process.exit(0);
}

const page = (await sql`select id from creator_page limit 1`)[0] as { id: string } | undefined;
const client = (
  await sql`select id from "user" where email like 'e2e-%' order by id desc limit 1`
)[0] as { id: string } | undefined;
const services = (await sql`
  select id, title, base_price_cents, delivery_days, revisions_included
  from service where deleted_at is null order by sort_order limit 4
`) as { id: string; title: string; base_price_cents: number; delivery_days: number; revisions_included: number }[];

if (!page || !client || services.length === 0) {
  console.error("ต้องมีหน้าร้าน ผู้ใช้ทดสอบ และเมนูอย่างน้อยหนึ่งรายการก่อน");
  console.error("รัน: pnpm db:seed-session --no-handle");
  process.exit(1);
}

/** ตัวอักษรชุดเดียวกับ lib/orders/code.ts — ตัด 0 O 1 I L ที่อ่านสับสน */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const code = (n: number) =>
  "SEED" + Array.from({ length: 4 }, (_, i) => ALPHABET[(n * 7 + i * 11) % ALPHABET.length]).join("");

const DAY = 86_400_000;

/** ครอบทั้งคอลัมน์บนบอร์ดและสถานะปลายทาง เพื่อให้เห็นทุกกรณีตอนตรวจ UI */
const FIXTURES = [
  { status: "requested", ageDays: 0, paidRatio: 0 },
  { status: "requested", ageDays: 2, paidRatio: 0 },
  { status: "quoted", ageDays: 3, paidRatio: 0 },
  { status: "in_progress", ageDays: 5, paidRatio: 0.5 },
  { status: "in_progress", ageDays: 12, paidRatio: 0.5 }, // เลยกำหนด — ต้องเห็นเป็นสีเตือน
  { status: "in_review", ageDays: 8, paidRatio: 0.5 },
  { status: "delivered", ageDays: 10, paidRatio: 1 },
  { status: "completed", ageDays: 20, paidRatio: 1 },
  { status: "cancelled", ageDays: 15, paidRatio: 0 },
];

let made = 0;
for (const [i, f] of FIXTURES.entries()) {
  const svc = services[i % services.length]!;
  const id = `${PREFIX}${String(i).padStart(2, "0")}`;
  const created = new Date(Date.now() - f.ageDays * DAY);
  const due = new Date(created.getTime() + svc.delivery_days * DAY);
  const total = svc.base_price_cents;

  await sql`
    insert into "order" (
      id, code, creator_page_id, client_user_id, service_id, status,
      currency, subtotal_cents, addons_cents, total_cents, amount_paid_cents,
      revisions_allowed, tos_snapshot, accepted_tos_at, due_at,
      is_public_in_queue, private_note, created_at, updated_at, completed_at
    ) values (
      ${id}, ${code(i)}, ${page.id}, ${client.id}, ${svc.id}, ${f.status},
      'THB', ${total}, 0, ${total}, ${Math.round(total * f.paidRatio)},
      ${svc.revisions_included}, '[]'::jsonb, ${created.toISOString()}, ${due.toISOString()},
      true, ${i === 3 ? "ลูกค้าประจำ ให้ส่วนลดรอบหน้าได้" : ""},
      ${created.toISOString()}, ${created.toISOString()},
      ${f.status === "completed" ? created.toISOString() : null}
    )
    on conflict (id) do update set status = excluded.status, updated_at = excluded.updated_at
  `;

  await sql`delete from order_item where order_id = ${id}`;
  await sql`
    insert into order_item (id, order_id, label, kind, unit_price_cents, quantity, sort_order)
    values (${id + "_base"}, ${id}, ${svc.title}, 'base', ${total}, 1, 0)
  `;

  await sql`delete from message where order_id = ${id}`;
  await sql`
    insert into message (id, order_id, sender_user_id, is_system_event, event_type, created_at)
    values (${id + "_evt"}, ${id}, ${client.id}, true, 'order_created', ${created.toISOString()})
  `;
  made++;
}

console.log(`สร้างออเดอร์ตัวอย่าง ${made} รายการ`);
console.log(
  "สถานะ:",
  [...new Set(FIXTURES.map((f) => f.status))].join(", "),
);

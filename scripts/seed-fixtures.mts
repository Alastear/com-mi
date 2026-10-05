import { neon } from "@neondatabase/serverless";
import { fixtureManifest } from "../lib/environment/fixture-manifest";
import { requireFixtureEnvironment } from "./fixture-environment.mjs";

// Both create and clean must pass preflight before constructing a client.
const { env, args } = await requireFixtureEnvironment();
const [mode, runId, ...extra] = args;
if (!["create", "clean", "manifest"].includes(mode) || !runId || extra.length) {
  console.error("Usage: seed-fixtures.mts create|clean|manifest <run-id> --target-env <file> --production-env <file>");
  process.exit(1);
}
try {
  const manifest = fixtureManifest(runId);
  if (mode === "manifest") {
    console.log(JSON.stringify(manifest, null, 2));
    process.exit(0);
  }
  const sql = neon(env.DATABASE_URL!);
  const userIds = manifest.users.map(u => u.id);
  const shopIds = manifest.shops.map(s => s.id);
  const serviceIds = manifest.services.map(s => s.id);
  const orderIds = manifest.orders.map(o => o.id);
  const queries = [
    sql.query("SET LOCAL lock_timeout = '5s'"),
    sql.query("SET LOCAL statement_timeout = '30s'"),
    // Serialize fixture changes and prevent concurrent writes from changing the checked graph.
    sql.query('LOCK TABLE "user", creator_page, service, "order", order_item, message, media, upload_intent IN SHARE ROW EXCLUSIVE MODE'),
  ];
  for (const user of manifest.users) queries.push(sql`
    select 1 / case when exists(select 1 from "user" where id = ${user.id} and email <> ${user.email}) then 0 else 1 end`);
  for (const shop of manifest.shops) queries.push(sql`
    select 1 / case when exists(select 1 from creator_page where id = ${shop.id} and (user_id <> ${shop.userId} or not is_demo)) then 0 else 1 end`);
  for (const service of manifest.services) queries.push(sql`
    select 1 / case when exists(select 1 from service where id = ${service.id} and creator_page_id <> ${service.shopId}) then 0 else 1 end`);
  for (const order of manifest.orders) queries.push(sql`
    select 1 / case when exists(select 1 from "order" where id = ${order.id}
      and (creator_page_id <> ${order.shopId} or client_user_id <> ${order.clientId} or service_id is distinct from ${order.serviceId})) then 0 else 1 end`);
  for (const order of manifest.orders) queries.push(sql`
    select 1 / case when
      exists(select 1 from order_item where id = ${order.itemId} and order_id <> ${order.id}) or
      exists(select 1 from message where id = ${order.messageId} and order_id <> ${order.id})
      then 0 else 1 end`);
  if (mode === "clean") {
    // Refuse expanded graphs or uploaded objects; cleaning those requires their lifecycle, not a cascade.
    queries.push(sql`select 1 / case when
      exists(select 1 from creator_page where user_id = any(${userIds}::text[]) and not(id = any(${shopIds}::text[]))) or
      exists(select 1 from service where creator_page_id = any(${shopIds}::text[]) and not(id = any(${serviceIds}::text[]))) or
      exists(select 1 from "order" where (creator_page_id = any(${shopIds}::text[]) or client_user_id = any(${userIds}::text[]) or service_id = any(${serviceIds}::text[])) and not(id = any(${orderIds}::text[]))) or
      exists(select 1 from media where owner_user_id = any(${userIds}::text[]) or order_id = any(${orderIds}::text[])) or
      exists(select 1 from upload_intent where user_id = any(${userIds}::text[]) or order_id = any(${orderIds}::text[])) or
      exists(select 1 from message where sender_user_id = any(${userIds}::text[]) and not(order_id = any(${orderIds}::text[])))
      then 0 else 1 end`);
    queries.push(sql`delete from "order" where id = any(${orderIds}::text[])`);
    queries.push(sql`delete from service where id = any(${serviceIds}::text[])`);
    queries.push(sql`delete from creator_page where id = any(${shopIds}::text[])`);
    queries.push(sql`delete from "user" where id = any(${userIds}::text[])`);
  } else {
    for (const user of manifest.users) queries.push(sql`
      insert into "user" (id,name,email,email_verified,handle,locale)
      values (${user.id},${user.name},${user.email},true,${user.handle},${user.locale}) on conflict(id) do nothing`);
    for (const shop of manifest.shops) queries.push(sql`
      insert into creator_page(id,user_id,display_name,is_demo,is_published)
      values (${shop.id},${shop.userId},${shop.name},true,false) on conflict(id) do nothing`);
    for (const service of manifest.services) queries.push(sql`
      insert into service(id,creator_page_id,slug,title,base_price_cents)
      values (${service.id},${service.shopId},'qa-illustration',${service.title},100000) on conflict(id) do nothing`);
    for (const order of manifest.orders) {
      queries.push(sql`insert into "order"(id,code,creator_page_id,client_user_id,service_id,status,subtotal_cents,total_cents,deposit_cents,is_public_in_queue)
        values (${order.id},${order.code},${order.shopId},${order.clientId},${order.serviceId},${order.status},100000,100000,0,false) on conflict(id) do nothing`);
      queries.push(sql`insert into order_item(id,order_id,label,kind,unit_price_cents)
        values (${order.itemId},${order.id},'QA illustration / ภาพวาดทดสอบ','base',100000) on conflict(id) do nothing`);
      queries.push(sql`insert into message(id,order_id,sender_user_id,body)
        values (${order.messageId},${order.id},${order.clientId},${"ข้อความทดสอบ / QA brief — ".repeat(40)}) on conflict(id) do nothing`);
    }
  }
  await sql.transaction(queries);
  console.log(JSON.stringify({ mode, ...manifest }, null, 2));
} catch {
  console.error("Fixture operation was not confirmed. The transaction may have committed if the response was lost; retry with the same run ID. Check schema, ownership and additional data/files before retrying.");
  process.exitCode = 1;
}

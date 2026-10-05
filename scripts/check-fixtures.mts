import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../lib/db/schema";
import { loadCapabilityContext } from "../lib/capabilities/context";
import { authorizeCapability, CapabilityAccessError } from "../lib/capabilities/authorize";
import { fixtureManifest } from "../lib/environment/fixture-manifest";
import { requireFixtureEnvironment } from "./fixture-environment.mjs";

const { env, args } = await requireFixtureEnvironment();
if (args.length !== 1) {
  console.error("Usage: check-fixtures.mts <run-id> --target-env <file> --production-env <file>");
  process.exit(1);
}
try {
  const manifest = fixtureManifest(args[0]);
  const sql = neon(env.DATABASE_URL!);
  const db = drizzle(sql, { schema, casing: "snake_case" });
  for (const shop of manifest.shops) {
    const owner = await loadCapabilityContext(db, shop.userId, shop.id);
    assert.equal(owner?.ownerUserId, shop.userId, "Fixture owner missing");
    for (const user of manifest.users.filter(u => u.id !== shop.userId)) {
      assert.equal(await loadCapabilityContext(db, user.id, shop.id), null, "Cross-shop context must be denied");
      await assert.rejects(authorizeCapability("crm", "write", () => loadCapabilityContext(db, user.id, shop.id)),
        error => error instanceof CapabilityAccessError && error.reason === "unauthorized");
    }
    await assert.rejects(authorizeCapability("crm", "write", () => loadCapabilityContext(db, shop.userId, shop.id)),
      error => error instanceof CapabilityAccessError && error.reason === "unavailable");
  }
  console.log("PASS actual capability context query: owners, cross-shop users and planned gate");
  for (const order of manifest.orders) {
    const rows = await sql`select creator_page_id,client_user_id,service_id from "order" where id = ${order.id}`;
    assert.equal(rows.length, 1, "Fixture order missing");
    assert.deepEqual(rows[0], { creator_page_id: order.shopId, client_user_id: order.clientId, service_id: order.serviceId });
  }
  console.log("PASS fixture order ownership graph");

  // Intentionally fail the second statement; the first insert must roll back.
  // UUID IDs ensure the probe never conflicts with an existing fixture or real user.
  const probe = `qa_rollback_${randomUUID()}`;
  const insert = () => sql`insert into "user"(id,name,email) values (${probe},'Rollback probe',${`${probe}@example.invalid`})`;
  let rejected = false;
  try { await sql.transaction([sql.query("SET LOCAL statement_timeout = '30s'"), insert(), insert()]); }
  catch (error) {
    // A network failure does not prove the database executed the rollback test.
    if (!(error && typeof error === "object" && "code" in error && error.code === "23505")) throw error;
    rejected = true;
  }
  assert.ok(rejected, "Expected unique constraint failure");
  assert.equal((await sql`select id from "user" where id = ${probe}`).length, 0, "Transaction rollback failed");
  console.log("PASS neon-http transaction rollback after unique constraint failure");
  console.log("Database checks passed. Authenticated browser, storage, concurrency and restore QA remain separate.");
} catch {
  console.error("Fixture verification failed. No success claim is made; check staging schema and fixture state. Error details are suppressed to avoid exposing connection or account data.");
  process.exitCode = 1;
}

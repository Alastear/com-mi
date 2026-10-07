import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import { rolloutMutationSql } from "../lib/capabilities/rollout-sql";
import { fixtureManifest } from "../lib/environment/fixture-manifest";
import { requireFixtureEnvironment } from "./fixture-environment.mjs";

const { env, args } = await requireFixtureEnvironment();
if (args.length !== 1) throw new Error("Expected a fixture run ID");
try {
  const fixture = fixtureManifest(args[0]);
  const db = neon(env.DATABASE_URL!);
  const actor = fixture.users[0];
  const shop = fixture.shops[0];
  const before = await db`select role from "user" where id = ${actor.id} and email = ${actor.email}`;
  assert.equal(before.length, 1);
  assert.equal(before[0].role, "user");
  assert.equal((await db`select 1 from capability_cohort where capability = 'crm' and creator_page_id = ${shop.id}`).length, 0);
  const dialect = new PgDialect();
  const ids = Array.from({ length: 3 }, () => `qa_audit_${randomUUID()}`);
  const input = { kind: "cohort" as const, capability: "crm" as const, creatorPageId: shop.id, cohort: "beta" as const, version: 0, reason: "Fixture transaction test" };
  const mutation = (id: string) => { const q = dialect.sqlToQuery(rolloutMutationSql(input, actor.id, id)); return db.query(q.sql, q.params); };
  const probe = `qa_rollback_${randomUUID()}`;
  const insert = () => db`insert into "user"(id,name,email) values(${probe},'Rollback probe',${`${probe}@example.invalid`})`;
  let rolledBack = false;
  try {
    await db.transaction([
      db.query("SET LOCAL statement_timeout = '30s'"),
      mutation(ids[0]), // non-admin cannot write or audit
      db`select 1 / case when exists(select 1 from capability_audit where id = ${ids[0]}) then 0 else 1 end`,
      // Fixture-only elevation, invisible outside this transaction and rolled back below.
      db`update "user" set role = 'admin' where id = ${actor.id} and email = ${actor.email}`,
      mutation(ids[1]),
      mutation(ids[2]), // stale version 0 cannot overwrite version 1 or append an audit
      db`select 1 / case when (select count(*) from capability_audit where id = any(${ids}::text[])) = 1
        and exists(select 1 from capability_audit where id = ${ids[1]} and actor_user_id = ${actor.id} and "before" is null and "after"->>'cohort' = 'beta')
        and exists(select 1 from capability_cohort where capability = 'crm' and creator_page_id = ${shop.id} and cohort = 'beta' and version = 1)
        then 1 else 0 end`,
      insert(), insert(),
    ]);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "23505")) throw error;
    rolledBack = true;
  }
  assert.ok(rolledBack);
  assert.equal((await db`select role from "user" where id = ${actor.id}`)[0].role, "user");
  assert.equal((await db`select 1 from capability_audit where id = any(${ids}::text[])`).length, 0);
  assert.equal((await db`select 1 from capability_cohort where capability = 'crm' and creator_page_id = ${shop.id}`).length, 0);
  assert.equal((await db`select 1 from "user" where id = ${probe}`).length, 0);
  console.log("PASS rollout: non-admin denial, atomic audit, stale update denial and full rollback including fixture role");
} catch (error) {
  console.error("Rollout fixture check failed:", error && typeof error === "object" && "code" in error ? error.code : "assertion-or-runtime-error");
  process.exitCode = 1;
}

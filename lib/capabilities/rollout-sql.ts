import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { RolloutInput } from "./rollout-policy";

/** Internal SQL shared by the authorized action and transaction tests. */
export function rolloutMutationSql(v: z.infer<typeof RolloutInput>, actorUserId: string, auditId: string) {
  // Only fixed server-selected identifiers are interpolated as SQL identifiers.
  const table = sql.identifier(v.kind === "release" ? "capability_rollout" : "capability_cohort");
  const column = sql.identifier(v.kind === "release" ? "status" : "cohort");
  const value = v.kind === "release" ? v.status : v.cohort;
  const target = v.kind === "release" ? "global" : v.creatorPageId;
  const key = v.kind === "release" ? sql`capability = ${v.capability}` : sql`capability = ${v.capability} and creator_page_id = ${v.creatorPageId}`;
  const fields = v.kind === "release" ? sql`capability` : sql`capability, creator_page_id`;
  const values = v.kind === "release" ? sql`${v.capability}` : sql`${v.capability}, ${v.creatorPageId}`;
  return sql`
    with previous as (select to_jsonb(t) as data from ${table} t where ${key}),
    changed as (
      insert into ${table} (${fields}, ${column}, version)
      select ${values}, ${value}, 1
      where exists(select 1 from "user" where id = ${actorUserId} and role = 'admin' and suspended_at is null)
        and (${v.version} = 0 or exists(select 1 from previous))
      on conflict (${fields}) do update set ${column} = excluded.${column}, version = ${table}.version + 1, updated_at = now()
      where ${table}.version = ${v.version}
      returning *
    ), audit as (
      insert into capability_audit(id,actor_user_id,capability,target,"before","after",reason)
      select ${auditId},${actorUserId},${v.capability},${target},
        (select data from previous),to_jsonb(changed),${v.reason} from changed returning id
    ) select changed.version from changed cross join audit`;
}

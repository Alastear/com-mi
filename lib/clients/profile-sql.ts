import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { ClientProfileInput } from "./profile";

/** Internal builder; action must authorize scope from its server session first. */
export function saveClientProfileSql(scope: { creatorPageId: string; userId: string }, v: z.infer<typeof ClientProfileInput>) {
  return sql`insert into client_profile (creator_page_id,client_user_id,note,tags,version)
    select ${scope.creatorPageId},${v.clientId},${v.note},${JSON.stringify(v.tags)}::jsonb,1
    where exists(select 1 from "order" o join creator_page c on c.id = o.creator_page_id
      where c.id = ${scope.creatorPageId} and c.user_id = ${scope.userId} and o.client_user_id = ${v.clientId})
    and (${v.version} = 0 or exists(select 1 from client_profile where creator_page_id = ${scope.creatorPageId} and client_user_id = ${v.clientId}))
    on conflict(creator_page_id,client_user_id) do update set note = excluded.note,tags = excluded.tags,
      version = client_profile.version + 1, updated_at = now()
    where client_profile.version = ${v.version}
    returning version`;
}

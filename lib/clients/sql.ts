import { sql } from "drizzle-orm";
import { CLIENT_PAGE_SIZE, type clientFilters } from "./filters";

// Only guarded server queries may supply shopId. Builders are also used by staging checks.
const received = sql`coalesce((select sum(p.amount_cents) from payment_record p where p.order_id = o.id
  and p.verified_at is not null and p.voided_at is null and p.rejected_at is null), 0)`;

export function clientListSql(shopId: string, filters: ReturnType<typeof clientFilters>) {
  return sql`select u.id, u.name, count(*)::int as orders,
    sum(case when o.currency = 'THB' then ${received} else 0 end)::text as received,
    max(o.created_at)::text as last_order
    from "order" o inner join "user" u on u.id = o.client_user_id
    where o.creator_page_id = ${shopId} and u.name ilike ${filters.pattern}
    group by u.id, u.name order by max(o.created_at) desc, u.id asc
    limit ${CLIENT_PAGE_SIZE + 1} offset ${filters.offset}`;
}

export function clientOrdersSql(shopId: string, clientId: string, offset: number) {
  return sql`select o.code, o.status, o.currency, o.total_cents as total, ${received}::text as received, o.created_at::text as created_at
    from "order" o where o.creator_page_id = ${shopId} and o.client_user_id = ${clientId}
    order by o.created_at desc, o.id desc limit ${CLIENT_PAGE_SIZE + 1} offset ${offset}`;
}

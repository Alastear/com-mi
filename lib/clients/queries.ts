import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireCreator } from "@/lib/auth-guard";
import { requireCapability } from "@/lib/capabilities/server";
import { CLIENT_PAGE_SIZE, clientFilters } from "./filters";
import { clientListSql, clientOrdersSql } from "./sql";

export type ClientSummary = { id: string; name: string; orders: number; received: string; last_order: string };
export type ClientOrder = { code: string; status: string; currency: string; total: number; received: string; created_at: string };

async function ownScope() {
  const { user } = await requireCreator();
  const [shop] = await getDb().select({ id: schema.creatorPage.id }).from(schema.creatorPage)
    .where(eq(schema.creatorPage.userId, user.id)).limit(1);
  if (!shop) return null;
  // Reports require the full release/cohort/plan gate, not read_existing.
  return requireCapability("crm", shop.id);
}

export async function listClients(input: { q?: string; page?: string }) {
  const scope = await ownScope();
  if (!scope) return null;
  const filters = clientFilters(input);
  const rows = await getDb().execute<ClientSummary>(clientListSql(scope.creatorPageId, filters));
  return { ...filters, clients: rows.rows.slice(0, CLIENT_PAGE_SIZE), hasNext: rows.rows.length > CLIENT_PAGE_SIZE };
}

export async function clientHistory(clientId: string, page?: string) {
  const scope = await ownScope();
  if (!scope || !clientId || clientId.length > 150) return null;
  const [relationship] = await getDb().select({ id: schema.order.id }).from(schema.order)
    .where(and(eq(schema.order.creatorPageId, scope.creatorPageId), eq(schema.order.clientUserId, clientId))).limit(1);
  if (!relationship) return null;
  const [client] = await getDb().select({ id: schema.user.id, name: schema.user.name }).from(schema.user)
    .where(eq(schema.user.id, clientId)).limit(1);
  if (!client) return null;
  const filters = clientFilters({ page });
  const rows = await getDb().execute<ClientOrder>(clientOrdersSql(scope.creatorPageId, clientId, filters.offset));
  return { client, page: filters.page, orders: rows.rows.slice(0, CLIENT_PAGE_SIZE), hasNext: rows.rows.length > CLIENT_PAGE_SIZE };
}

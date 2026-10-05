import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireCreator } from "@/lib/auth-guard";
import { requireCapability } from "@/lib/capabilities/server";
import { CLIENT_PAGE_SIZE, clientFilters } from "./filters";
import { clientListSql, clientOrdersSql } from "./sql";
import { CapabilityAccessError } from "@/lib/capabilities/authorize";
import type { CapabilityOperation } from "@/lib/capabilities/policy";

export type ClientSummary = { id: string; name: string; orders: number; received: string; last_order: string; tags: string[] };
export type ClientOrder = { code: string; status: string; currency: string; total: number; received: string; created_at: string };

export async function ownClientScope(operation: CapabilityOperation = "write") {
  const { user } = await requireCreator();
  const [shop] = await getDb().select({ id: schema.creatorPage.id }).from(schema.creatorPage)
    .where(eq(schema.creatorPage.userId, user.id)).limit(1);
  if (!shop) return null;
  // Reports require the full release/cohort/plan gate, not read_existing.
  return requireCapability("crm", shop.id, operation);
}

export async function listClients(input: { q?: string; page?: string }) {
  const scope = await ownClientScope();
  if (!scope) return null;
  const filters = clientFilters(input);
  const rows = await getDb().execute<ClientSummary>(clientListSql(scope.creatorPageId, filters));
  return { ...filters, clients: rows.rows.slice(0, CLIENT_PAGE_SIZE), hasNext: rows.rows.length > CLIENT_PAGE_SIZE };
}

export async function clientHistory(clientId: string, page?: string) {
  const scope = await ownClientScope("read_existing");
  if (!scope || !clientId || clientId.length > 150) return null;
  const [relationship] = await getDb().select({ id: schema.order.id }).from(schema.order)
    .where(and(eq(schema.order.creatorPageId, scope.creatorPageId), eq(schema.order.clientUserId, clientId))).limit(1);
  if (!relationship) return null;
  const [client] = await getDb().select({ id: schema.user.id, name: schema.user.name }).from(schema.user)
    .where(eq(schema.user.id, clientId)).limit(1);
  if (!client) return null;
  const filters = clientFilters({ page });
  const rows = await getDb().execute<ClientOrder>(clientOrdersSql(scope.creatorPageId, clientId, filters.offset));
  const [profile] = await getDb().select({ note: schema.clientProfile.note, tags: schema.clientProfile.tags, version: schema.clientProfile.version })
    .from(schema.clientProfile).where(and(eq(schema.clientProfile.creatorPageId, scope.creatorPageId), eq(schema.clientProfile.clientUserId, clientId))).limit(1);
  let canEdit = true;
  try { await requireCapability("crm", scope.creatorPageId); }
  catch (error) { if (!(error instanceof CapabilityAccessError)) throw error; canEdit = false; }
  return { client, profile: profile ?? { note: "", tags: [], version: 0 }, canEdit, page: filters.page, orders: rows.rows.slice(0, CLIENT_PAGE_SIZE), hasNext: rows.rows.length > CLIENT_PAGE_SIZE };
}

import { and, eq } from "drizzle-orm";
import { schema, type getDb } from "@/lib/db";
import type { CapabilityContext } from "./policy";

/** Internal loader: userId must come from the authenticated server session, never form input. */
export async function loadCapabilityContext(
  db: ReturnType<typeof getDb>, userId: string, creatorPageId: string,
): Promise<CapabilityContext | null> {
  const [row] = await db.select({
    ownerUserId: schema.creatorPage.userId,
    plan: schema.user.plan,
    planUntil: schema.user.planUntil,
    userSuspendedAt: schema.user.suspendedAt,
    shopSuspendedAt: schema.creatorPage.suspendedAt,
  }).from(schema.creatorPage)
    .innerJoin(schema.user, eq(schema.user.id, schema.creatorPage.userId))
    .where(and(eq(schema.creatorPage.id, creatorPageId), eq(schema.creatorPage.userId, userId)))
    .limit(1);
  return row ? {
    userId, ownerUserId: row.ownerUserId, plan: row.plan, planUntil: row.planUntil,
    userSuspended: row.userSuspendedAt !== null, shopSuspended: row.shopSuspendedAt !== null,
    // FND-03 will supply a private, audited rollout store. Default is deny.
    inInternalCohort: false, inBetaCohort: false,
  } : null;
}

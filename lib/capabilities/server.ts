import "server-only";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-guard";
import { getDb, schema } from "@/lib/db";
import { authorizeCapability } from "./authorize";
import type { CapabilityId } from "./registry";
import type { CapabilityOperation } from "./policy";

/**
 * Must be called inside each future query/action, before loading feature data or writing.
 * Only the authenticated ID comes from the session; ownership, plan and suspension are fresh.
 * Callers must also constrain every resource query/mutation to the returned creatorPageId.
 * No React cache: repeated mutations must not reuse an old entitlement snapshot.
 */
export async function requireCapability(
  capability: CapabilityId,
  creatorPageId: string,
  operation: CapabilityOperation = "write",
) {
  const session = await requireSession();
  await authorizeCapability(capability, operation, async () => {
    const [row] = await getDb().select({
      ownerUserId: schema.creatorPage.userId,
      plan: schema.user.plan,
      planUntil: schema.user.planUntil,
      userSuspendedAt: schema.user.suspendedAt,
      shopSuspendedAt: schema.creatorPage.suspendedAt,
    }).from(schema.creatorPage)
      .innerJoin(schema.user, eq(schema.user.id, schema.creatorPage.userId))
      .where(and(eq(schema.creatorPage.id, creatorPageId), eq(schema.creatorPage.userId, session.user.id)))
      .limit(1);
    return row ? {
      userId: session.user.id,
      ownerUserId: row.ownerUserId,
      plan: row.plan,
      planUntil: row.planUntil,
      userSuspended: row.userSuspendedAt !== null,
      shopSuspended: row.shopSuspendedAt !== null,
      // FND-03 will supply a private, audited rollout store. Default is deny.
      inInternalCohort: false,
      inBetaCohort: false,
    } : null;
  });
  return { userId: session.user.id, creatorPageId };
}

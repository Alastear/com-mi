import "server-only";
import { requireSession } from "@/lib/auth-guard";
import { getDb, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { loadCapabilityContext } from "./context";
import { CapabilityAccessError } from "./authorize";
import { CAPABILITIES, type CapabilityId, type CapabilityDefinition } from "./registry";
import { evaluateCapability, type CapabilityOperation } from "./policy";
import { resolveRollout } from "./rollout-policy";

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
  const db = getDb();
  const context = await loadCapabilityContext(db, session.user.id, creatorPageId);
  let definition: CapabilityDefinition = CAPABILITIES[capability];
  let current = context;
  if (context && definition.implemented) {
    const [release] = await db.select({ status: schema.capabilityRollout.status }).from(schema.capabilityRollout)
      .where(eq(schema.capabilityRollout.capability, capability)).limit(1);
    const [membership] = await db.select({ cohort: schema.capabilityCohort.cohort }).from(schema.capabilityCohort)
      .where(and(eq(schema.capabilityCohort.capability, capability), eq(schema.capabilityCohort.creatorPageId, creatorPageId))).limit(1);
    ({ definition, context: current } = resolveRollout(definition, context, release?.status, membership?.cohort, process.env.APP_ENV));
  }
  const decision = evaluateCapability(definition, current, operation);
  if (!decision.allowed) throw new CapabilityAccessError(decision.reason);
  return { userId: session.user.id, creatorPageId };
}

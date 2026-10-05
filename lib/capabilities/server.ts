import "server-only";
import { requireSession } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { loadCapabilityContext } from "./context";
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
  await authorizeCapability(capability, operation, () => loadCapabilityContext(getDb(), session.user.id, creatorPageId));
  return { userId: session.user.id, creatorPageId };
}

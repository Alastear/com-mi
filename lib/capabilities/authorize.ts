import { CAPABILITIES, type CapabilityId } from "./registry";
import { evaluateCapability, type CapabilityContext, type CapabilityOperation } from "./policy";

export class CapabilityAccessError extends Error {
  constructor(readonly reason: string) {
    super("CAPABILITY_ACCESS_DENIED");
    this.name = "CapabilityAccessError";
  }
}

/** Loader is supplied only by server.ts; there is no client-callable authorization endpoint. */
export async function authorizeCapability(
  id: CapabilityId,
  operation: CapabilityOperation,
  loadCurrentContext: () => Promise<CapabilityContext | null>,
) {
  const decision = evaluateCapability(CAPABILITIES[id], await loadCurrentContext(), operation);
  if (!decision.allowed) throw new CapabilityAccessError(decision.reason);
}

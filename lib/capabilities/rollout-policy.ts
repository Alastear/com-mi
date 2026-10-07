import { z } from "zod";
import type { CapabilityDefinition } from "./registry";
import type { CapabilityContext } from "./policy";

// Public launch is a code release, not an admin toggle. No live/planned reset here.
const common = { capability: z.literal("crm"), version: z.number().int().min(0).max(2147483646), reason: z.string().trim().min(5).max(500) };
export const RolloutInput = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("release"), status: z.enum(["internal", "beta", "paused"]) }),
  z.object({ ...common, kind: z.literal("cohort"), creatorPageId: z.string().min(1).max(150), cohort: z.enum(["internal", "beta", "revoked"]) }),
]);

export function resolveRollout(definition: CapabilityDefinition, context: CapabilityContext | null,
  status: string | undefined, cohort: string | undefined, environment: string | undefined) {
  if (!definition.implemented || !context) return { definition, context };
  const internalEnvironment = environment === "staging" || environment === "development";
  const state = status === "beta" || status === "paused" || status === "internal" ? status : definition.status;
  return {
    // Moving back to internal must not hide a pilot's already-owned records in production.
    definition: { ...definition, status: state === "internal" && !internalEnvironment ? "paused" as const : state },
    context: { ...context, inInternalCohort: internalEnvironment && cohort === "internal", inBetaCohort: cohort === "beta" },
  };
}

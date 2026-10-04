import { BETA_FREE_PRO, can, effectivePlan, type PlanId } from "@/lib/billing/plans";
import type { CapabilityDefinition } from "./registry";

export type CapabilityOperation = "write" | "read_existing";
export type CapabilityDecision = { allowed: true } | {
  allowed: false;
  reason: "unauthorized" | "suspended" | "unavailable" | "paused" | "cohort" | "plan";
};
export type CapabilityContext = {
  userId: string;
  ownerUserId: string;
  userSuspended: boolean;
  shopSuspended: boolean;
  plan: string;
  planUntil: Date | null;
  /** Computed on the server from a private rollout policy, never request input. */
  inInternalCohort: boolean;
  inBetaCohort: boolean;
};

export function currentPlan(plan: string, until: Date | null, now: Date): PlanId {
  if (until && (!Number.isFinite(until.getTime()) || until.getTime() <= now.getTime())) return "free";
  return plan === "pro" || plan === "studio" ? plan : "free";
}

/** Pure policy, shared by server authorization and adversarial tests. */
export function evaluateCapability(
  definition: CapabilityDefinition,
  context: CapabilityContext | null,
  operation: CapabilityOperation,
  { betaFreePro = BETA_FREE_PRO, now = new Date() } = {},
): CapabilityDecision {
  if (!context || !context.userId || context.userId !== context.ownerUserId) return { allowed: false, reason: "unauthorized" };
  if (context.userSuspended || context.shopSuspended) return { allowed: false, reason: "suspended" };
  if (!definition.implemented || definition.status === "planned") return { allowed: false, reason: "unavailable" };
  // Retain access to existing owned records after a pause, downgrade or cohort removal.
  // This is not permission to run exports, generate reports, sign uploads or send messages.
  if (operation === "read_existing") return { allowed: true };
  if (definition.status === "paused") return { allowed: false, reason: "paused" };
  if (definition.status === "internal" && !context.inInternalCohort) return { allowed: false, reason: "cohort" };
  if (definition.status === "beta" && !context.inBetaCohort && !context.inInternalCohort) return { allowed: false, reason: "cohort" };
  const plan = effectivePlan(currentPlan(context.plan, context.planUntil, now), betaFreePro);
  if (definition.entitlement && !can(plan, definition.entitlement)) return { allowed: false, reason: "plan" };
  return { allowed: true };
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { CAPABILITIES } from "./registry";
import { evaluateCapability, type CapabilityContext } from "./policy";
import { resolveRollout, RolloutInput } from "./rollout-policy";
const owner: CapabilityContext = { userId: "a", ownerUserId: "a", plan: "pro", planUntil: null, userSuspended: false, shopSuspended: false, inInternalCohort: false, inBetaCohort: false };
function access(status?: string, cohort?: string, env?: string, operation: "write" | "read_existing" = "write") {
  const resolved = resolveRollout(CAPABILITIES.crm, owner, status, cohort, env);
  return evaluateCapability(resolved.definition, resolved.context, operation);
}
test("rollout defaults to unavailable and never grants live through the store", () => {
  assert.equal(access().allowed, false);
  assert.equal(access("live", "beta", "production").allowed, false);
  assert.equal(access("unknown", "internal", "staging").allowed, false);
  const other = resolveRollout(CAPABILITIES.auctions, owner, "beta", "beta", "production");
  assert.equal(evaluateCapability(other.definition, other.context, "write").allowed, false);
});
test("internal requires a testing environment and explicit membership", () => {
  assert.equal(access("internal", "internal", "staging").allowed, true);
  for (const env of [undefined, "production", "preview"]) assert.equal(access("internal", "internal", env).allowed, false);
  assert.equal(access("internal", "beta", "staging").allowed, false);
  assert.equal(access("internal", "revoked", "production", "read_existing").allowed, true);
});
test("beta membership, revocation and pause apply independently of paid plans", () => {
  assert.equal(access("beta", "beta", "production").allowed, true);
  for (const cohort of [undefined, "revoked", "unknown", "internal"]) assert.equal(access("beta", cohort, "production").allowed, false);
  assert.equal(access("paused", "beta", "production").allowed, false);
  assert.equal(access("paused", "revoked", "production", "read_existing").allowed, true);
  const resolved = resolveRollout(CAPABILITIES.crm, { ...owner, userId: "intruder" }, "beta", "beta", "production");
  assert.equal(evaluateCapability(resolved.definition, resolved.context, "read_existing").allowed, false);
});
test("admin inputs require a reason, bounded version and supported state", () => {
  const valid = { kind: "release", capability: "crm", status: "paused", reason: "Incident review", version: 0 };
  assert.ok(RolloutInput.safeParse(valid).success);
  for (const change of [{ status: "live" }, { status: "planned" }, { capability: "auctions" }, { reason: " " }, { version: -1 }, { version: 1.5 }]) assert.equal(RolloutInput.safeParse({ ...valid, ...change }).success, false);
});

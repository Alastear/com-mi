import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAPABILITIES, CAPABILITY_SURFACES, capabilityStatus, publicReleaseStatus, type CapabilityDefinition, type CapabilityId } from "./registry";
import { evaluateCapability, type CapabilityContext } from "./policy";
import { authorizeCapability, CapabilityAccessError } from "./authorize";
import { COMPARISON, PRO_BULLETS } from "@/lib/billing/plans";

const owner: CapabilityContext = {
  userId: "owner-a", ownerUserId: "owner-a", userSuspended: false, shopSuspended: false,
  plan: "pro", planUntil: null, inInternalCohort: false, inBetaCohort: false,
};
const live: CapabilityDefinition = { roadmap: "CRM", implemented: true, status: "live", entitlement: "crm" };
const now = new Date("2026-10-04T00:00:00Z");
const paidOnly = { betaFreePro: false, now };

describe("release gates, separately from package upgrades", () => {
  it("all thirteen unfinished capabilities reject reads and writes even for beta Pro", () => {
    assert.equal(Object.keys(CAPABILITIES).length, 13);
    for (const definition of Object.values(CAPABILITIES)) {
      for (const operation of ["write", "read_existing"] as const) {
        assert.deepEqual(evaluateCapability(definition, { ...owner, plan: "free", inInternalCohort: true, inBetaCohort: true }, operation, { betaFreePro: true }), { allowed: false, reason: "unavailable" });
      }
    }
  });
  it("changing release status cannot unlock an implementation that does not exist", () => {
    for (const status of ["planned", "internal", "beta", "live", "paused"] as const) {
      const definition = { ...live, implemented: false, status };
      assert.deepEqual(evaluateCapability(definition, owner, "write"), { allowed: false, reason: "unavailable" });
      assert.equal(publicReleaseStatus([definition]), "planned");
    }
  });
  it("internal and beta require explicit membership; paying is not cohort membership", () => {
    assert.deepEqual(evaluateCapability({ ...live, status: "internal" }, owner, "write"), { allowed: false, reason: "cohort" });
    assert.deepEqual(evaluateCapability({ ...live, status: "internal" }, { ...owner, inBetaCohort: true }, "write"), { allowed: false, reason: "cohort" });
    assert.deepEqual(evaluateCapability({ ...live, status: "internal" }, { ...owner, inInternalCohort: true }, "write"), { allowed: true });
    assert.deepEqual(evaluateCapability({ ...live, status: "beta" }, owner, "write"), { allowed: false, reason: "cohort" });
    assert.deepEqual(evaluateCapability({ ...live, status: "beta" }, { ...owner, inBetaCohort: true }, "write"), { allowed: true });
    assert.deepEqual(evaluateCapability({ ...live, status: "beta" }, { ...owner, inBetaCohort: true, plan: "free" }, "write", paidOnly), { allowed: false, reason: "plan" });
  });
  it("rejects missing identity, cross-shop access and suspension even for historical reads", () => {
    for (const operation of ["write", "read_existing"] as const) {
      for (const context of [null, { ...owner, userId: "" }, { ...owner, ownerUserId: "owner-b" }]) {
        assert.deepEqual(evaluateCapability(live, context, operation), { allowed: false, reason: "unauthorized" });
      }
      for (const context of [{ ...owner, userSuspended: true }, { ...owner, shopSuspended: true }]) {
        assert.deepEqual(evaluateCapability(live, context, operation), { allowed: false, reason: "suspended" });
      }
    }
  });
  it("expires paid access at the boundary and fails closed on unknown plans or invalid dates", () => {
    for (const context of [
      { ...owner, planUntil: now }, { ...owner, planUntil: new Date("invalid") },
      { ...owner, plan: "unexpected" }, { ...owner, plan: "free" },
    ]) assert.deepEqual(evaluateCapability(live, context, "write", paidOnly), { allowed: false, reason: "plan" });
    assert.deepEqual(evaluateCapability(live, { ...owner, planUntil: new Date(now.getTime() + 1) }, "write", paidOnly), { allowed: true });
    assert.deepEqual(evaluateCapability(live, { ...owner, plan: "free" }, "write", { ...paidOnly, betaFreePro: true }), { allowed: true });
  });
  it("pausing stops new actions while downgrade/cohort removal preserves owned historical records", () => {
    assert.deepEqual(evaluateCapability({ ...live, status: "paused" }, owner, "write"), { allowed: false, reason: "paused" });
    for (const status of ["paused", "beta", "internal", "live"] as const) {
      assert.deepEqual(evaluateCapability({ ...live, status }, { ...owner, plan: "free" }, "read_existing", paidOnly), { allowed: true });
    }
  });
  it("free capabilities still enforce release and ownership", () => {
    assert.deepEqual(evaluateCapability({ ...live, entitlement: null }, { ...owner, plan: "free" }, "write", paidOnly), { allowed: true });
    assert.deepEqual(evaluateCapability({ ...live, entitlement: null, status: "paused" }, owner, "write"), { allowed: false, reason: "paused" });
  });
  it("authorization wrapper rejects direct calls to every planned feature and reloads context", async () => {
    let reads = 0;
    for (const id of Object.keys(CAPABILITIES) as CapabilityId[]) {
      await assert.rejects(authorizeCapability(id, "write", async () => { reads++; return owner; }), (error: unknown) => error instanceof CapabilityAccessError && error.reason === "unavailable");
    }
    assert.equal(reads, 13);
    await assert.rejects(authorizeCapability("crm", "write", async () => null), (error: unknown) => error instanceof CapabilityAccessError && error.reason === "unauthorized");
  });
});

describe("consistent public feature promises", () => {
  it("pricing and Pro bullets keep unavailable bundles labelled", () => {
    const rows = COMPARISON.flatMap((group) => group.rows);
    for (const [key, capabilities] of Object.entries(CAPABILITY_SURFACES.pricing)) {
      const row = rows.find((row) => row.key === key);
      assert.deepEqual(row?.capabilities, capabilities);
      assert.equal(row?.soon, capabilityStatus(capabilities) === "live" ? undefined : true);
    }
    for (const [key, capabilities] of Object.entries(CAPABILITY_SURFACES.proBullets)) {
      assert.deepEqual(PRO_BULLETS.find((bullet) => bullet.key === key)?.capabilities, capabilities);
    }
  });
  it("every roadmap scope has a public surface and all upcoming nav routes are unavailable", () => {
    const mapped = new Set(Object.values(CAPABILITY_SURFACES).flatMap((surface) => Object.values(surface).flat()));
    assert.deepEqual([...mapped].sort(), Object.keys(CAPABILITIES).sort());
    for (const capabilities of Object.values(CAPABILITY_SURFACES.nav)) assert.equal(capabilityStatus(capabilities), "planned");
  });
  it("partial bundles cannot advertise all parts as ready or reveal an internal launch", () => {
    assert.equal(publicReleaseStatus([live, { ...live, status: "internal" }]), "planned");
    assert.equal(publicReleaseStatus([live, { ...live, status: "beta" }]), "beta");
    assert.equal(publicReleaseStatus([live, { ...live, status: "paused" }]), "paused");
    assert.equal(publicReleaseStatus([live, live]), "live");
    assert.equal(publicReleaseStatus([]), "planned");
  });
});

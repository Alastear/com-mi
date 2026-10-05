import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mayRecordDeposit, needsWorkApproval } from "./approval-policy";

describe("client confirmation for final payments", () => {
  it("creator may record a deposit but cannot bypass the client's final report", () => {
    assert.equal(mayRecordDeposit(0, 50000, 50000), true);
    assert.equal(mayRecordDeposit(30000, 50000, 20000), true);
    assert.equal(mayRecordDeposit(50000, 50000, 1), false);
    assert.equal(mayRecordDeposit(0, 50000, 100000), false);
    assert.equal(mayRecordDeposit(0, 0, 100000), false);
  });
  it("final confirmation during work requires client approval", () => {
    for (const status of ["in_progress", "in_review", "revision_requested"]) {
      assert.equal(needsWorkApproval(status, null, 50000, 50000, 100000), true);
      assert.equal(needsWorkApproval(status, "med_latest", 50000, 50000, 100000), false);
    }
  });
  it("a new preview or revision clears approval and blocks final receipt again", () => {
    assert.equal(needsWorkApproval("in_review", "med_old", 50000, 50000, 100000), false);
    assert.equal(needsWorkApproval("in_review", null, 50000, 50000, 100000), true);
  });
  it("preserves upfront payments and deposit reports", () => {
    assert.equal(needsWorkApproval("accepted", null, 0, 100000, 100000), false);
    assert.equal(needsWorkApproval("in_progress", null, 0, 50000, 100000), false);
  });
  it("historically delivered work can resolve a rejected or voided payment", () => {
    assert.equal(needsWorkApproval("delivered", null, 50000, 50000, 100000), false);
    assert.equal(needsWorkApproval("completed", null, 50000, 50000, 100000), false);
  });
});

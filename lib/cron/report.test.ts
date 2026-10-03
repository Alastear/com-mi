import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cronResponseStatus } from "./report";

describe("cron health reporting", () => {
  it("successful full and scoped runs return 200", () => {
    assert.equal(cronResponseStatus({ media: { errors: [] }, lifecycle: { errors: [] } }), 200);
    assert.equal(cronResponseStatus({ lifecycle: { errors: [] } }), 200);
    assert.equal(cronResponseStatus({ media: { errors: [] } }), 200);
  });
  it("an entire stage failing is visible even when the other stage succeeds", () => {
    assert.equal(cronResponseStatus({ media: { failed: "storage unavailable" }, lifecycle: { errors: [] } }), 503);
    assert.equal(cronResponseStatus({ media: { errors: [] }, lifecycle: { failed: "database unavailable" } }), 503);
  });
  it("per-item failures must not report a healthy run", () => {
    assert.equal(cronResponseStatus({ media: { errors: ["object deletion failed"] } }), 503);
    assert.equal(cronResponseStatus({ lifecycle: { errors: ["order update failed"] } }), 503);
  });
  it("a thrown error with an empty message still marks a failed stage", () => {
    assert.equal(cronResponseStatus({ media: { failed: "" } }), 503);
  });
});

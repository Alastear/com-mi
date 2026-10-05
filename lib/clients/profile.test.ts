import assert from "node:assert/strict";
import { test } from "node:test";
import { ClientProfileInput } from "./profile";
const valid = { clientId: "client-a", note: " memo ", tags: [" VIP ", "vip", "ลูกค้าประจำ"], version: 0 };
test("normalizes private notes and duplicate tags; permits clearing", () => {
  const result = ClientProfileInput.parse(valid);
  assert.equal(result.note, "memo");
  assert.deepEqual(result.tags, ["vip", "ลูกค้าประจำ"]);
  assert.ok(ClientProfileInput.safeParse({ ...valid, note: "", tags: [] }).success);
});
test("rejects oversized data and invalid optimistic versions", () => {
  for (const change of [{ note: "a".repeat(4001) }, { tags: Array(11).fill("a") }, { tags: ["a".repeat(31)] }, { tags: [""] }, { version: -1 }, { version: 1.5 }, { version: 2147483647 }, { clientId: "" }]) {
    assert.equal(ClientProfileInput.safeParse({ ...valid, ...change }).success, false);
  }
});
test("does not accept shop ownership from client payload", () => {
  const parsed = ClientProfileInput.parse({ ...valid, creatorPageId: "other-shop", userId: "other-owner" });
  assert.equal("creatorPageId" in parsed, false);
  assert.equal("userId" in parsed, false);
});

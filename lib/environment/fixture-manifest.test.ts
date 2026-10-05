import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureManifest } from "./fixture-manifest";
import { isOrderCode } from "../orders/code";

test("manifest is reproducible and distinct runs never share record IDs", () => {
  const first = fixtureManifest("qa-run-01");
  assert.deepEqual(first, fixtureManifest("qa-run-01"));
  const ids = (m: typeof first) => [...m.users, ...m.shops, ...m.services, ...m.orders].map(row => row.id);
  assert.equal(new Set(ids(first)).size, ids(first).length);
  for (const id of ids(fixtureManifest("qa-run-02"))) assert.ok(!ids(first).includes(id));
});
test("both shops have both clients and navigable order codes across four states", () => {
  const m = fixtureManifest("qa-run-01");
  assert.equal(m.users.length, 4);
  assert.deepEqual(m.users.map(u => u.locale), ["th", "en", "th", "en"]);
  assert.equal(new Set(m.orders.map(o => o.code)).size, 8);
  for (const shop of m.shops) {
    const orders = m.orders.filter(o => o.shopId === shop.id);
    assert.equal(new Set(orders.map(o => o.clientId)).size, 2);
    assert.equal(new Set(orders.map(o => o.status)).size, 4);
    for (const order of orders) {
      assert.ok(isOrderCode(order.code));
      assert.equal(m.services.find(s => s.id === order.serviceId)?.shopId, shop.id);
    }
  }
  assert.ok(m.users.every(u => u.email.endsWith("@example.invalid")));
});
test("run IDs cannot introduce path traversal, wildcard cleanup or SQL fragments", () => {
  for (const id of ["", "short", "../qa-run-01", "QA-RUN-01", "qa_run_%", "x' OR 1=1", "x".repeat(33)]) {
    assert.throws(() => fixtureManifest(id));
  }
});

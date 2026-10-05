import assert from "node:assert/strict";
import { test } from "node:test";
import { clientFilters } from "./filters";

test("search treats SQL wildcards as literal characters", () => {
  assert.equal(clientFilters({ q: "  50%_\\  " }).pattern, "%50\\%\\_\\\\%");
  assert.equal(clientFilters({ q: " O'Brien " }).q, "O'Brien");
  assert.equal(clientFilters({ q: "ลูกค้า" }).q, "ลูกค้า");
});
test("pagination rejects malformed values and bounds expensive offsets", () => {
  for (const page of ["-1", "NaN", "1.5", "Infinity", "1e3", "999999999999"]) assert.equal(clientFilters({ page }).page, 1);
  assert.equal(clientFilters({ page: "0" }).page, 1);
  assert.equal(clientFilters({ page: "99999" }).page, 10000);
  assert.equal(clientFilters({ page: "2" }).offset, 20);
  assert.equal(clientFilters({ q: "a".repeat(200) }).q.length, 100);
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimatePlatformPayout, payoutAfterEqualFees } from "./platform-fees";

describe("equal Stripe and platform fees paid by the creator", () => {
  it("PromptPay: payer pays 1,000 baht, creator receives 967 baht", () => {
    assert.deepEqual(estimatePlatformPayout(100_000, "promptpay"), {
      grossCents: 100_000, payerTotalCents: 100_000, stripeFeeCents: 1650,
      platformFeeCents: 1650, totalFeeCents: 3300, creatorNetCents: 96700,
    });
  });
  it("domestic card includes the 10 baht fixed processing fee in both equal fees", () => {
    const p = estimatePlatformPayout(100_000, "domestic_card");
    assert.equal(p.stripeFeeCents, 4650); assert.equal(p.platformFeeCents, 4650);
    assert.equal(p.creatorNetCents, 90700); assert.equal(p.payerTotalCents, 100_000);
  });
  it("uses actual processing fees for settlement instead of a percentage estimate", () => {
    const p = payoutAfterEqualFees(100_000, 4780);
    assert.equal(p.platformFeeCents, 4780); assert.equal(p.creatorNetCents, 90440);
  });
  it("rejects invalid money and payouts exhausted by fees", () => {
    for (const amount of [0, -1, 0.5, NaN, Infinity, 2_147_483_648]) assert.throws(() => payoutAfterEqualFees(amount, 1));
    assert.throws(() => payoutAfterEqualFees(100, 50));
    assert.throws(() => payoutAfterEqualFees(100, -1));
    assert.throws(() => estimatePlatformPayout(100, "domestic_card"));
  });
  it("preserves conservation of funds across rounding boundaries", () => {
    for (const gross of [10001, 33333, 100000, 2147483647]) for (const method of ["promptpay", "domestic_card", "international_card"] as const) {
      const p = estimatePlatformPayout(gross, method);
      assert.equal(p.creatorNetCents + p.stripeFeeCents + p.platformFeeCents, gross);
      assert.equal(p.platformFeeCents, p.stripeFeeCents);
    }
  });
});

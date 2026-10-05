/** Stripe Thailand public processing rates, checked 2026-10-05.
 * https://stripe.com/en-th/pricing
 * Estimates exclude VAT, Connect, FX, refunds and disputes.
 * This module does not enable payment collection or promise name privacy.
 */
export const STRIPE_TH_RATES = {
  promptpay: { basisPoints: 165, fixedCents: 0 },
  domestic_card: { basisPoints: 365, fixedCents: 1000 },
  international_card: { basisPoints: 475, fixedCents: 1000 },
} as const;
export type PlatformPaymentMethod = keyof typeof STRIPE_TH_RATES;

/** The payer pays the agreed amount; the creator bears both equal fees. */
export function payoutAfterEqualFees(grossCents: number, stripeFeeCents: number) {
  if (!Number.isSafeInteger(grossCents) || grossCents <= 0 || grossCents > 2_147_483_647 ||
      !Number.isSafeInteger(stripeFeeCents) || stripeFeeCents < 0 || stripeFeeCents * 2 >= grossCents) throw new Error("invalid_payout");
  const platformFeeCents = stripeFeeCents;
  return { grossCents, payerTotalCents: grossCents, stripeFeeCents, platformFeeCents,
    totalFeeCents: stripeFeeCents + platformFeeCents, creatorNetCents: grossCents - stripeFeeCents - platformFeeCents };
}

export function estimatePlatformPayout(grossCents: number, method: PlatformPaymentMethod) {
  const rate = STRIPE_TH_RATES[method];
  if (!rate) throw new Error("invalid_method");
  const fee = Math.round(grossCents * rate.basisPoints / 10_000) + rate.fixedCents;
  return payoutAfterEqualFees(grossCents, fee);
}

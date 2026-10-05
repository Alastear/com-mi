# Recipient privacy and platform fees

Requested policy: the payer pays the agreed order amount. Deduct the Stripe
processing fee and an equal com-mi fee from the creator's proceeds. Here,
"equal" includes Stripe's fixed processing fee as well as its percentage.
Estimates are implemented in `lib/payments/platform-fees.ts`; this does not
enable collection or transfers.

Public Thailand pricing checked on 2026-10-05:

| Method | Stripe processing | com-mi fee | Creator net for THB 1,000 |
| --- | --- | --- | --- |
| PromptPay | 1.65% | Equal to processing fee | THB 967.00 |
| Domestic card | 3.65% + THB 10 | Equal to processing fee | THB 907.00 |
| International card | 4.75% + THB 10 | Equal to processing fee | THB 885.00 |

These estimates exclude VAT, Connect, FX, refunds and disputes. Actual settlement
must use the processor's balance transaction fees and a persisted fee-policy
version, with reconciliation for refunds and disputes. Never increase the
customer's checkout total to fund the fees.

Sources:
- https://stripe.com/en-th/pricing
- https://stripe.com/en-th/connect/pricing
- https://support.stripe.com/questions/stripe-thailand-support-for-marketplaces?locale=en-GB

## Activation dependencies

The workspace has no configured Stripe account, Connect account or webhook
credentials. Stripe's Thailand marketplace guidance explicitly says separate
charges and transfers are unsupported and some integrations require its sales
team. Direct charges alone do not establish that the recipient's personal name
will be hidden. Do not expose a working "hide recipient name" checkout until
the account country, supported charge model, collection of the platform fee,
merchant descriptor and receipts have been verified with Stripe.

After the account model is confirmed, implement hosted creator onboarding,
server-calculated Checkout sessions, reserved pending payments under the order
lock, signed webhook validation, event idempotency, actual fee accounting,
refund/reversal handling and reconciliation. Only signed processor events may
verify these payments; creator self-confirmation must never settle them.

QA must inspect Checkout, bank/card statements and receipt emails for recipient
name leakage, not just the com-mi screen. Test success, delayed payment,
failure, expired checkout, duplicate/out-of-order webhooks, cancellations and
refunds before enabling live mode.

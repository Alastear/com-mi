# Upload incident investigation and recovery — 7 ตุลาคม 2026

## Findings

The original preview QA timed out while waiting for a media row. That is not proof
that R2 itself timed out. There was no request trace from that first occurrence.
R2 healthchecks passed, and a subsequent normal browser run completed.

Investigation reproduced a readiness race in the test: Playwright `setInputFiles`
can assign a file to a server-rendered input before React has attached its handler,
including while the input is disabled. No preview upload starts, so the later
database assertion times out. The test now waits for an enabled, hydrated input.
The app keeps preview input disabled until hydration; a JavaScript-disabled browser
test verifies that the server-rendered input cannot be used prematurely.
This explains a reproducible failure mode; it does not establish the cause of every
historical timeout without the missing original trace.

Separate confirmed recovery gaps existed in the application:

- Multipart PUT had retries but no per-attempt timeout. A request that never settled
  never reached the retry logic.
- Preview UI did not show whether it was preparing, uploading, retrying or saving.
- Preview registration discarded the reusable request on an unconfirmed result and
  showed the same image-format error for network, quota and registration failures.
- Registration retry itself awaited each action indefinitely if its response hung.

## Implemented behavior

- Each multipart PUT has a 180-second deadline and uses the existing bounded backoff.
  Retrying the same upload/part number replaces that part rather than duplicating it.
  Hard 4xx errors and missing ETag do not retry; one worker's failure aborts siblings.
- A registration call without a response after 60 seconds returns `unconfirmed`.
  This is an observation deadline, not cancellation of the server transaction.
  It does not delete or automatically restart the upload.
- Preview UI keeps the original intent and ETags in memory and offers
  “Retry saving (no re-upload)”. New uploads are disabled while recovery is pending.
  Server-side ownership, intent claim and registered-media lookup remain the authority.
- Progress distinguishes preparation/upload/save/retry/offline, and errors distinguish
  invalid image, quota, rate limit and order state. Diagnostics log only stage/category,
  never signed URLs, file content or raw provider errors.
- A browser unload warning reduces accidental navigation while work is pending.
  Recovery is held in this page's memory, not durable across closing the tab or an SPA
  route change. Keep the page open during retry. It is not resumable multipart upload
  across browser restarts.
- Preview listing shows loading/failure instead of briefly claiming there are no files.

## Verified

23 focused tests passed, including a stuck PUT, abort propagation, hard-error handling,
and registration that commits after the client deadline without triggering deletion.
Full unit/regression suite, lint, TypeScript and production build passed.

Browser fault injection used fixture `qa-20261007-recovery` on local with outbound
email disabled. It aborted the first R2 PUT, then allowed the registration action to
commit but withheld its response. After 60 seconds the recovery button appeared;
releasing the lost response and retrying returned the existing media row. Exactly one
watermarked preview remained. Approval, final payment, delivery upload and byte-exact
original download then passed. Expected ERR_FAILED network messages came from injected
failures; there were no uncaught page errors.

Run with the normal fresh payment fixture and local server, plus `QA_UPLOAD_FAULTS=1`
and `PLAYWRIGHT_MODULE` pointing at the installed Playwright test API:

```sh
node --import tsx scripts/check-payment-browser.mts qa-recovery-01 --target-env .env.local --confirmed-local-test
```

## Operator response

1. Ask which visible stage is stalled and record the time/order code, browser and
   whether the device was offline. Do not request signed URLs or secrets.
2. If the upload completed but saving is unconfirmed, keep the tab open and retry
   saving. Do not delete the object or reset its consumed claim based only on a timeout.
3. Inspect intent/media ownership and pathname linkage before any manual cleanup.
   An existing media row means registration succeeded; retry is idempotent.
4. A stale claim with no media row can be reclaimed by the existing policy after
   16 minutes; retries must respect that lease. Do not shorten it below server lifetime.
5. For expired/hard-failed requests, refresh the preview list before re-uploading.
   Orphan/expired upload cleanup remains the scheduled cleanup job's responsibility.
6. If repeated failures continue, inspect sanitized stage/category, server errors and
   R2/DB connectivity. Verify cleanup cron execution; bucket lifecycle and restore
   configuration still need their separate operational checks.

No changes to DB schema, money gates, rollout membership or production configuration.

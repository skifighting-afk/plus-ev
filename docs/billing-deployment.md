# Card subscriptions deployment

Do not merge/enable live billing based on unit tests alone. The implementation is
disabled until the Edge Function, SQL migration and matching merchant keys exist.

## Server setup

1. Apply `company-six-month-offer.sql` if not already applied, then `migrations/toss-billing.sql` in staging first. Private tables must remain inaccessible to anon/authenticated roles.
2. Configure the Edge Function secrets directly in Supabase. Do not paste values into source or email:
   - `TOSS_BILLING_CLIENT_KEY` and `TOSS_BILLING_SECRET_KEY`: paired keys belonging to billing MID `bill_plusejtlh`. Use test keys first. Public documentation sample keys are not merchant credentials.
   - `BILLING_ENCRYPTION_KEY`: base64 of 32 cryptographically random bytes. Back up securely. Losing/changing it requires deleting/re-registering cards; do not rotate without a migration.
   - `BILLING_SCHEDULER_SECRET`: random secret of at least 32 characters.
   - `BILLING_APP_ORIGIN`: `https://plusevapp.kr` (staging origin for staging).
   - `BILLING_ENROLLMENT_ENABLED`: `true` only when enrollment should be open. Defaults to disabled. Cancellation and recovery remain available when enrollment is disabled.
   - Standard Supabase URL and service role environment values are provided by the platform.
3. Deploy `supabase functions deploy billing --project-ref hkcmsjwuwopxritafreg`. JWT gateway check is off for scheduler calls; `index.ts` always verifies user JWTs with `auth.getUser`, and checks the separate scheduler secret before scheduler access.
4. Register the approved callback origin with Toss if required. SDK callback is `/?billing=ok&billing_session=...`, failure is `/?billing=fail`.

## Tests and activation

The current OAuth upload token cannot modify `.github/workflows`. Workflow files are therefore supplied as inactive installation examples under `docs/billing-workflows/`. An administrator with workflow permission must install them into `.github/workflows/` before CI or scheduled renewals can run. Enrollment must remain disabled until the scheduler is installed and verified.

- Run `node --test billing.test.mjs supabase/functions/billing/core.test.mjs`.
- Install test-only `@electric-sql/pglite@0.3.14` in a scratch directory, set `PGLITE_MODULE` to its absolute module URL, run `node --test tests/billing-sql.test.mjs`.
- Verify real staging JWT ownership, no browser access to billing tables, test registration, provider payment lookup, duplicate callbacks, scheduler recovery, promotion expiry, and cancellation/card deletion. No raw card data or keys may appear in logs/screenshots.
- Test subscriptions use separate rows and never extend live company entitlements.
- Switching to live keys must follow merchant contract approval and live end-to-end verification. Add protected GitHub environment/review if appropriate before enabling any recurring charge.
- Set Actions secret `BILLING_SCHEDULER_SECRET`, variable `BILLING_FUNCTION_URL` to the exact Edge Function URL, then `BILLING_RENEW_ENABLED=true` only when ready. It is disabled by default and runs every 15 minutes; GitHub schedules may be delayed. The handler processes at most 25 due rows per run.
- Snapshot current DB function definitions and company state before rollout. Rollback frontend first and disable the scheduler. Existing subscriptions still need cancellation support and secure deletion; do not drop tables or encryption keys as rollback.

## Support operations

Each period has one immutable order and idempotency key. Query the provider before repeating the same charge. Ambiguous network outcomes retain the invoice for reconciliation. After 14 days unresolved invoices stop for manual review rather than risking expiry of Toss's 15-day idempotency window. Definite 4xx errors stop automated retries. Cancellation immediately stops future invoices even when a payment is unresolved. The scheduler reconciles that existing invoice without creating a new charge, then deletes the card. An already-in-flight charge can still complete and must be reconciled. Operational staff must resolve ambiguous payments promptly. Do not create a new order to bypass this restriction. Initial charge amounts are frozen from accepted consent, and retry backoff prevents unresolved subscriptions from monopolizing scheduler batches.

Provider-approved payments are recorded in `billing_invoices`. They are not currently included in the legacy one-time-payment HQ revenue export. Include this separate ledger in accounting before live activation. Refunds are handled through the merchant's existing support process and provider dashboard, not the subscription cancellation action.

Card issuance uses encrypted, durable `billing_checkouts.auth_cipher` jobs before any provider request. If a registration is canceled, superseded or ownership changes during issuance, the returned card key is queued for deletion rather than attached to the subscription. The scheduler replays the same issue request with the same idempotency key after a lost response, and checks committed registration state before deleting anything. Review jobs older than 14 days manually. The checked-in migration is for a fresh billing installation; no earlier draft was deployed during this task.

The frontend refuses card registration if an older controlling service worker cannot confirm that sensitive billing callback URLs bypass the cache. The HTML uses a no-referrer policy and strips authentication query parameters before submitting them to the server.

## References

- https://docs.tosspayments.com/guides/v2/billing/integration
- https://docs.tosspayments.com/reference/using-api/authorization
- https://supabase.com/docs/guides/functions/auth

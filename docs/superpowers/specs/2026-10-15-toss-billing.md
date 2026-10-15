# +EV card subscriptions

The user authorized both sending the prepared contract reply and implementing the previously proposed card registration, encrypted server-side billing keys, 30-day recurring payments and cancellation. The email was sent separately; deployment must not claim completion until actual merchant credentials and server access are available.

## Contract

- Add subscriptions only to company basic/pro plans. Other purchases retain their existing checkout.
- Owners must explicitly consent to immediate first payment and subsequent payments every 30 days. Show current server price and the maximum normal price after the six-month offer.
- Do not accept browser prices, company ownership assertions or billing keys. Verify the JWT and current owner membership on the server.
- Keep test subscriptions separate from live subscriptions. Test payments never extend production company entitlements.
- Store billing keys with AES-GCM encryption using a server-only 32-byte secret. No raw card details or keys in responses, logs or public tables.
- Persist one order per subscription period. Use stable provider idempotency keys and query the provider before retrying. Stop unresolved retries before provider idempotency expires.
- Cancellation stops new charges immediately after any in-flight charge finishes. Retain paid access through the paid period. Delete the provider billing key; retry deletion if needed.
- Existing unexpired paid plans are not silently overwritten or charged again. Reject enrollment until their term ends.
- Gate the UI with a deployed billing endpoint and valid paired merchant credentials. Missing configuration must fail closed.

## Components

`billing.js`: browser SDK registration and API client. `supabase/functions/billing/core.mjs`: testable action handler and provider boundary. `index.ts`: JWT verification and RPC adapter. `migrations/toss-billing.sql`: private tables, authoritative owner/price checks, transaction locks and entitlement updates. A scheduled workflow invokes the endpoint with a dedicated scheduler secret, never a browser credential.

## Deployment requirements

Actual billing MID client/secret key pair, encryption key, scheduler secret, Supabase function deployment and SQL access. Test end-to-end first. Live enablement and final PPT screenshots follow successful server and browser verification.

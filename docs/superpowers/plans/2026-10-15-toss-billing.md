# Toss Billing Implementation Plan

> Execute inline using superpowers:executing-plans. The user explicitly authorized both actions; use native execution without another authorization loop.

**Goal:** Add owner-consented card subscriptions while preserving existing one-time payments.
**Architecture:** One authenticated Edge Function coordinates private transactional SQL commands and Toss API requests. A browser module opens the provider registration UI. An authenticated scheduler renews due subscriptions.
**Tech Stack:** Browser JavaScript, Supabase Edge Functions, PostgreSQL, Node test runner.
**Spec:** ../specs/2026-10-15-toss-billing.md

## Global Constraints

30-day periods; server-only prices and owner checks; encrypted billing keys; no test entitlements; fail closed without deployment configuration.

## Review Focus

Cross-company access; concurrent callbacks/renewals; ambiguous provider responses; cancellation races; promotion expiry and repeated test/live registration.

### Task 1: Server contract and provider handler
- [x] Write failing tests for auth/consent, issuer binding, callback replay, duplicate charge handling, mismatched amounts, cancellation and secret-free responses.
- [x] Implement `createBillingService({repo, provider, encrypt, decrypt, config})` in `supabase/functions/billing/core.mjs`.
- [x] Implement JWT verification and SQL RPC adapter in `index.ts`; verify Node tests and syntax.

### Task 2: Transactional persistence
- [x] Add private subscription/checkout/invoice tables with service-role-only SQL commands, server pricing, period/order uniqueness and row locks.
- [x] Add a local SQL integration test covering owner isolation, test-mode entitlement isolation, claim concurrency and cancellation.
- [x] Run SQL checks in PGlite PostgreSQL. This does not verify production constraints or deployed RLS/API configuration.

### Task 3: Browser and operations
- [x] Test SDK return/session binding and cancellation action; implement module and app hooks.
- [x] Add consent and status UI without replacing non-subscription checkout.
- [x] Add opt-in deployment instructions and scheduler workflow.
- [ ] Run existing relevant tests and independent review, fix findings, commit and open a draft PR. Keep production unchanged until server credentials/configuration and end-to-end checks are available.

## Execution ledger

- Isolated local clone created under this task's `work/plus-ev-billing`, based on origin/main 78c73f0. Other chat's checkout remains untouched.
- User authorized both email send and billing implementation. Email was sent with draft PPT and explicit incomplete-integration status.
- 26 new browser/server/PostgreSQL tests pass. Existing pricing, home-view, payment RPC and feature-policy regressions pass.
- Independent review found cancellation intent, deletion retry, scheduler fairness and accepted-first-price issues. Added failing regressions and fixed each.
- A further review found issuance/persistence races. Added encrypted durable authorization jobs, orphan cleanup and state reconciliation, with real PostgreSQL/service integration regressions.
- Supabase console access verified. Toss developer center currently requires user login; do not reuse the supplied review-account password for this unrelated account. No production SQL/function/key changes or live enrollment have been enabled.
- Remaining rollout work: merchant login/paired test billing keys, staging SQL and Edge Function deployment, real SDK test flow, then live approval/configuration and final evidence PPT.

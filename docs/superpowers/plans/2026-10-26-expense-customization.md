# Expense customization implementation plan

Goal: Extend existing monthly expense cards with drilldown, batch editing and per-store display settings.
Architecture: Keep the existing app.js event and sheet conventions. Reuse stores.cfg and expense row updates with existing RLS; no schema change. Stable category keys remain independent of display labels.
Spec: ../specs/2026-10-26-expense-design.md (approved in chat).
Execution: Native implementation, authorized by the user's “구현”.

## Constraints and review focus
- Never change live financial records for tests; use local demo data.
- Hidden categories still count. Include month boundaries, future entries, estimates and empty states in tests.
- Batch saves validate all inputs first, retain failed edits, retry only unsaved changes, and protect closing-linked amounts/dates.
- Preserve category identifiers and unknown historical categories; escape names and memos.
- Preserve existing server permissions; settings controls are owner-only.

## Tasks
- [ ] Add failing expense-customization.test.mjs: monthly/category totals, settings, validation and partial-save recovery.
- [ ] Extend app.js helpers and sheets: expenseMonthData(), expenseList(), expenseBulkForm(), expenseSettings(). Wire existing click/submit handlers.
- [ ] Add responsive accessible styles in app.css and refresh index/demo/service-worker cache versions.
- [ ] Run existing and new Node tests; exercise local demo through the browser, including saving and reopening settings and batch edits.
- [ ] Review diff, commit changes and prepare reviewable branch/PR or deliverable patch if remote publication is unavailable.

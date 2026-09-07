# ASTRA campaign 1 — CRM correctness

Base: 081d157c08d92bccdab256aa1f1a85012ae0de24. Findings: CRM-LEAD-007, CRM-LEAD-011, CRM-LEAD-013.

## Behavior

Batch operations construct patches without optimistic mutation. Each successful commit updates local records and removes only its confirmed IDs from selection. A failure reports confirmed and unconfirmed counts and reloads the tenant list. An unconfirmed write may have committed before a network failure; no remote rollback or global atomicity is claimed. The same helper serves bulk changes, score recalculation, automations and normalization. Invalid tenant selections fail before writes instead of being silently discarded.

Duplicate merge reads current records and writes the survivor plus archived duplicates in one transaction. It validates tenant and record availability, blocks double dispatch and handles an already-completed merge idempotently. Exclusive commercial fields, responsible/follow-up legacy aliases, custom values/labels and earlier merged IDs are retained. Conflicting commercial values (including explicit clears versus values, different stages, probabilities, campaigns or same-key custom values) stop the merge with a message; the operator must reconcile them before archiving. No arbitrary winner is selected for conflicting historical metadata. Existing notes/history and maximum opportunity-value policy are retained.

CRM360 related leads, orders and conversations traverse tenant-filtered query pages using document cursors until exhausted. Only matching customer records are retained. Both legacy chat owner fields are retained and deduplicated. The active tenant/customer is checked before applying results. No indexes are changed. This favors complete summaries over the former silent tenant-wide truncation; read cost scales with tenant collection size. It is not a transactionally frozen cross-collection report. Existing candidate/search limits and observation/event limits are separate backlog items.

## Validation

RED executed real functions for a failure in the second of 401 batch writes, silently filtered foreign tenant, related records beyond document 300, and merge dropping an exclusive responsible field. GREEN covers those cases plus commercial fields, decimals, custom metadata, explicit clears/conflicts and existing CRM/core regression suites. Full Quality Gate is required before readiness.

## Safety and release

No production mutations, fixtures, merge, deployment, cleanup, sensitive settings, indexes, Storage Rules or WhatsApp code changes. This is a Pages-only candidate after separately authorized merge and deployment. ASTRA-FINDING-001 in Studio recovery remains paused and is not changed. CRM-LEAD-012 (shared SLA) and CRM-LEAD-010 (Rules integrity) are separate work.

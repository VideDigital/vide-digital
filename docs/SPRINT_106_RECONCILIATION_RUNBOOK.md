# Reconciliation runbook — human-controlled, no production execution

No cross-service transaction exists. Success, quota exhaustion, parallel creates/reactivations, pending locks, ENABLE/DISABLE ordering and legacy are covered by the existing Emulator/mocks; additional boundary tests cover create failure, failed reservation before enable, completion failure and retry. Do not interpret mocks as production Auth race evidence.

Planner consistency: activeCount includes this employee whenever document status is ativo, even if Auth is disabled while pending. Thus ativo with count0 is impossible; quota zero cannot support an active reservation. Inativo with count0 and Auth still enabled is a legitimate pending disable to investigate, not automatically contradictory. UID/tenant/syncId must be nonempty bounded strings without whitespace, control characters or path separators; versions must be explicit nonblank strings and match. The offline tool cannot authenticate provenance, verify a live quota, parse a Firestore version as an actual snapshot or prove quiescence from booleans. Its result is PLAN_ONLY with separate authorization always required; it cannot change status, recover/delete identity or clear a flag.

The separate reservation-fix PR preserves initially disabled Auth identities on unknown reservation outcomes and logs an operation ID known before the RPC. If the reservation committed, the pending document and identity can be investigated together. If it did not, an Auth-only account may remain and needs a case-specific authorized plan. Auth-absent/document-present orphans from older code are outside the normal sync-completion planner: stop, preserve logs/versions and require a dedicated intervention plan. Never recreate an identity or release quota just to satisfy the planner. The test for safe deletion specifically models a definitive business rejection before writes, not an arbitrary transaction error whose commit is unknown.

1. Identify environment and project. Isolated fixture project is demo-vide-hub; production is vide-digital-saas and requires separate written authorization.
2. Resolve exact employee UID from trusted operation record, never name/email. Check Auth UID and Firestore document ID are identical.
3. Verify donoUID against the trusted tenant/owner. No replacement identity or tenant reassignment.
4. Read document status, permissions and updateTime. Store a sanitized snapshot with restricted local access.
5. Read Auth existence, disabled state and token validity metadata; do not export credentials.
6. Record authSyncPendente and authSyncId, both expected and observed. Missing/mismatched values stop recovery.
7. Establish no request remains in flight using request logs/revision/operation timeline and an authorized maintenance window. A timeout alone proves nothing. If quiescence cannot be proved, HARD STOP.
8. Verify owner approval/plan, current active count and limit, including pending active reservations. Do not release capacity first.
9. Correlate technical logs with syncId, UID, revision and timestamps. A lost response can hide a committed Auth/Firestore change.
10. Confirm the exact administrative intention (active or inactive), operator and intervention authorization.
11. Re-read snapshot and require unchanged updateTime and syncId. The pure planner only validates supplied evidence; it does not verify live quiescence or execute repairs.
12. After separate approval, reconcile Auth to the approved intention if required, revoke refresh tokens and verify actual result. On ambiguous failure stop; never delete/recreate identity. Complete only the matching pending operation with a conditional Firestore transaction; revalidate version/tenant/plan. If an in-flight request or concurrent update is detected, stop without clearing the lock.
13. Verify Auth state, status, flag, quota and legitimate/denied access. Cross-tenant destructive checks remain Emulator-only. Do not claim a successful code rollback restored Auth/data.
14. Write an intervention audit with operator, authorization, technical IDs, preconditions, outcome and postchecks. Do not include passwords, tokens or client content.
15. HARD STOP for uncertain identity, missing logs, running operation, version drift, capacity exceeded, disabled/missing owner, conflicting admin intent, partial repair or audit failure. Preserve evidence and escalate.

## Isolated rehearsal
`node --test tests/employee-reconciliation-plan.test.mjs` uses synthetic snapshots, exercises the decision checklist and asserts no mutation. Run employee-limit Emulator suite plus employee-auth-race and server-error-instrumentation suites to exercise actual transaction/handler behavior. This is a tested planning/decision rehearsal, not an executable live recovery tool. No Firebase SDK or network is imported by scripts/employee-reconciliation-plan.mjs.

## Rollback and transition
Old Functions ignore pending guards; reverting code may reopen races. Preserve new Rules, drain old revisions, identify pending operations and reconcile before considering rollback. Rules-first is compatible with inspected frontend Callables, but an old in-flight request may overlap a new revision. Staging must exercise mixed versions and an operator-controlled quiescence window. This PR does not certify that rehearsal in production or resolve old WhatsApp consumers. NO-GO for deploy remains until separately reviewed dependencies are closed. Never clear pending flags in bulk or delete accounts by email/name.

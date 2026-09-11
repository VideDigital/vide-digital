# ASTRA campaign 1 — public capture reliability

Base: 081d157c08d92bccdab256aa1f1a85012ae0de24.

This change addresses CRM-LEAD-009, CRM-LEAD-014 and PR61-PROD-001. The Studio local recovery B0 (ASTRA-FINDING-001) is a separate, paused implementation line; no recovery/save/publication code is changed here.

## Behavior and contract

Public capture validates provided email and phone contacts, retaining name-only leads and optional empty contacts. Phone validation accepts 10–15 normalized digits, including international numbers. Existing stored leads are not revalidated or migrated.

The inline LP fallback preserves controls and values when the public identifier is missing or the callable fails. It blocks overlapping fallback submits, restores the prior button state, and preserves the attempt token on ambiguous failures. The only public writer remains createPublicLead.

For structured custom fields, createPublicLead derives an additive `camposExtrasMeta` map from the published block owned by the server-resolved tenant. Public page, owner eligibility, form schema and dedupe are read in the same Firestore transaction before creating the lead. Retries preserve the first successful record and its snapshot. Visitor-supplied metadata is ignored. The new form block hint is validated against the page's published order; it does not establish tenant authority. Legacy callers without a hint receive metadata only for one unambiguous matching form, with at most 225 block reads. Missing/ambiguous schema preserves values and falls back to readable keys.

**Historical semantics:** this is the published label read by the server at capture time. An old browser tab submitted after republication can therefore get the new label. It does not prove which revision the visitor previously saw. Exact served-revision history would require immutable/verifiable revisions and a separate publication/storage design. No such migration is performed here.

CRM detail and search use snapshot labels with a legacy fallback. CSV keeps existing value columns and appends a label column per key, allowing different historical labels on different rows. Labels remain escaped in HTML and all CSV cells pass through the existing formula-safe serializer.

Metadata is server-derived on public creation; existing tenant-authorized client writes are governed by the unchanged Rules. A separate Rules hardening review is required before claiming metadata is immutable against authorized tenant editors. The snapshot is not used for authorization.

## Validation and review

RED reproduced invalid contacts, destructive error fallback, duplicate dispatch and missing historical labels. New unit coverage exercises malformed contacts, name-only compatibility, failure/retry, missing page identity, double submit, structured/absent/ambiguous schema, removed fields, metadata spoof, foreign-tenant blocks, inherited keys and HTML injection. Emulator coverage exercises real transactions, concurrent idempotency, rename, legacy records, unpublish/delete and tenant mismatch.

No production data, fixture, secret, IAM, Storage Rules, indexes, App Check enforcement or WhatsApp code changes. Only a future explicit deployment of `functions:createPublicLead` and a separately approved Pages publication are relevant to this PR. No merge/deploy/smoke/cleanup is authorized by this document.

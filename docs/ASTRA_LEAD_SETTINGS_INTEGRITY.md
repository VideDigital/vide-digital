# CRM lead integrity and shared SLA

This branch addresses CRM-LEAD-010 and CRM-LEAD-012. Lead client writes now use an explicit top-level field allowlist and validate critical text, numeric, map and boolean fields. Updates inspect only affected keys so unrelated malformed historical fields remain editable. Existing owner, module, customer and responsible-user checks remain in effect. This is not a complete nested schema or a status-enum migration; Admin SDK writes bypass Firestore Rules.

SLA is stored at lead_settings/{ownerUid} as an integer slaMinutes between 5 and 1440. Module viewers can read; module editors can write. Missing configuration defaults to 30 minutes. Old browser preferences are not silently imported. Confirmed remote changes update the interface across browsers; cache-only state pauses automatic overdue priority until server confirmation. Failed saves preserve the last displayed value. Existing per-lead follow-up persistence is unchanged.

Validation: 283 Firestore Emulator tests pass on demo-vide-hub, including malformed writes, legacy updates, tenant isolation and SLA permissions. Seven focused SLA tests pass, including cache confirmation and failed saves. No production access, Rules deployment, index change or Storage Rules change was performed.

Release order for approval: merge reviewed PRs only after their final checks; deploy these Firestore Rules before publishing the shared-SLA frontend. Earlier frontend continues working with these Rules. Validate an owner/editor/viewer and two browsers in an approved smoke session. Do not run production smoke or remove existing fixtures without explicit authorization. If rollback is needed, restore the previous frontend first; review any Rules rollback independently.

Independent review found dashboard timeline/template/follow-up timestamp fields missing from the initial allowlist. The regression was reproduced with denied writes and fixed with representative current-writer payloads. Initial read failure, teardown during pending reads and terminal listener errors now have lifecycle regression coverage.

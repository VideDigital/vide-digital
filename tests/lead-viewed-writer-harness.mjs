import { readFileSync } from "node:fs";

// Execute the actual browser writers, including their batch persistence path.
// Only environment dependencies are supplied by the unit/Emulator caller.
const source = readFileSync(new URL("../lead-engine-v5.js", import.meta.url), "utf8");
function section(start, end) {
    const first = source.indexOf(start);
    const last = source.indexOf(end, first);
    if (first < 0 || last <= first) throw new Error(`Writer source not found: ${start}`);
    return source.slice(first, last);
}

export function viewedWriterController({ user, actorName = "", leads, db, doc, setDoc, writeBatch }) {
    const state = { user, actorName, ownerUid: "ownerA", canEdit: true, leads, modalOpen: false };
    const bindings = {
        state, db, doc, setDoc, writeBatch, MAX_BATCH_SIZE: 400,
        findLead: id => leads.find(lead => lead.id === id),
        normalizeLead: lead => lead,
        refreshLeadCollections() {}, refreshInboxResults() {},
        saveLastSeen() {}, render() {}, toast() {}
    };
    const code = [
        section("function actorName()", "async function loadAccessContext("),
        section("async function markLeadViewed(", "async function moveLeadStorage("),
        section("async function commitLeadPatches(", "function leadBatchFailureMessage(")
    ].join("\n");
    return new Function(...Object.keys(bindings), `${code}\nreturn { markLeadViewed, markAllRead };`)(...Object.values(bindings));
}

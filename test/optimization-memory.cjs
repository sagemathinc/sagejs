// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { sha256 } = require("../tools/optimizer-development/common.cjs");
const memory = require("../tools/optimization-engine/ledger.cjs");

const id = (name) => `sha256:${sha256(name)}`;

function evidence(name, overrides = {}) {
  const evidenceId = id(`evidence:${name}`);
  return {
    id: evidenceId,
    kind: "performance",
    logicalId: evidenceId,
    path: null,
    uri: `https://example.invalid/immutable/${name}`,
    sha256: sha256(`bytes:${name}`),
    producerCommand: [`node bench/${name}.cjs`],
    roles: ["fallback", "performance"],
    validationStatus: "accepted",
    ...overrides,
  };
}

function record(name, overrides = {}) {
  const receipt = evidence(name, overrides.evidence || {});
  const subjectId = overrides.subjectId || id(`subject:${name}`);
  const payload = {
    authority: {
      kind: overrides.authorityKind || "optimization-outcome-v2",
      producer: "test.optimization-memory",
      validatedInputIds: [id(`outcome:${name}`)],
    },
    subject: {
      id: subjectId,
      scope: "public-call",
      publicOperation: `public.${name}`,
      sourcePath: `src/lib/sagejs/${name}.py`,
      regionId: id(`region:${name}`),
      parentIds: [],
      predecessorIds: [],
    },
    category: overrides.category || "library-route",
    mechanism: overrides.mechanismKey || `route.${name}.v1`,
    interventionId: id(`intervention:${name}`),
    result: {
      outcomeId: id(`outcome:${name}`),
      opportunityId: id(`opportunity:${name}`),
      campaignId: id(`campaign:${name}`),
      promotionId: id(`promotion:${name}`),
      disposition: overrides.disposition || "accepted",
      regressionState: overrides.regressionState || "passing",
      reasons: [overrides.reason || "Reviewed outcome"],
    },
    binding: {
      epochId: id(`epoch:${name}`),
      sourceClosureId: overrides.sourceClosureId || id("source:current"),
      workloadIds: [id("workload:current")],
      compatibleSourceClosureIds: overrides.compatibleSourceClosureIds || [],
      revision: {
        commit: overrides.commit || "1".repeat(40),
        tree: overrides.tree || "2".repeat(40),
      },
    },
    evidence: [receipt],
    fallbackEvidenceIds: overrides.disposition && overrides.disposition !== "accepted"
      ? [] : [receipt.id],
    supersedesIds: [],
  };
  return memory.createRecord(payload);
}

function context(overrides = {}) {
  const subjectId = overrides.subjectId || id("subject:accepted");
  return memory.createContext({
    sourceClosureId: overrides.sourceClosureId || id("source:current"),
    workloadIds: overrides.workloadIds || [id("workload:current")],
    opportunityIds: overrides.opportunityIds || [id("opportunity:accepted")],
    subjects: overrides.subjects || [{ id: subjectId, predecessorIds: [] }],
  });
}

test("memory records are exact content-addressed v2 contracts", () => {
  const value = record("accepted");
  assert.equal(memory.validateRecord(value).id, value.id);
  assert.throws(
    () => memory.validateRecord({ ...value, inventedAuthority: true }),
    /fields must be exactly/,
  );
  assert.throws(
    () => memory.validateRecord({ ...value, id: id("counterfeit") }),
    /is stale/,
  );
});

test("actionability uses explicit closures, workloads, and subject lineage", () => {
  const accepted = record("accepted", { commit: "f".repeat(40), tree: "e".repeat(40) });
  const current = context({ subjectId: accepted.subject.id });
  assert.deepEqual(
    memory.evaluateRecord(accepted, current),
    {
      record: accepted,
      bindingState: "current",
      actionable: true,
      sourceDescendantIds: [accepted.subject.id],
      provenanceProblems: [],
    },
  );

  const successorId = id("subject:accepted-successor");
  const compatible = memory.createContext({
    sourceClosureId: id("source:compatible"),
    workloadIds: accepted.binding.workloadIds,
    opportunityIds: [accepted.result.opportunityId],
    subjects: [{ id: successorId, predecessorIds: [accepted.subject.id] }],
  });
  const { schema: _schema, id: _id, ...acceptedPayload } = accepted;
  const reviewedCompatibility = memory.createRecord({
    ...acceptedPayload,
    authority: accepted.authority,
    subject: accepted.subject,
    result: accepted.result,
    binding: {
      ...accepted.binding,
      compatibleSourceClosureIds: [compatible.sourceClosureId],
    },
    evidence: accepted.evidence,
    fallbackEvidenceIds: accepted.fallbackEvidenceIds,
    supersedesIds: accepted.supersedesIds,
  });
  assert.equal(
    memory.evaluateRecord(reviewedCompatibility, compatible).bindingState,
    "predecessor-compatible",
  );
  const stale = context({ sourceClosureId: id("source:unreviewed"), subjectId: accepted.subject.id });
  assert.equal(memory.evaluateRecord(accepted, stale).bindingState, "historical");
  assert.equal(memory.evaluateRecord(accepted, stale).actionable, false);
});

test("missing producer provenance is visible but invalid", () => {
  const invalid = record("invalid", {
    disposition: "rejected",
    evidence: { logicalId: null, sha256: null, producerCommand: [] },
  });
  const evaluated = memory.evaluateRecord(invalid, context({ subjectId: invalid.subject.id }));
  assert.equal(evaluated.bindingState, "invalid");
  assert.equal(evaluated.actionable, false);
  assert.match(evaluated.provenanceProblems.join("\n"), /missing producer provenance/);
});

test("a proposed exact mechanism links prior negative evidence including stale results", () => {
  const subjectId = id("subject:proposal");
  const negative = record("negative", {
    subjectId,
    disposition: "rejected",
    mechanismKey: "flint.route.integral.v1",
  });
  const unrelated = record("unrelated", {
    subjectId,
    disposition: "rejected",
    mechanismKey: "different.route.v1",
  });
  const staleContext = context({ sourceClosureId: id("later-source"), subjectId });
  const links = memory.linkPriorEvidence({
    subjectIds: [subjectId],
    category: "library-route",
    mechanismKey: "flint.route.integral.v1",
  }, [unrelated, negative], staleContext);
  assert.equal(links.length, 1);
  assert.equal(links[0].record.id, negative.id);
  assert.equal(links[0].bindingState, "historical");
  assert.equal(links[0].actionable, false);
});

test("reports expose accepted descendants and alert on lost subjects, fallbacks, and regressions", () => {
  const accepted = record("report", { regressionState: "regressed" });
  const successorId = id("subject:report-successor");
  const withSuccessor = memory.createContext({
    sourceClosureId: accepted.binding.sourceClosureId,
    workloadIds: accepted.binding.workloadIds,
    opportunityIds: [accepted.result.opportunityId],
    subjects: [{ id: successorId, predecessorIds: [accepted.subject.id] }],
  });
  const report = memory.buildReport([accepted], withSuccessor);
  assert.deepEqual(report.entries[0].sourceDescendantIds, [successorId]);
  assert.deepEqual(report.alerts.map((alert) => alert.code), ["accepted-outcome-regressed"]);

  const missingFallback = record("missing", {
    evidence: { validationStatus: "missing" },
  });
  const missingContext = memory.createContext({
    sourceClosureId: missingFallback.binding.sourceClosureId,
    workloadIds: missingFallback.binding.workloadIds,
    opportunityIds: [],
    subjects: [],
  });
  assert.deepEqual(
    memory.buildReport([missingFallback], missingContext).alerts.map((alert) => alert.code),
    [
      "accepted-fallback-disappeared",
      "accepted-opportunity-disappeared",
      "accepted-subject-disappeared",
    ],
  );
});

test("Campaign 1 anchor validates exact checked evidence and remains historical", () => {
  const directory = path.join(__dirname, "..", "architecture", "optimization-engine", "memory");
  const anchor = memory.validateRecord(JSON.parse(fs.readFileSync(
    path.join(directory, "campaign-1-arrow.json"), "utf8",
  )));
  const frozen = memory.validateContext(JSON.parse(fs.readFileSync(
    path.join(directory, "current-context.json"), "utf8",
  )));
  const report = memory.buildReport(memory.loadRecords([directory]), frozen, {
    repositoryRoot: path.join(__dirname, ".."),
  });
  const anchorEntry = report.entries.find((entry) => entry.recordId === anchor.id);
  assert.ok(anchorEntry);
  assert.equal(anchorEntry.bindingState, "historical");
  assert.equal(anchorEntry.actionable, false);
  assert.deepEqual(anchorEntry.provenanceProblems, []);
  assert.equal(JSON.stringify(report), JSON.stringify(JSON.parse(fs.readFileSync(
    path.join(directory, "current-memory.json"), "utf8",
  ))));
});

test("canonical NDJSON and derived SQLite retain one logical ledger", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-memory-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const records = [record("zeta"), record("alpha", { disposition: "rejected" })];
  const manifest = memory.writeLedger(directory, records);
  const databaseAsset = manifest.assets.find((asset) =>
    asset.kind === "sqlite-query-database");
  const compressed = fs.readFileSync(path.join(directory, databaseAsset.name));
  const sqlite = path.join(directory, "query.sqlite");
  fs.writeFileSync(sqlite, require("node:zlib").gunzipSync(compressed));
  assert.deepEqual(
    memory.queryDatabase(sqlite, { disposition: "rejected" }).map((item) => item.id),
    [records[1].id],
  );
  assert.equal(memory.recordsFromDatabase(sqlite).length, 2);
});

test("query CLI filters the derived SQLite view", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-memory-cli-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const manifest = memory.writeLedger(path.join(directory, "store"), [record("cli")]);
  const asset = manifest.assets.find((item) => item.kind === "sqlite-query-database");
  const sqlite = path.join(directory, "memory.sqlite");
  fs.writeFileSync(sqlite, require("node:zlib").gunzipSync(
    fs.readFileSync(path.join(directory, "store", asset.name)),
  ));
  const child = spawnSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "optimization-memory.cjs"),
    "query", `--database=${sqlite}`, "--category=library-route",
  ], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).length, 1);
});

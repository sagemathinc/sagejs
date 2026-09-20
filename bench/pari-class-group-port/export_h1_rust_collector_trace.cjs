"use strict";

// Export an oracle-only event trace of the H1 small-norm collector.  This is
// deliberately a CPython diagnostic replay of the same translated source,
// with wrappers around existing functions; no mathematical routine is
// replaced.  Nothing in this file is a permitted Rust timing input.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const adapter = require("./h1_unified_complete_adapter.cjs");
const { sanitizePreparedInput } = require("./h1_outcome_c_adapter.cjs");

const PYTHON_TRACE = String.raw`
import functools
import importlib
import inspect
import json
import math
import decimal
import sys

sys.set_int_max_str_digits(1000000)
sys.path[:0] = sys.argv[1:3]
request = json.load(sys.stdin)

resident = importlib.import_module(
    "bench.pari-class-group-port.resident_generated_class_attempt"
)
ideal_collector = importlib.import_module(
    "bench.pari-class-group-port.ideal_collector"
)
relation_insertion = importlib.import_module(
    "bench.pari-class-group-port.relation_insertion"
)
smooth_relation = importlib.import_module(
    "bench.pari-class-group-port.smooth_relation"
)
unreduced_small_norm = importlib.import_module(
    "bench.pari-class-group-port.unreduced_small_norm"
)

original_next = ideal_collector.pari_next_smooth_candidate
original_insert = ideal_collector.pari_insert_smooth_relation
original_set_fact = smooth_relation.pari_prepared_set_fact
original_unreduced = unreduced_small_norm.pari_collect_unreduced_ideal
next_signature = inspect.signature(original_next)
insert_signature = inspect.signature(original_insert)
set_fact_signature = inspect.signature(original_set_fact)
unreduced_signature = inspect.signature(original_unreduced)

admissions = []
ideal_deltas = []
pending = None


def integers(values):
    return [int(value) for value in values]


@functools.wraps(original_next)
def traced_next(*args, **kwargs):
    global pending
    bound = next_signature.bind(*args, **kwargs)
    result = original_next(*args, **kwargs)
    if result == 1:
        assert pending is None
        count = int(bound.arguments["counters"][2])
        candidate = integers(bound.arguments["element"])
        content = 0
        for coordinate in candidate:
            content = math.gcd(content, coordinate)
        pending = {
            "sequence": len(admissions),
            "candidateGeneratorCoordinates": candidate,
            "candidateContent": content,
            "factorgenIndices": integers(
                bound.arguments["admission_indices"][:count]
            ),
            "factorgenExponents": integers(
                bound.arguments["admission_exponents"][:count]
            ),
            "factorgenCount": count,
            "admissionDiagnostic": integers(bound.arguments["diagnostic"][:3]),
            "factorAttempts": int(bound.arguments["counters"][0]),
            "smallCandidateCount": int(bound.arguments["counters"][1]),
        }
    return result


@functools.wraps(original_set_fact)
def traced_set_fact(*args, **kwargs):
    bound = set_fact_signature.bind(*args, **kwargs)
    nz = original_set_fact(*args, **kwargs)
    assert pending is not None
    assert "rawRelation" not in pending
    pending["rawRelation"] = integers(bound.arguments["relation"])
    pending["rawFirstNonzero"] = int(nz)
    return nz


@functools.wraps(original_insert)
def traced_insert(*args, **kwargs):
    global pending
    bound = insert_signature.bind(*args, **kwargs)
    assert pending is not None
    state = bound.arguments["state"]
    progress = bound.arguments["progress"]
    relation_count_before = int(state[0])
    progress_before = integers(progress)
    status, appended, nz, updated_count = original_insert(*args, **kwargs)
    assert pending["rawFirstNonzero"] == int(nz)
    degree = len(bound.arguments["candidate"])
    event = pending
    event.update({
        "packetId": int(bound.arguments["jid"]),
        "distinguishedPacketId": int(bound.arguments["jid0"]),
        "distinguishedExponent": int(bound.arguments["e0"]),
        "normalizedGeneratorCoordinates": integers(bound.arguments["candidate"]),
        "normalizedFactorCount": int(updated_count),
        "normalizedFactorIndices": integers(
            bound.arguments["indices"][:updated_count]
        ),
        "normalizedFactorExponents": integers(
            bound.arguments["exponents"][:updated_count]
        ),
        "finalRelation": integers(bound.arguments["relation"]),
        "firstNonzero": int(nz),
        "cacheStatus": int(status),
        "appended": int(appended),
        "relationCountBefore": relation_count_before,
        "relationCountAfter": int(state[0]),
        "progressBefore": progress_before,
        "progressAfter": integers(progress),
    })
    if appended:
        row = relation_count_before
        rows = len(bound.arguments["relation"])
        event["appendedRecord"] = integers(
            bound.arguments["records"][row * rows : (row + 1) * rows]
        )
        event["appendedMetadata"] = integers(
            bound.arguments["metadata"][row * 3 : (row + 1) * 3]
        )
        event["appendedGenerator"] = integers(
            bound.arguments["generators"][row * degree : (row + 1) * degree]
        )
        assert event["appendedRecord"] == event["finalRelation"]
        assert event["appendedGenerator"] == event["normalizedGeneratorCoordinates"]
    admissions.append(event)
    pending = None
    return status, appended, nz, updated_count


@functools.wraps(original_unreduced)
def traced_unreduced(*args, **kwargs):
    bound = unreduced_signature.bind(*args, **kwargs)
    admission_start = len(admissions)
    relation_before = int(bound.arguments["relation_state"][0])
    relation_state_before = integers(bound.arguments["relation_state"])
    basis_before = integers(bound.arguments["relation_basis"])
    counters_before = integers(bound.arguments["counters"])
    progress_before = integers(bound.arguments["progress"])
    status = original_unreduced(*args, **kwargs)
    admission_end = len(admissions)
    events = admissions[admission_start:admission_end]
    basis_after = integers(bound.arguments["relation_basis"])
    basis_delta = [
        {"index": index, "before": before, "after": after}
        for index, (before, after) in enumerate(zip(basis_before, basis_after))
        if before != after
    ]
    ideal_deltas.append({
        "sequence": len(ideal_deltas),
        "packetId": int(bound.arguments["jid"]),
        "idealNorm": int(bound.arguments["admission_ideal_norm"]),
        "admissionStart": admission_start,
        "admissionEnd": admission_end,
        "acceptedSmoothCandidates": admission_end - admission_start,
        "appendedRelations": sum(event["appended"] for event in events),
        "positiveCacheStatuses": sum(
            1 for event in events if event["cacheStatus"] > 0
        ),
        "relationCountBefore": relation_before,
        "relationCountAfter": int(bound.arguments["relation_state"][0]),
        "relationStateBefore": relation_state_before,
        "relationStateAfter": integers(bound.arguments["relation_state"]),
        "relationBasisDelta": basis_delta,
        "countersBefore": counters_before,
        "countersAfter": integers(bound.arguments["counters"]),
        "progressBefore": progress_before,
        "progressAfter": integers(bound.arguments["progress"]),
        "collectorStatus": int(status),
    })
    return status


ideal_collector.pari_next_smooth_candidate = traced_next
ideal_collector.pari_insert_smooth_relation = traced_insert
smooth_relation.pari_prepared_set_fact = traced_set_fact
unreduced_small_norm.pari_collect_unreduced_ideal = traced_unreduced

values = {}
for name, kind in request["names"]:
    value = request["input"][name]
    if kind in ("float", "Float64Buffer"):
        convert = float
    elif kind == "bool":
        convert = bool
    else:
        convert = int
    values[name] = [convert(item) for item in value] if isinstance(value, list) else convert(value)

status = resident.pari_resident_generated_class_attempt(**values)
assert pending is None
assert status == 0
assert values["attempt_state"][:4] == [4, 0, 0, 1]
assert values["class_number"][0] == 1
assert values["relation_state"][0] == 73
assert len(admissions) == 96, len(admissions)
assert sum(event["appended"] for event in admissions) == 61
assert sum(delta["appendedRelations"] for delta in ideal_deltas) == 61
assert sum(delta["acceptedSmoothCandidates"] for delta in ideal_deltas) == 96
assert all(event["packetId"] > 0 for event in admissions)
assert all(
    event["relationCountAfter"] - event["relationCountBefore"]
    == event["appended"]
    for event in admissions
)

print(json.dumps({
    "status": status,
    "attemptState": integers(values["attempt_state"][:4]),
    "classNumber": str(values["class_number"][0]),
    "initialRelations": 12,
    "terminalRelations": int(values["relation_state"][0]),
    "terminalRelationRecords": integers(
        values["relation_records"][: values["relation_state"][0] * 66]
    ),
    "admissions": admissions,
    "idealDeltas": ideal_deltas,
}, separators=(",", ":")))
`;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  );
  return value;
}

function digest(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function runPython(preparedInput) {
  const root = path.resolve(__dirname, "../..");
  const library = path.resolve(root, "src/lib");
  const result = spawnSync("python3", ["-c", PYTHON_TRACE, root, library], {
    cwd: root,
    input: JSON.stringify({
      names: preparedInput.names,
      input: preparedInput.input,
    }),
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}

function validateTrace(trace) {
  assert.equal(trace.status, 0);
  assert.deepEqual(trace.attemptState, [4, 0, 0, 1]);
  assert.equal(trace.classNumber, "1");
  assert.equal(trace.initialRelations, 12);
  assert.equal(trace.terminalRelations, 73);
  assert.equal(trace.admissions.length, 96);
  assert.equal(trace.admissions.reduce((sum, event) => sum + event.appended, 0), 61);
  assert.equal(trace.idealDeltas.reduce(
    (sum, delta) => sum + delta.acceptedSmoothCandidates, 0), 96);
  assert.equal(trace.idealDeltas.reduce(
    (sum, delta) => sum + delta.appendedRelations, 0), 61);
  for (const [index, event] of trace.admissions.entries()) {
    assert.equal(event.sequence, index);
    assert.equal(event.candidateGeneratorCoordinates.length, 3);
    assert.equal(event.normalizedGeneratorCoordinates.length, 3);
    assert.equal(event.rawRelation.length, 66);
    assert.equal(event.finalRelation.length, 66);
    assert.equal(event.relationCountAfter - event.relationCountBefore,
      event.appended);
    assert.equal(event.packetId > 0, true);
    assert.equal(event.rawFirstNonzero, event.firstNonzero);
    assert.equal(event.normalizedFactorIndices.length,
      event.normalizedFactorCount);
    assert.equal(event.normalizedFactorExponents.length,
      event.normalizedFactorCount);
    if (event.appended) {
      assert.deepEqual(event.appendedRecord, event.finalRelation);
      assert.deepEqual(event.appendedGenerator,
        event.normalizedGeneratorCoordinates);
    }
  }
}

function main() {
  const inputPath = path.resolve(process.argv[2] ?? "");
  const outputPath = path.resolve(process.argv[3] ?? "");
  assert(inputPath && outputPath,
    "usage: node export_h1_rust_collector_trace.cjs INPUT.json OUTPUT.json");
  const inputBytes = fs.readFileSync(inputPath);
  const rawInput = JSON.parse(inputBytes);
  const residentPath = path.join(__dirname, "resident_generated_class_attempt.py");
  const residentSource = fs.readFileSync(residentPath, "utf8");
  const sanitized = sanitizePreparedInput(rawInput, residentSource);
  const preparedInput = sanitized.record;
  const trace = runPython(preparedInput);
  validateTrace(trace);

  const oracleOnly = {
    excludedFromTimedInput: true,
    warning: "Diagnostic oracle only. Supplying any event or delta to the timed Rust collector invalidates the benchmark.",
    acceptedSmoothCandidates: trace.admissions,
    perIdealCollectorDeltas: trace.idealDeltas,
    terminalRelationRecords: trace.terminalRelationRecords,
  };
  const record = {
    schema: "sagejs.pari-class-group/h1-rust-collector-trace-v1",
    fieldId: adapter.FIELD_ID,
    polynomialAscending: ["20034", "-20018", "0", "1"],
    sourcePreparedEnvelopeSha256: sha256(inputBytes),
    sourcePreparedValueSha256: adapter.digest(preparedInput),
    traceImplementation: {
      runtime: "CPython",
      mathematicalSource: "translated ordinary Python",
      residentSourceSha256: sha256(residentSource),
      exporterSourceSha256: sha256(fs.readFileSync(__filename)),
      monkeypatchScope: "observation wrappers only",
    },
    summary: {
      acceptedSmoothCandidates: trace.admissions.length,
      appendedRelations: trace.admissions.reduce(
        (sum, event) => sum + event.appended, 0),
      perIdealInvocations: trace.idealDeltas.length,
      initialRelations: trace.initialRelations,
      terminalRelations: trace.terminalRelations,
      admissionsSha256: digest(trace.admissions),
      perIdealDeltasSha256: digest(trace.idealDeltas),
      // Match the phase-checkpoint convention: exact integer owners are
      // canonical decimal strings before hashing.
      terminalPresentationSha256: digest(
        trace.terminalRelationRecords.map(String)),
    },
    terminal: {
      status: trace.status,
      attemptState: trace.attemptState,
      classNumber: trace.classNumber,
    },
    oracleOnly,
  };
  assert.equal(record.summary.terminalPresentationSha256,
    "861b98fac666e49af511a6c08cca2591d2d37bdb99d76904168b84bb72b9da52",
    "collector trace diverged from the authenticated phase checkpoint");
  record.authoritySha256 = digest(record);
  const encoded = `${JSON.stringify(record)}\n`;
  fs.writeFileSync(outputPath, encoded);
  process.stdout.write(`${JSON.stringify({
    outputPath,
    bytes: Buffer.byteLength(encoded),
    sha256: sha256(encoded),
    authoritySha256: record.authoritySha256,
    ...record.summary,
  })}\n`);
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}

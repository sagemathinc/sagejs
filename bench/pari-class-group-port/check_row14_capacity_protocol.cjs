#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../../tools/native-kernel/ir.cjs");
const { generateJavaScript } = require("../../tools/native-kernel/js-backend.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "relation_owner_capacity.py");
const defaultPayload = "/scratch/sagejs-pari-development-panel-a998/panel-14-aa0aa6152d8cf26c.json";
const payloadPath = path.resolve(process.argv[2] || defaultPayload);
const digest = value => createHash("sha256").update(value).digest("hex");
const canonicalDigest = value => digest(JSON.stringify(value));
const PAYLOAD_SHA256 = "13f7e37fe4ba3c610e2c4340c243fa9da398b8d32a272b3c450525c287afe18a";
const PREPARED_SHA256 = "66acb1a0be37d798bbf4d72459505b52a2d59ced3914246617d775359fc419cb";
const EVENTS_SHA256 = "ed6426cbb8e8525864ff4910f3a6e1c7abecd406f9a53464bc7e1e1042305ad3";
const TERMINAL_SHA256 = "77192dc76e34f30ad3c61eeb89b3f243fb0bfa17f96c3037d8bde374f1579920";

function expected(rows, degree, places, target, reserve, append, passes, stage) {
  const width = 7 * places;
  const out = [1, stage, rows, degree, places, target, reserve, 6, rows * rows,
    rows * reserve, reserve, 3 * reserve, rows, rows, degree * reserve, 1,
    width * target, degree, width, rows, 19, rows, rows, rows, rows, rows,
    rows * append, width * append, rows, 8, 5 * passes, 0];
  out[31] = out.slice(7, 31).reduce((a, b) => a + b, 0);
  return out;
}

async function javascriptApi(source) {
  const ir = await lowerSource(source, sourcePath);
  const modulePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row14-capacity-js-")), "kernel.cjs");
  fs.writeFileSync(modulePath, generateJavaScript(ir, { sourcePath }));
  const api = require(modulePath);
  return { report: api.pari_relation_capacity_report,
    sufficient: api.pari_relation_capacity_sufficient, backend: "javascript" };
}

function call(api, fn, arguments_) {
  return api.backend === "javascript" ? fn(...arguments_) : fn[api.backend](...arguments_);
}

function int64(api, length, sentinel = 0n) {
  const values = Array(length).fill(sentinel);
  return api.backend === "javascript" ? values : api.report.createInt64Buffer(values);
}

function integer(api, length) {
  return api.backend === "javascript" ? Array(length).fill(0n) : api.report.createIntegerBuffer(length, 1);
}

const ownerSpecification = [
  ["relation_state", 7, "integer"], ["relation_basis", 8, "integer"],
  ["relation_records", 9, "integer"], ["relation_hashes", 10, "integer"],
  ["relation_metadata", 11, "integer"], ["relation", 12, "integer"],
  ["relation_scratch", 13, "integer"], ["generators", 14, "integer"],
  ["log_completed", 15, "integer"], ["log_embeddings", 16, "integer"],
  ["log_coordinates", 17, "integer"], ["log_column", 18, "integer"],
  ["search_ideals", 19, "integer"], ["outer_state", 20, "int64"],
  ["outer_minidx", 21, "integer"], ["outer_present", 22, "integer"],
  ["outer_live", 23, "integer"], ["outer_perm", 24, "integer"],
  ["outer_multiplier", 25, "integer"], ["append_new_relations", 26, "int64"],
  ["append_new_logs", 27, "integer"], ["class_invariants", 28, "integer"],
  ["driver_state", 29, "int64"], ["driver_trace", 30, "int64"],
];

function makeOwners(api, requirements) {
  return Object.fromEntries(ownerSpecification.map(([name, slot, kind]) =>
    [name, kind === "integer" ? integer(api, requirements[slot]) : int64(api, requirements[slot])]));
}

function sufficientArguments(rows, degree, places, target, reserve, append, passes, owners) {
  return [BigInt(rows), BigInt(degree), BigInt(places), BigInt(target), BigInt(reserve),
    BigInt(append), BigInt(passes), ...ownerSpecification.map(([name]) => owners[name])];
}

function ownerDigest(owner) {
  const h = createHash("sha256");
  if (Array.isArray(owner)) {
    for (let i = 0; i < owner.length; i += 4096) h.update(owner.slice(i, i + 4096).join(","));
  } else if (owner.sizes && owner.limbs) {
    for (const values of [owner.sizes, owner.limbs])
      h.update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
  } else h.update(new Uint8Array(owner.buffer, owner.byteOffset, owner.byteLength));
  return h.digest("hex");
}

function checkReport(api, dimensions) {
  const { rows, degree, places, target, reserve, append, passes, stage } = dimensions;
  const output = int64(api, 32, 77n);
  const status = call(api, api.report, [BigInt(rows), BigInt(degree), BigInt(places),
    BigInt(target), BigInt(reserve), BigInt(append), BigInt(passes), BigInt(stage), output]);
  assert.equal(status, BigInt(reserve), `${api.backend}: report status`);
  const actual = Array.from(output, Number);
  assert.deepEqual(actual, expected(rows, degree, places, target, reserve, append, passes, stage),
    `${api.backend}: exact report`);
  return actual;
}

function checkOneSlotShort(api, dimensions, requirements) {
  const { rows, degree, places, target, reserve, append, passes } = dimensions;
  const owners = makeOwners(api, requirements);
  const before = Object.fromEntries(ownerSpecification.map(([name]) => [name, ownerDigest(owners[name])]));
  assert.equal(call(api, api.sufficient,
    sufficientArguments(rows, degree, places, target, reserve, append, passes, owners)), 1n,
  `${api.backend}: exact owners`);
  for (const [name, slot, kind] of ownerSpecification) {
    if (requirements[slot] === 0) continue;
    const short = { ...owners };
    short[name] = kind === "integer" ? integer(api, requirements[slot] - 1)
      : int64(api, requirements[slot] - 1);
    assert.equal(call(api, api.sufficient,
      sufficientArguments(rows, degree, places, target, reserve, append, passes, short)), 0n,
    `${api.backend}: ${name} one-slot-short`);
  }
  const after = Object.fromEntries(ownerSpecification.map(([name]) => [name, ownerDigest(owners[name])]));
  assert.deepEqual(after, before, `${api.backend}: preflight mutated retained owners`);
}

function checkCpython(dimensions, requirements) {
  const script = String.raw`
import importlib
import json
import sys

sys.path[:0] = [sys.argv[1], sys.argv[1] + "/src/lib"]
module = importlib.import_module("bench.pari-class-group-port.relation_owner_capacity")
rows, degree, places, target, reserve, append, passes, stage = map(int, sys.argv[2:])
report = [77] * 32
status = module.pari_relation_capacity_report(
    rows, degree, places, target, reserve, append, passes, stage, report
)
slots = [
    ("relation_state", 7), ("relation_basis", 8),
    ("relation_records", 9), ("relation_hashes", 10),
    ("relation_metadata", 11), ("relation", 12),
    ("relation_scratch", 13), ("generators", 14),
    ("log_completed", 15), ("log_embeddings", 16),
    ("log_coordinates", 17), ("log_column", 18),
    ("search_ideals", 19), ("outer_state", 20),
    ("outer_minidx", 21), ("outer_present", 22),
    ("outer_live", 23), ("outer_perm", 24),
    ("outer_multiplier", 25), ("append_new_relations", 26),
    ("append_new_logs", 27), ("class_invariants", 28),
    ("driver_state", 29), ("driver_trace", 30),
]
owners = {name: [0] * report[slot] for name, slot in slots}
arguments = [rows, degree, places, target, reserve, append, passes]
arguments += [owners[name] for name, _ in slots]
before = {name: tuple(values) for name, values in owners.items()}
exact = module.pari_relation_capacity_sufficient(*arguments)
short = {}
for index, (name, slot) in enumerate(slots):
    if report[slot] == 0:
        continue
    trial = list(arguments)
    trial[7 + index] = [0] * (report[slot] - 1)
    short[name] = module.pari_relation_capacity_sufficient(*trial)
unchanged = before == {name: tuple(values) for name, values in owners.items()}
print(json.dumps({
    "status": status, "report": report, "exact": exact,
    "short": short, "unchanged": unchanged,
}, sort_keys=True))
`;
  const arguments_ = ["-c", script, root, dimensions.rows, dimensions.degree,
    dimensions.places, dimensions.target, dimensions.reserve, dimensions.append,
    dimensions.passes, dimensions.stage].map(String);
  const run = spawnSync("python3", arguments_, { encoding: "utf8", maxBuffer: 1024 * 1024 });
  assert.equal(run.status, 0, `cpython execution failed: ${run.stderr}`);
  const result = JSON.parse(run.stdout);
  assert.equal(result.status, dimensions.reserve, "cpython: report status");
  assert.deepEqual(result.report, requirements, "cpython: exact report");
  assert.equal(result.exact, 1, "cpython: exact owners");
  assert(Object.values(result.short).every(value => value === 0),
    "cpython: one-slot-short owner accepted");
  assert.equal(result.unchanged, true, "cpython: preflight mutated retained owners");
}

async function main() {
  const payloadBytes = fs.readFileSync(payloadPath);
  assert.equal(digest(payloadBytes), PAYLOAD_SHA256, "row-14 payload drift");
  const payload = JSON.parse(payloadBytes);
  assert.equal(payload.field.id,
    "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413");
  assert.deepEqual(payload.field.coefficients, ["-200000002", "-200000002", "0", "0", "1"]);
  assert.equal(canonicalDigest(payload.prepared), PREPARED_SHA256, "prepared boundary drift");
  assert.equal(canonicalDigest(payload.events), EVENTS_SHA256, "event trace drift");
  assert.equal(canonicalDigest(payload.events.at(-1)), TERMINAL_SHA256, "terminal trace drift");
  assert.equal(payload.events.length, 5397);
  const factorBase = payload.events.find(event => event.event === "factor_base");
  const initialized = payload.events.find(event => event.event === "initialized");
  assert(factorBase && initialized);
  const rows = factorBase.KC, degree = payload.prepared.degree;
  const places = (degree + payload.prepared.signature[0]) / 2;
  const additional = initialized.target - rows;
  assert(additional > 0, "trace does not expose a positive source add_need");
  const target = rows + additional;
  const reserve = 10 * target + 50;
  const passes = payload.events.filter(event => event.event === "collection_pass").length;
  const dimensions = { rows, degree, places, target, reserve, append: 0, passes, stage: 1 };

  const source = fs.readFileSync(sourcePath, "utf8");
  const javascript = await javascriptApi(source);
  const jsRequirements = checkReport(javascript, dimensions);
  checkCpython(dimensions, jsRequirements);
  // Exhaustive no-write checking on several bounded, answer-independent shapes.
  for (const shape of [[3, 3, 2, 5, 100, 0, 1], [7, 4, 3, 11, 160, 2, 4],
    [31, 4, 3, 39, 440, 7, 8]]) {
    const d = { rows: shape[0], degree: shape[1], places: shape[2], target: shape[3],
      reserve: shape[4], append: shape[5], passes: shape[6], stage: shape[5] ? 3 : 1 };
    checkOneSlotShort(javascript, d, checkReport(javascript, d));
  }

  const built = await compileKernel({ sourcePath });
  const module = require(built.modulePath);
  for (const backend of ["gmp", "tagged"]) {
    const api = { report: module.pari_relation_capacity_report,
      sufficient: module.pari_relation_capacity_sufficient, backend };
    const requirements = checkReport(api, dimensions);
    checkOneSlotShort(api, dimensions, requirements);
  }

  // The trace is an output oracle only. These progression reports are computed
  // from live-prefix scalars and checked against, never supplied by, its answers.
  const progression = payload.events.filter(event => event.event === "small_norm_before")
    .map((event, index) => {
      const need = event.target - event.relations;
      const required = event.relations + need + 1;
      const d = { rows, degree, places, target: required, reserve: 2 * required,
        append: need, passes, stage: 2 };
      const report = checkReport(javascript, d);
      return { index, relations: event.relations, need, requiredReserve: report[6] };
    });
  assert.equal(jsRequirements[6], reserve);
  console.log(JSON.stringify({ ok: true, field: payload.field.id,
    oracle: { payload: PAYLOAD_SHA256, prepared: PREPARED_SHA256,
      events: EVENTS_SHA256, terminal: TERMINAL_SHA256, count: payload.events.length },
    derived: { rows, degree, places, additional, target, reserve, passes },
    row14Requirements: jsRequirements, progression,
    backends: ["cpython", "javascript", "gmp", "tagged"],
    ownerFailureContract: "entry miss publishes capacity_state only; later stage misses require discarding private scratch and restarting from authenticated prepared nfinit",
    coreSha256: digest(fs.readFileSync(built.coreSourcePath)), cacheKey: built.cacheKey }));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

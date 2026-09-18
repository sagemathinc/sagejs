#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { createSage } = require("../../dist/tools/kernel.js");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "pari_unified_complete_h1_root.py");
const rootCheckerPath = path.join(__dirname, "check_pari_unified_complete_h1_root.cjs");
const residentSourcePath = path.join(__dirname, "resident_generated_class_attempt.py");
const residentCheckerPath = path.join(__dirname, "check_resident_generated_class_attempt.cjs");
const bridgeCheckerPath = path.join(__dirname, "check_live_h1_owner_bridge.cjs");

function signature(source, entry) {
  const match = source.match(new RegExp(`def ${entry}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing ${entry} signature`);
  return match[1].trim().split("\n")
    .map(line => line.trim().replace(/,$/, "").split(": "));
}

function literal(source, name, context = {}) {
  const match = source.match(new RegExp(`const ${name} = Object\\.freeze\\((\\{[\\s\\S]*?\\n\\})\\);`));
  assert(match, `missing ${name}`);
  return vm.runInNewContext(`(${match[1]})`, context);
}

function values(value) {
  return Array.isArray(value) ? value
    : value.toArray ? value.toArray() : Array.from(value);
}

function copied(input, name, length) {
  const entries = values(input[name]);
  assert(entries.length >= length, `${name} is shorter than ${length}`);
  return entries.slice(0, length).map(value => String(value));
}

const ownerLengths = Object.freeze({
  final_state: 16, final_polynomial: 4, prep_zk: 9, basis_table: 27,
  packet_ideals: 594, packet_norms: 66, relation_records: 4818,
  generators: 219, hnf_transform: 5329, search_ideals: 66,
  state: 5, inc: 4, cursor_output: 4, relation_hashes: 780,
  relation_metadata: 2340, progress: 4, schedule: 4,
  prep_kummer_random_state: 66, log_embeddings: 1533,
  hnf_matbnew: 120, hnf_full_h: 120, hnf_hnf_transform: 225,
  hnf_result_c: 1533, final_relation_to_presentation: 120,
  final_presentation_to_relation: 120, final_presentation: 64,
  final_smith: 64, final_left: 64, final_left_inverse: 64,
  final_right: 64, final_right_inverse: 64, class_ur_scratch: 64,
  class_y_scratch: 64, class_uir_scratch: 64, class_x_scratch: 64,
  class_m2_scratch: 64, final_compact_provenance: 14,
  precision_getfu_factor: 4, final_retained_relation_map: 146,
  precision_exact_units_integral: 6, final_exact_units: 6,
  final_exact_norms: 2, precision_published_logs: 18,
  precision_published_phases: 6, final_regulator: 3,
  precision_determinant_state: 5, accept_acceptance_state: 3,
  accept_reconstruction_state: 4, attempt_state: 4, unified_state: 12,
  bridge_state: 16, precision_authority_state: 16,
  precision_retry_state: 6, torsion_state: 6, final_torsion_order: 1,
  final_torsion_generator: 3, final_invariants: 8,
});

function copyReplayOwners(replayOwners) {
  assert(replayOwners && typeof replayOwners === "object", "missing replay owners");
  return Object.fromEntries(Object.entries(ownerLengths)
    .map(([name, length]) => [name, copied(replayOwners, name, length)]));
}

async function produceOwners(fixtures) {
  const prepared = spawnSync(process.execPath, [residentCheckerPath, ...fixtures], {
    cwd: root,
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(prepared.status, 0, prepared.stderr || String(prepared.error));
  const receipt = JSON.parse(prepared.stdout.trim().split("\n").at(-1));
  const candidate = JSON.parse(fs.readFileSync(path.join(receipt.directory, "inputs.json"), "utf8")).input;

  const source = fs.readFileSync(sourcePath, "utf8");
  const names = signature(source, "pari_unified_complete_h1_root");
  const residentNames = signature(fs.readFileSync(residentSourcePath, "utf8"),
    "pari_resident_generated_class_attempt");
  assert.deepEqual(names.slice(0, 351), residentNames);

  const rootChecker = fs.readFileSync(rootCheckerPath, "utf8");
  const bridgeChecker = fs.readFileSync(bridgeCheckerPath, "utf8");
  const bridgeLiteral = bridgeChecker.match(/const sizes = (\{[\s\S]*?\n\});/);
  assert(bridgeLiteral, "missing bridge workspace sizes");
  const storagePolicy = literal(rootChecker, "storagePolicy");
  const sizeContext = {
    storagePolicy,
    classSquareCapacity: storagePolicy.classRows ** 2,
    classRelationCapacity: storagePolicy.classRows * storagePolicy.classColumns,
    classTransformCapacity: storagePolicy.classColumns ** 2,
  };
  const sizes = {
    ...vm.runInNewContext(`(${bridgeLiteral[1]})`, { columnCapacity: 16 }),
    ...literal(rootChecker, "classSizes", sizeContext),
    ...literal(rootChecker, "precisionSizes", sizeContext),
    ...literal(rootChecker, "finalSizes", sizeContext),
    unified_state: 12,
  };
  const finalNames = new Set(Object.keys(sizes).filter(name => name.startsWith("final_")));
  const input = {};
  for (const [name, kind] of names) {
    if (Object.hasOwn(candidate, name)) {
      input[name] = structuredClone(candidate[name]);
    } else if (name === "precision_resource_cap") {
      input[name] = 4096n;
    } else {
      assert(Number.isInteger(sizes[name]), `missing size for ${name}`);
      input[name] = Array(sizes[name]).fill(finalNames.has(name) ? 777 : 0);
    }
    if (Array.isArray(input[name])) {
      input[name] = kind === "Float64Buffer"
        ? input[name].map(Number) : input[name].map(BigInt);
    } else if (kind === "float") input[name] = Number(input[name]);
    else if (kind === "bool") input[name] = Boolean(input[name]);
    else input[name] = BigInt(input[name]);
  }
  input.final_state.fill(0n);
  input.precision_authority_state.fill(0n);

  const built = await compileKernel({ sourcePath });
  const fn = require(built.modulePath).pari_unified_complete_h1_root;
  assert(fn.nativeAvailable);
  for (const [name, kind] of names) {
    if (kind === "IntegerBuffer" &&
        (name.startsWith("precision_") || name.startsWith("final_"))) {
      input[name] = fn.createIntegerBuffer(input[name].length, 128, input[name]);
    }
  }
  const status = fn.gmp(...names.map(([name]) => input[name]));
  assert.equal(status, 0n);
  assert.deepEqual(copied(input, "final_state", 16), [
    "0", "0", "0", "0", "0", "0", "73", "8",
    "1", "0", "2", "2", "0", "811", "1", "0",
  ]);

  // This is the only bulk host copy after the native boundary. Every mutable
  // owner needed by the cold verifier is copied into this detached data-only
  // object before any serialization or replay begins.
  const copiedOwners = copyReplayOwners(input);
  return {
    copiedOwners,
    cacheKey: built.cacheKey,
    honestyInput: {
      prep_base_state: copied(input, "prep_base_state", 7),
      prep_state: copied(input, "prep_state", 8),
      attempt_state: copied(input, "attempt_state", 4),
      class_number: copied(input, "class_number", 1),
      class_invariants: copied(input, "class_invariants", 12),
      relation_state: copied(input, "relation_state", 6),
    },
  };
}

async function verifyRegulator(owners) {
  const basis = owners.prep_zk.map(BigInt);
  const integral = owners.final_exact_units.map(BigInt);
  const units = [];
  for (let unit = 0; unit < 2; unit += 1) {
    const row = [];
    for (let power = 0; power < 3; power += 1) {
      let value = 0n;
      for (let column = 0; column < 3; column += 1) {
        value += basis[3 * column + power] * integral[3 * unit + column];
      }
      row.push(String(value));
    }
    units.push(row);
  }
  const fixture = {
    regulator: owners.final_regulator,
    units,
    provenance: [
      owners.final_retained_relation_map.slice(0, 73),
      owners.final_retained_relation_map.slice(73, 146),
    ],
    logs: owners.precision_published_logs,
  };
  const source = fs.readFileSync(path.join(__dirname, "regulator_interval_authority.py"), "utf8");
  const session = await createSage({ mode: "python" });
  try {
    const program = source + String.raw`
import json
fixture=json.loads(${JSON.stringify(JSON.stringify(fixture))})
R=PolynomialRing(QQ,"x");x=R.gen();K=NumberField(x**3-20018*x+20034,"a")
authority=build_live_regulator_interval_authority(
 K,fixture["regulator"],fixture["units"],fixture["provenance"],fixture["logs"])
assert authority["evidence"]["live_regulator_contained"] is True
assert authority["evidence"]["packed_log_matches"] == [True]*6
assert authority["authority"]["public_class_unit_complete"] is False
print(json.dumps({"authoritySha256":authority["authority_sha256"],
 "precisionHistory":authority["evidence"]["precision_history"],
 "rigorous":authority["evidence"]["regulator_enclosure"]["rigorous"],
 "publicComplete":False},sort_keys=True))
`;
    const result = await session.evaluate(program, { filename: "unified-h1-regulator-authority.py" });
    assert.equal(result.stderr || "", "");
    if (result.exitCode !== undefined) assert.equal(result.exitCode, 0);
    return JSON.parse(result.stdout.trim().split("\n").at(-1));
  } finally {
    session.close();
  }
}

function runDetachedReplay(copiedOwners) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-h1-cold-replay-"));
  const ownersPath = path.join(temporary, "owners.json");
  fs.writeFileSync(ownersPath, JSON.stringify(copiedOwners));
  const replay = spawnSync("python3", [path.join(__dirname, "check_unified_h1_terminal_snapshot.py"), ownersPath], {
    cwd: root,
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(replay.status, 0, replay.stderr || String(replay.error));
  return JSON.parse(replay.stdout.trim().split("\n").at(-1));
}

function authenticateFinalPublication(publication) {
  assert(publication && typeof publication === "object", "missing final publication");
  assert.match(publication.resultSha256, /^[0-9a-f]{64}$/);
  const copiedOwners = copyReplayOwners(publication.replayOwners);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-h1-authenticate-"));
  const ownersPath = path.join(temporary, "owners.json");
  fs.writeFileSync(ownersPath, JSON.stringify(copiedOwners));
  const child = spawnSync(process.execPath, [__filename, "--owners", ownersPath], {
    cwd: root,
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  const receipt = JSON.parse(child.stdout.trim().split("\n").at(-1));
  return Object.freeze({
    status: "cold-replay-authenticated",
    resultSha256: publication.resultSha256,
    authoritySha256: receipt.sha256,
  });
}

async function replayOwnersMode(ownersPath) {
  const copiedOwners = JSON.parse(fs.readFileSync(ownersPath, "utf8"));
  const regulatorAuthority = await verifyRegulator(copiedOwners);
  assert.equal(regulatorAuthority.rigorous, true);
  const receipt = runDetachedReplay(copiedOwners);
  console.log(JSON.stringify({ ...receipt, regulatorAuthority }));
}

async function main() {
  const fixtures = process.argv.slice(2, 5);
  assert.equal(fixtures.length, 3, "prepared, analytic and Kummer fixtures required");
  const { copiedOwners, cacheKey } = await produceOwners(fixtures);
  const regulatorAuthority = await verifyRegulator(copiedOwners);
  assert.equal(regulatorAuthority.rigorous, true);
  const receipt = runDetachedReplay(copiedOwners);
  assert.equal(receipt.actualUnifiedPublication, true);
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/unified-h1-terminal-cold-replay-v1",
    field: "x^3-20018*x+20034",
    cacheKey,
    oneBulkHostCopy: true,
    publishedCells: 811,
    coldReplay: true,
    regulatorAuthority,
    publicComplete: false,
    ...receipt,
  }));
}

module.exports = {
  authenticateFinalPublication,
  copyReplayOwners,
  produceOwners,
  runDetachedReplay,
  verifyRegulator,
};

const command = process.argv[2];
const invocation = require.main !== module ? Promise.resolve()
  : command === "--owners" ? replayOwnersMode(process.argv[3]) : main();
invocation.catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

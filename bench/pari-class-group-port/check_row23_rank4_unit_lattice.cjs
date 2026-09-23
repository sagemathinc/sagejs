#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row23_rank4_unit_lattice.py");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-23-c3077e07c31ac758.json";
const W0_SHA256 = "6c4a0b2f5e74d5f156714fad24b0bbf41c8d4998de5bbd046d74c6d8a3930c89";

function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function runProbe(bundle, expected = 0) {
  const script = String.raw`
import importlib,json,sys
sys.path.extend(sys.argv[1:3])
m=importlib.import_module('bench.pari-class-group-port.row23_rank4_unit_lattice')
bundle=json.load(sys.stdin)
json.dump(m.probe_row23_rank4_unit_lattice(bundle,sys.argv[3]),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`;
  const result = spawnSync("python3", ["-c", script, ROOT,
    path.join(ROOT, "src/lib"), W0_SHA256], {
    cwd: ROOT, input: JSON.stringify(bundle), encoding: "utf8", timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stderr || String(result.error));
  return result;
}
function values(value) {
  return Array.isArray(value) ? value : value.toArray ? value.toArray() : Array.from(value);
}
function pack(fn, value, backend, floating = false) {
  if (backend === "javascript") return value;
  if (floating) return fn.createFloat64Buffer(value);
  return fn.createIntegerBuffer(value.length, 512, value);
}
function integerArguments(probe, fn, backend) {
  const integers = length => Array(length).fill(0n);
  const floats = length => Array(length).fill(0);
  const original = probe.acceptedLattice.map(BigInt);
  const n = 9, square = 81;
  const raw = [original, n, integers(36), integers(5), integers(36), integers(square),
    integers(square), floats(square), integers(square), floats(square), integers(square),
    floats(n), integers(n), floats(36), floats(square), integers(n), integers(n),
    integers(n), floats(n), floats(n), floats(n), integers(n)];
  const integer = new Set([0, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 17, 21]);
  const floating = new Set([7, 9, 11, 13, 14, 18, 19, 20]);
  return raw.map((value, index) => integer.has(index) ? pack(fn, value, backend) :
    floating.has(index) ? pack(fn, value, backend, true) : BigInt(value));
}
function realArguments(probe, fn, backend) {
  const integers = length => Array(length).fill(0n);
  const floats = length => Array(length).fill(0);
  const raw = [probe.realInputTriples.map(BigInt), 5, integers(20), integers(16),
    integers(20), integers(16), integers(16), floats(16), integers(16), floats(16),
    integers(16), floats(4), integers(4), floats(20), floats(16), integers(4),
    integers(5), integers(5), floats(5), floats(5), floats(5), integers(5), integers(2)];
  const integer = new Set([0, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 17, 21, 22]);
  const floating = new Set([7, 9, 11, 13, 14, 18, 19, 20]);
  return raw.map((value, index) => integer.has(index) ? pack(fn, value, backend) :
    floating.has(index) ? pack(fn, value, backend, true) : BigInt(value));
}

(async () => {
  const bytes = fs.readFileSync(W0);
  assert.equal(digest(bytes), W0_SHA256);
  const bundle = JSON.parse(bytes);
  const first = JSON.parse(runProbe(bundle).stdout);
  assert.deepEqual(JSON.parse(runProbe(bundle).stdout), first);
  assert.equal(first.publishable, false);
  assert.equal(first.correspondenceComplete, false);
  assert.equal(first.frozenW0RuntimeInput, true);
  assert.match(first.w0Role, /not an owner/);
  assert.deepEqual(first.integerState, [5, 5, 4, 0, 0]);
  assert.deepEqual(first.realState, [0, 0]);
  assert.deepEqual(first.cleanarchState, [0, 4, 4, -241, -233, -1, -1]);
  assert.deepEqual(first.privateGetfuRealState, [0, 0]);
  assert.deepEqual(first.privateGetfuFactor,
    ["1", "0", "0", "0", "0", "1", "0", "0", "0", "0", "1", "0", "0", "0", "0", "1"]);
  assert.deepEqual(first.postcomputeDifferential.referenceUnitProofs.map(proof => proof.norm),
    ["-1", "1", "1", "1"]);
  assert.deepEqual(first.postcomputeDifferential.referenceUnitProofs.map(proof => proof.realSigns),
    [[-1, -1, -1, 1, 1], [-1, -1, -1, -1, 1], [1, 1, 1, -1, -1], [1, -1, -1, -1, -1]]);

  const built = await compileKernel({ sourcePath: SOURCE });
  const module = require(built.modulePath);
  const integer = module.pari_unit_integer_lattice_rank_four;
  const real = module.pari_unit_real_lattice_rank_four;
  const compose = module.pari_unit_compose_rank_four;
  const cleanarch = module.pari_cleanarchunit_50_quintic;
  const prepare = module.pari_prepare_getfu_50_quintic;
  assert(integer.nativeAvailable && real.nativeAvailable && compose.nativeAvailable &&
    cleanarch.nativeAvailable && prepare.nativeAvailable);
  const backends = ["javascript", "gmp", "tagged"];
  for (const backend of backends) {
    const ia = integerArguments(first, integer, backend);
    assert.equal(integer[backend](...ia), 0n, backend);
    assert.deepEqual(values(ia[2]), first.u1.map(BigInt), `${backend}: U1`);
    assert.deepEqual(values(ia[3]), [5n, 5n, 4n, 0n, 0n], `${backend}: integer state`);
    const ra = realArguments(first, real, backend);
    assert.equal(real[backend](...ra), 0n, backend);
    assert.deepEqual(values(ra[3]), first.u2.map(BigInt), `${backend}: U2`);
    assert.deepEqual(values(ra[22]), [0n, 0n], `${backend}: real state`);
    const output = pack(compose, Array(36).fill(0n), backend);
    assert.equal(compose[backend](ia[2], 9n, ra[3], output), 0n, backend);
    assert.deepEqual(values(output), first.unitTransform.map(BigInt), `${backend}: U`);

    const zero = (fn, length) => pack(fn, Array(length).fill(0n), backend);
    const cleanOutput = zero(cleanarch, 140);
    const cleanState = zero(cleanarch, 7);
    const cleanArguments = [pack(cleanarch, first.unitLogs.map(BigInt), backend),
      pack(cleanarch, first.expectedRegulator.map(BigInt), backend), 256n,
      zero(cleanarch, 3), zero(cleanarch, 1024), zero(cleanarch, 1024),
      zero(cleanarch, 1024), zero(cleanarch, 1024), zero(cleanarch, 2048),
      zero(cleanarch, 140), cleanOutput, cleanState];
    assert.equal(cleanarch[backend](...cleanArguments), 0n, `${backend}: cleanarch`);
    assert.deepEqual(values(cleanState), first.cleanarchState.map(BigInt),
      `${backend}: cleanarch state`);
    assert.deepEqual(values(cleanOutput), first.cleanLogs.map(BigInt),
      `${backend}: cleanarch output`);

    const preparedOutputs = [140, 140, 140, 60, 60].map(length => zero(prepare, length));
    assert.equal(prepare[backend](cleanOutput,
      pack(prepare, first.privateGetfuFactor.map(BigInt), backend), ...preparedOutputs),
    0n, `${backend}: getfu preparation`);
    assert.deepEqual(values(preparedOutputs[2]), first.candidateA.map(BigInt),
      `${backend}: candidate A`);
    const singular = pack(prepare, Array(16).fill(0n), backend);
    assert.throws(() => prepare[backend](cleanOutput, singular, ...preparedOutputs));

    const short = pack(integer, Array(35).fill(0n), backend);
    const before = values(ia[3]);
    assert.throws(() => integer[backend](short, ...ia.slice(1)));
    assert.deepEqual(values(ia[3]), before, `${backend}: transactional preflight`);
  }

  let mutations = 0;
  const rejectProbe = change => {
    const changed = structuredClone(bundle);
    change(changed);
    assert.notEqual(runProbe(changed, 1).status, 0);
    mutations += 1;
  };
  rejectProbe(value => { value.field.signature = [3, 1]; });
  rejectProbe(value => { value.events.find(event => event.event === "acceptance").lattice.values.pop(); });
  rejectProbe(value => { value.events.find(event => event.event === "fundamental_units").U.values[0].values[0].value = "1"; });
  rejectProbe(value => { value.events.find(event => event.event === "hnf").exactC.values.pop(); });

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row23-rank4-unit-lattice-check-v1",
    w0Sha256: W0_SHA256, backends, integerState: first.integerState,
    realState: first.realState, cleanarchState: first.cleanarchState,
    privateGetfuFactor: first.privateGetfuFactor, u2: first.u2,
    unitTransform: first.unitTransform,
    referenceUnitNorms: first.postcomputeDifferential.referenceUnitProofs.map(value => value.norm),
    referenceRealSigns: first.postcomputeDifferential.referenceUnitProofs.map(value => value.realSigns),
    mutationsRejected: mutations + 6,
    native: { cacheKey: built.cacheKey, coreBytes: fs.statSync(built.coreSourcePath).size },
    honesty: { publishable: false, frozenW0RuntimeInput: true,
      reason: "connected row-23 HNF/log owner does not yet exist" },
    closedCut: first.closedCut, remainingSuffix: first.remainingSuffix,
  })}\n`);
})().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

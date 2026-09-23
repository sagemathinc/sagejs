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
const SOURCE = path.join(__dirname, "row21_rank3_unit_lattice.py");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-21-6966124ec38a3af1.json";
const W0_SHA256 = "45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a";

function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function runProbe(bundle, expected = 0) {
  const script = String.raw`
import importlib,json,sys
sys.path.extend(sys.argv[1:3])
m=importlib.import_module('bench.pari-class-group-port.row21_rank3_unit_lattice')
bundle=json.load(sys.stdin)
json.dump(m.probe_row21_rank3_unit_lattice(bundle,sys.argv[3]),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`;
  const result = spawnSync("python3", ["-c", script, ROOT,
    path.join(ROOT, "src/lib"), W0_SHA256], {
    cwd: ROOT,
    input: JSON.stringify(bundle),
    encoding: "utf8",
    timeout: 180_000,
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
  const integers = (length) => Array(length).fill(0n);
  const floats = (length) => Array(length).fill(0);
  const original = probe.u1.map(() => 0n);
  original[5 * 3] = 1n;
  original[6 * 3 + 1] = 1n;
  original[7 * 3 + 2] = 1n;
  const n = 8, square = 64;
  const raw = [original, n, integers(24), integers(5), integers(24), integers(square),
    integers(square), floats(square), integers(square), floats(square), integers(square),
    floats(n), integers(n), floats(24), floats(square), integers(n), integers(n),
    integers(n), floats(n), floats(n), floats(n), integers(n)];
  const integer = new Set([0, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 17, 21]);
  const floating = new Set([7, 9, 11, 13, 14, 18, 19, 20]);
  return raw.map((value, index) => integer.has(index) ? pack(fn, value, backend) :
    floating.has(index) ? pack(fn, value, backend, true) : BigInt(value));
}
function realArguments(probe, fn, backend) {
  const integers = (length) => Array(length).fill(0n);
  const floats = (length) => Array(length).fill(0);
  const raw = [probe.realInputTriples.map(BigInt), 4, integers(12), integers(9),
    integers(12), integers(9), integers(9), floats(9), integers(9), floats(9),
    integers(9), floats(3), integers(3), floats(12), floats(9), integers(3),
    integers(4), integers(4), floats(4), floats(4), floats(4), integers(4), integers(2)];
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
  const second = JSON.parse(runProbe(bundle).stdout);
  assert.deepEqual(second, first);
  assert.equal(first.publishable, false);
  assert.equal(first.correspondenceComplete, false);
  assert.equal(first.frozenW0RuntimeInput, true);
  assert.deepEqual(first.integerState, [5, 5, 3, 0, 0]);
  assert.deepEqual(first.realState, [0, 0]);
  assert.deepEqual(first.cleanarchState, [0, 3, 3, -183, -174, -1, -1]);
  assert.deepEqual(first.privateGetfuRealState, [0, 0]);
  assert.deepEqual(first.privateGetfuFactor,
    ["1", "0", "0", "0", "1", "0", "1", "0", "1"]);
  assert.deepEqual(first.u2, ["1", "1", "-1", "0", "3", "1", "0", "1", "0"]);
  assert.deepEqual(first.unitTransform, ["0", "0", "0", "0", "0", "1", "0", "0",
    "0", "0", "0", "0", "0", "1", "3", "1", "0", "0", "0", "0", "0", "-1", "1", "0"]);
  assert.deepEqual(first.postcomputeDifferential.referenceUnitProofs.map(proof => proof.norm),
    ["-1", "-1", "-1"]);
  assert.deepEqual(first.postcomputeDifferential.referenceUnitProofs.map(proof => proof.realSigns),
    [[-1, 1, 1], [1, -1, 1], [1, -1, 1]]);

  const built = await compileKernel({ sourcePath: SOURCE });
  const module = require(built.modulePath);
  const integer = module.pari_unit_integer_lattice_rank_three;
  const real = module.pari_unit_real_lattice_rank_three;
  const compose = module.pari_unit_compose_rank_three;
  const cleanarch = module.pari_cleanarchunit_31_quintic;
  const prepare = module.pari_prepare_getfu_31_quintic;
  assert(integer.nativeAvailable && real.nativeAvailable && compose.nativeAvailable &&
    cleanarch.nativeAvailable && prepare.nativeAvailable);
  const backends = ["javascript", "gmp", "tagged"];
  for (const backend of backends) {
    const ia = integerArguments(first, integer, backend);
    assert.equal(integer[backend](...ia), 0n, backend);
    assert.deepEqual(values(ia[2]), first.u1.map(BigInt), `${backend}: U1`);
    assert.deepEqual(values(ia[3]), [5n, 5n, 3n, 0n, 0n], `${backend}: integer state`);
    const ra = realArguments(first, real, backend);
    assert.equal(real[backend](...ra), 0n, backend);
    assert.deepEqual(values(ra[3]), first.u2.map(BigInt), `${backend}: U2`);
    assert.deepEqual(values(ra[22]), [0n, 0n], `${backend}: real state`);
    const outputRaw = Array(24).fill(0n);
    const output = pack(compose, outputRaw, backend);
    assert.equal(compose[backend](ia[2], 8n, ra[3], output), 0n, backend);
    assert.deepEqual(values(output), first.unitTransform.map(BigInt), `${backend}: U`);

    const zero = (fn, length) => pack(fn, Array(length).fill(0n), backend);
    const cleanOutput = zero(cleanarch, 84);
    const cleanState = zero(cleanarch, 7);
    const cleanArguments = [pack(cleanarch, first.unitLogs.map(BigInt), backend),
      pack(cleanarch, first.expectedRegulator.map(BigInt), backend), 192n,
      zero(cleanarch, 3), zero(cleanarch, 1024), zero(cleanarch, 1024),
      zero(cleanarch, 1024), zero(cleanarch, 1024), zero(cleanarch, 2048),
      zero(cleanarch, 84), cleanOutput, cleanState];
    assert.equal(cleanarch[backend](...cleanArguments), 0n, `${backend}: cleanarch`);
    assert.deepEqual(values(cleanState), first.cleanarchState.map(BigInt),
      `${backend}: cleanarch state`);
    assert.deepEqual(values(cleanOutput), first.cleanLogs.map(BigInt),
      `${backend}: cleanarch output`);

    const preparedOutputs = [84, 84, 84, 36, 36, 36, 36].map(length => zero(prepare, length));
    assert.equal(prepare[backend](cleanOutput,
      pack(prepare, first.privateGetfuFactor.map(BigInt), backend), ...preparedOutputs),
    0n, `${backend}: getfu preparation`);
    assert.deepEqual(values(preparedOutputs[2]), first.candidateA.map(BigInt),
      `${backend}: candidate A`);

    // Preflight failures must not publish partial state.
    const short = pack(integer, Array(23).fill(0n), backend);
    const before = values(ia[3]);
    assert.throws(() => integer[backend](short, ...ia.slice(1)));
    assert.deepEqual(values(ia[3]), before, `${backend}: transactional preflight`);
  }

  let mutations = 0;
  const rejectProbe = (change) => {
    const changed = structuredClone(bundle);
    change(changed);
    assert.notEqual(runProbe(changed, 1).status, 0);
    mutations += 1;
  };
  rejectProbe(value => { value.field.signature = [1, 2]; });
  rejectProbe(value => {
    value.events.find(event => event.event === "acceptance").lattice.values.pop();
  });
  rejectProbe(value => {
    const reference = value.events.find(event => event.event === "fundamental_units");
    reference.U.values[0].values[0].value = "1";
  });
  rejectProbe(value => {
    value.events.find(event => event.event === "hnf").exactC.values.pop();
  });

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row21-rank3-unit-lattice-check-v1",
    w0Sha256: W0_SHA256,
    backends,
    integerState: first.integerState,
    realState: first.realState,
    cleanarchState: first.cleanarchState,
    privateGetfuFactor: first.privateGetfuFactor,
    u2: first.u2,
    unitTransform: first.unitTransform,
    referenceUnitNorms: first.postcomputeDifferential.referenceUnitProofs.map(value => value.norm),
    referenceRealSigns: first.postcomputeDifferential.referenceUnitProofs.map(value => value.realSigns),
    mutationsRejected: mutations + 3,
    native: { cacheKey: built.cacheKey, coreBytes: fs.statSync(built.coreSourcePath).size },
    honesty: { publishable: false, frozenW0RuntimeInput: true,
      reason: "connected row-21 HNF/log owner does not yet exist" },
    closedCut: first.closedCut,
    remainingSuffix: first.remainingSuffix,
  })}\n`);
})().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

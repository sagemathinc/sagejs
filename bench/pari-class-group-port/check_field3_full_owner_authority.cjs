#!/usr/bin/env node
"use strict";

// Qualify the compact field-3 authority leaf against the actual post-rnd/LIE
// process. The 48 fingerprint words are integrity latches only. The exact
// authority is the immutable snapshot of the original same-run live owners.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "field3_full_owner_authority.py");
const producerPath = path.join(__dirname, "check_post_rnd_lie_iteration.cjs");

const exactLengths = Object.freeze({
  relationState: 6,
  relationRecords: 288 * 301,
  relationBasis: 288 * 288,
  relationHashes: 301,
  relationMetadata: 3 * 301,
  principalGenerators: 4 * 301,
  logCompleted: 1,
  relationLogs: 21 * 301,
  packetIds: 288,
  packetIdeals: 288 * 16,
  packetNorms: 288,
  packetPrimes: 288,
  packetGenerators: 288 * 4,
  packetInert: 288,
  relationPrimes: 288,
  ramification: 288,
  hnfPermutation: 288,
  outerPermutation: 288,
  randomState: 66,
  randomSchedule: 12,
  randomSubfactor: 4,
  smallSchedule: 4,
  outerState: 19,
  driverState: 8,
  hnfState: 9,
  controlState: 6,
});

const int64Names = new Set([
  "hnfPermutation",
  "randomSchedule",
  "smallSchedule",
  "outerState",
  "driverState",
  "hnfState",
  "controlState",
]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function instrumentedProducer(args, outputPath) {
  let source = fs.readFileSync(producerPath, "utf8");
  const anchor = "# Continue from the live resident owners.  No terminal HNF, class invariant, or";
  assert(source.includes(anchor), "post-rnd producer instrumentation anchor changed");
  const injection = String.raw`
authority_module=importlib.import_module('bench.pari-class-group-port.field3_full_owner_authority')
fingerprints=[77]*48
authority_state=[77]*24
authority_args=[terminal_action,v['relation_state'],v['relation_records'],v['relation_basis'],v['relation_hashes'],v['relation_metadata'],v['generators'],v['log_completed'],v['log_embeddings'],v['packet_ids'],v['packet_ideals'],v['packet_norms'],v['packet_primes'],v['packet_generators'],v['packet_inert'],v['relation_primes'],v['ramification'],v['hnf_perm'],v['outer_perm'],rng,ss,current,ss[4],v['schedule'],v['outer_state'],v['driver_state'],v['hnf_state'],control,fingerprints,authority_state]
authority_status=authority_module.pari_field3_full_owner_authority(*authority_args)
assert authority_status==0,(authority_status,v['relation_state'][:6],v['log_completed'][:1],ss,v['schedule'][:4],v['outer_state'][:19],v['driver_state'][:8],v['hnf_state'][:9],control)
assert authority_state[:6]==[0,288,301,4,3,288]
s=lambda x:list(map(str,x))
owners={
 'relationState':s(v['relation_state'][:6]),
 'relationRecords':s(v['relation_records'][:288*301]),
 'relationBasis':s(v['relation_basis'][:288*288]),
 'relationHashes':s(v['relation_hashes'][:301]),
 'relationMetadata':s(v['relation_metadata'][:3*301]),
 'principalGenerators':s(v['generators'][:4*301]),
 'logCompleted':s(v['log_completed'][:1]),
 'relationLogs':s(v['log_embeddings'][:21*301]),
 'packetIds':s(v['packet_ids'][:288]),
 'packetIdeals':s(v['packet_ideals'][:288*16]),
 'packetNorms':s(v['packet_norms'][:288]),
 'packetPrimes':s(v['packet_primes'][:288]),
 'packetGenerators':s(v['packet_generators'][:288*4]),
 'packetInert':s(v['packet_inert'][:288]),
 'relationPrimes':s(v['relation_primes'][:288]),
 'ramification':s(v['ramification'][:288]),
 'hnfPermutation':s(v['hnf_perm'][:288]),
 'outerPermutation':s(v['outer_perm'][:288]),
 'randomState':s(rng[:66]),
 'randomSchedule':s(ss[:12]),
 'randomSubfactor':s(current[:ss[4]]),
 'smallSchedule':s(v['schedule'][:4]),
 'outerState':s(v['outer_state'][:19]),
 'driverState':s(v['driver_state'][:8]),
 'hnfState':s(v['hnf_state'][:9]),
 'controlState':s(control[:6]),
}
authority_export={'owners':owners,'fingerprints':s(fingerprints),'state':authority_state}
`;
  source = source.replace(anchor, `${injection}\n${anchor}`);
  source = source.replace(
    "out={'randomLast':295,",
    "out={'authority':authority_export,'randomLast':295,",
  );
  assert(source.includes("'authority':authority_export"));
  source = source.replace(
    'const cpPath = path.join(directory, "cpython.json");',
    'const cpPath = process.env.FIELD3_AUTHORITY_CP_PATH;',
  );
  // The producer's broad native smoke is unrelated. This checker compiles only
  // the new leaf after authentic CPython capture.
  source = source.replace(
    /nativeSmoke\(\)\.catch\(\(error\) => \{[\s\S]*?\n\}\);\s*$/,
    'console.log(JSON.stringify(summary));\n',
  );
  assert(!source.includes("nativeSmoke().catch"));
  const bootstrap = String.raw`
const fs=require("node:fs"),Module=require("node:module"),path=require("node:path");
const filename=process.argv[1],source=fs.readFileSync(process.env.FIELD3_AUTHORITY_INSTRUMENTED,"utf8");
const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(source,filename);
`;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-field3-authority-"));
  const instrumented = path.join(temporary, "instrumented.cjs");
  fs.writeFileSync(instrumented, source);
  const stdout = run(process.execPath, ["-e", bootstrap, producerPath, ...args], {
    env: {
      ...process.env,
      FIELD3_AUTHORITY_CP_PATH: outputPath,
      FIELD3_AUTHORITY_INSTRUMENTED: instrumented,
      TMPDIR: temporary,
    },
  });
  return JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
}

function exactBuffer(api, entries) {
  let bits = 1;
  for (let value of entries) {
    value = BigInt(value);
    if (value < 0n) value = -value;
    bits = Math.max(bits, value.toString(2).length);
  }
  return api.createIntegerBuffer(
    entries.length,
    Math.max(4, Math.ceil(bits / 64) + 2),
    entries.map(BigInt),
  );
}

function ownerValues(owner) {
  return Array.isArray(owner) ? owner : owner.toArray();
}

function fingerprint(values, seed) {
  const modulus1 = 2305843009213693951n;
  const modulus2 = 2305843009213693921n;
  let first = (BigInt(seed) + BigInt(values.length)) % modulus1;
  let second = (3n * BigInt(seed) + BigInt(values.length)) % modulus2;
  for (let index = 0; index < values.length; index += 1) {
    const value = BigInt(values[index]);
    first = (first * 1000003n + value % modulus1 + BigInt(index + 1)) % modulus1;
    second = (second * 1000033n + value % modulus2 + BigInt(index + 1)) % modulus2;
  }
  return [first.toString(), second.toString()];
}

function replayExactOwners(owners, expectedFingerprints) {
  assert.deepEqual(Object.keys(owners), Object.keys(exactLengths));
  for (const [name, length] of Object.entries(exactLengths)) {
    assert.equal(owners[name].length, length, `${name}: logical prefix`);
    for (const value of owners[name]) assert.match(value, /^-?\d+$/, name);
  }
  assert.deepEqual(owners.relationState, ["301", owners.relationState[1], "0", "0", "301", "301"]);
  assert.deepEqual(owners.logCompleted, ["301"]);
  assert.equal(owners.outerState[2], "292", "authenticated post-LIE odd counter");
  assert.equal(owners.driverState[2], "4");
  assert.equal(owners.hnfState[0], "2");
  assert.equal(owners.hnfState[2], "286");
  assert.equal(owners.randomSchedule[9], "0");
  for (let column = 0; column < 301; column += 1) {
    assert.equal(owners.relationMetadata[3 * column], String(column + 1));
    assert.equal(owners.relationMetadata[3 * column + 1], "0");
    assert.equal(owners.relationMetadata[3 * column + 2], "0");
  }
  assert.deepEqual(owners.outerPermutation, owners.hnfPermutation);
  assert.equal(new Set(owners.hnfPermutation).size, 288);
  // Independent streaming replay detects serialization/generation drift. It
  // does not promote the latches to mathematical authority: `owners` remains
  // the exact replay resource.
  const got = [];
  let seed = 1;
  for (const name of Object.keys(exactLengths).slice(1)) {
    if (name === "logCompleted") continue;
    got.push(...fingerprint(owners[name], seed));
    seed += 1;
  }
  assert.equal(got.length, 48);
  assert.deepEqual(got, expectedFingerprints);
}

function allocate(api, live, backend, mutation = "") {
  const source = Object.fromEntries(
    Object.entries(live.owners).map(([name, entries]) => [name, entries.slice()]),
  );
  if (mutation === "metadata") source.relationMetadata[0] = "2";
  if (mutation === "permutation") source.outerPermutation[1] = source.outerPermutation[0];
  if (mutation === "schedule") source.randomSchedule[9] = "1";
  const inputs = {};
  for (const [name, entries] of Object.entries(source)) {
    inputs[name] = int64Names.has(name)
      ? entries.map(BigInt)
      : backend === "javascript"
        ? entries.map(BigInt)
        : exactBuffer(api, entries);
  }
  const fingerprints = backend === "javascript"
    ? Array(48).fill(77n)
    : exactBuffer(api, Array(48).fill("77"));
  const state = Array(24).fill(77n);
  const args = [
    0n,
    inputs.relationState,
    inputs.relationRecords,
    inputs.relationBasis,
    inputs.relationHashes,
    inputs.relationMetadata,
    inputs.principalGenerators,
    inputs.logCompleted,
    inputs.relationLogs,
    inputs.packetIds,
    inputs.packetIdeals,
    inputs.packetNorms,
    inputs.packetPrimes,
    inputs.packetGenerators,
    inputs.packetInert,
    inputs.relationPrimes,
    inputs.ramification,
    inputs.hnfPermutation,
    inputs.outerPermutation,
    inputs.randomState,
    inputs.randomSchedule,
    inputs.randomSubfactor,
    4n,
    inputs.smallSchedule,
    inputs.outerState,
    inputs.driverState,
    inputs.hnfState,
    inputs.controlState,
    fingerprints,
    state,
  ];
  return { args, fingerprints, state };
}

function strings(owner) {
  return ownerValues(owner).map(String);
}

(async () => {
  assert.equal(process.argv.length, 6,
    "usage: check_field3_full_owner_authority.cjs PARI_ROOT PARI_ARCHIVE INITIAL ANALYTIC");
  const captureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-field3-authority-live-"));
  const cpPath = path.join(captureDirectory, "authority.json");
  const producer = instrumentedProducer(process.argv.slice(2), cpPath);
  assert.deepEqual(producer.cpython.counts, {
    randomLast: 295, postRandomLast: 296, lieLast: 301,
    action296: 5, terminalAction: 0,
  });
  fs.chmodSync(cpPath, 0o444);
  const captureBytes = fs.readFileSync(cpPath);
  const live = JSON.parse(captureBytes).authority;
  assert.deepEqual(live.state.slice(0, 6), [0, 288, 301, 4, 3, 288]);
  assert.equal(live.state[22], 48);
  replayExactOwners(live.owners, live.fingerprints);

  const built = await compileKernel({ sourcePath });
  const api = require(built.modulePath).pari_field3_full_owner_authority;
  assert(api.nativeAvailable);
  const summaries = {};
  for (const backend of ["javascript", "gmp", "tagged"]) {
    let call = allocate(api, live, backend);
    assert.equal(api[backend](...call.args), 0n, backend);
    assert.deepEqual(strings(call.fingerprints), live.fingerprints, `${backend}: integrity latches`);
    assert.deepEqual(call.state.map(Number), live.state, `${backend}: authority state`);
    call = null;
    if (global.gc) global.gc();
    let rejected = 0;
    for (const mutation of ["metadata", "permutation", "schedule"]) {
      let bad = allocate(api, live, backend, mutation);
      assert.notEqual(api[backend](...bad.args), 0n, `${backend}:${mutation}`);
      assert.deepEqual(strings(bad.fingerprints), Array(48).fill("77"),
        `${backend}:${mutation}: partial latch publication`);
      assert.deepEqual(bad.state.map(Number), Array(24).fill(77),
        `${backend}:${mutation}: partial state publication`);
      bad = null;
      if (global.gc) global.gc();
      rejected += 1;
    }
    summaries[backend] = { rejected, latchWords: 48 };
  }
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  assert(core.length < 8 * 1024 * 1024, "unexpected field-3 leaf code-size expansion");
  console.log(JSON.stringify({
    field: 3,
    polynomial: "x^4 - 2000022*x - 2000042",
    relationShape: [288, 301],
    principalGenerators: 301,
    relationLogWords: 6321,
    factorBaseIdeals: 288,
    rngWords: 66,
    exactOwnerNames: Object.keys(live.owners),
    exactOwnerCells: Object.values(exactLengths).reduce((a, b) => a + b, 0),
    exactOwnerSnapshotBytes: captureBytes.length,
    exactOwnerSnapshotSha256: crypto.createHash("sha256").update(captureBytes).digest("hex"),
    originalOwnersRetainedForReplay: true,
    fingerprintsAreAuthority: false,
    integrityLatchWords: 48,
    sameRunProducer: true,
    backends: ["CPython", "javascript", "gmp", "tagged"],
    summaries,
    coreBytes: fs.statSync(built.coreSourcePath).size,
    nativeDependencyPath: fs.realpathSync(path.join(root, "packages/flint/.native")),
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

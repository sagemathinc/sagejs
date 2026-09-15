"use strict";
// Local execution diagnostic, NOT a qualified PARI comparison. The caller
// supplies inputs exported only after CPython replay by the attempt checker.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { createHash } = require("node:crypto");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

(async () => {
  const option = (name, fallback) => {
    const at = process.argv.indexOf(name);
    if (at < 0) return fallback;
    assert.equal(process.argv.lastIndexOf(name), at, "duplicate option: " + name);
    assert(process.argv[at + 1] && !process.argv[at + 1].startsWith("--"),
      "missing option value: " + name);
    return process.argv[at + 1];
  };
  const positiveCount = (name, fallback) => {
    const text = option(name, String(fallback));
    assert(/^[1-9][0-9]*$/.test(text), "positive integer required: " + name);
    const value = Number(text);
    assert(Number.isSafeInteger(value), "unsafe count: " + name);
    return value;
  };
  const repetitions = positiveCount("--repetitions", 1);
  const sampleCount = positiveCount("--samples", 3);
  const wordCapacity = positiveCount("--word-capacity", 64);
  assert(Number.isSafeInteger(repetitions * sampleCount), "unsafe total call count");
  const outputPath = option("--output", null);
  const profileSymbols = process.argv.includes("--profile-symbols");
  const inputPath = path.resolve(process.argv[2]);
  const fixture = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const backend = option("--backend", "gmp");
  assert(["gmp", "tagged"].includes(backend), "unsupported diagnostic backend");
  const referenceAt = process.argv.indexOf("--reference-fixtures");
  const reference = referenceAt < 0 ? null : JSON.parse(
    fs.readFileSync(process.argv[referenceAt + 1], "utf8"),
  ).outputs.find(row => row.field === fixture.expected[0].field);
  if (referenceAt >= 0) assert(reference, "missing matching reference field");
  const { names, inputs } = fixture;
  assert(Array.isArray(names) && Array.isArray(inputs));
  assert.equal(inputs.length, 1, "bounded single-field diagnostic only");
  const raw = inputs[0];
  // Reserve the selected fixed limb count (64 by default), or enough for input.
  // CUP keeps its separate four-word floor. No computed result changes capacity.
  // Capacities are fixed before entry, never grown from computed results.
  const capacities = {};
  for (const [name, kind] of names) if (kind === "IntegerBuffer") {
    let words = name.startsWith("hnf_cup_") ? 4 : wordCapacity;
    for (const entry of raw[name]) {
      const value = BigInt(entry), magnitude = value < 0n ? -value : value;
      words = Math.max(words, Math.ceil(magnitude.toString(2).length / 64));
    }
    capacities[name] = words;
  }
  const capacity = name => capacities[name];
  const bytes = names.reduce((total, [name, kind]) => total +
    (kind === "IntegerBuffer" ? raw[name].length * (4 + 8 * capacity(name)) :
      kind.endsWith("Buffer") ? raw[name].length * 8 : 0), 0);
  assert(bytes * 2 < 2 ** 30, "resident owners plus reset snapshots exceed 1 GiB diagnostic cap");
  const sourcePath = path.join(__dirname, "prepared_class_group_attempt.py");
  const signature = fs.readFileSync(sourcePath, "utf8")
    .match(/def pari_prepared_class_group_attempt\(([\s\S]*?)\n\)/)[1]
    .trim().split("\n").map(line => line.trim().replace(/,$/, "").split(": "));
  assert.deepEqual(names, signature, "stale exported signature");
  const expected = fixture.summary.cp[0];
  assert.equal(expected.action, 0, "fixture must have independently replayed acceptance");
  const built = await compileKernel({ sourcePath, profileSymbols });
  const f = require(built.modulePath).pari_prepared_class_group_attempt;
  assert(f.nativeAvailable);
  const values = {}, snapshots = {}, reset = [];
  const setupStart = performance.now();
  for (const [name, kind] of names) {
    const value = raw[name];
    if (kind === "IntegerBuffer") {
      const owner = f.createIntegerBuffer(value.length, capacity(name), value.map(BigInt));
      const sizes = owner.sizes.slice(), limbs = owner.limbs.slice();
      values[name] = owner;
      reset.push(() => { owner.sizes.set(sizes); owner.limbs.set(limbs); });
    } else if (kind === "Int64Buffer" || kind === "Float64Buffer") {
      const owner = kind === "Int64Buffer" ? f.createInt64Buffer(value) : f.createFloat64Buffer(value);
      snapshots[name] = owner.slice();
      values[name] = owner;
      reset.push(() => owner.set(snapshots[name]));
    } else {
      assert(["int", "float", "bool"].includes(kind), kind);
      values[name] = kind === "int" ? BigInt(value) : kind === "float" ? Number(value) : Boolean(value);
    }
  }
  const setupMilliseconds = performance.now() - setupStart;
  const args = names.map(([name]) => values[name]);
  const view = name => values[name].toArray ? values[name].toArray() : Array.from(values[name]);
  const samples = [];
  let answer;
  // Restore every owner before EVERY computation, including the single warmup.
  // No accepted state or cached answer is supplied to a later native call.
  const invoke = () => {
    const resetCpu = process.cpuUsage(), resetStart = performance.now();
    for (const restore of reset) restore();
    const resetMilliseconds = performance.now() - resetStart;
    const resetUsage = process.cpuUsage(resetCpu);
    const cpu = process.cpuUsage(), start = performance.now();
    const action = f[backend](...args);
    const milliseconds = performance.now() - start, usage = process.cpuUsage(cpu);
    // Decode and assert every individual result/counter outside both clocks.
    const state = view("attempt_state"), count = Number(state[2]);
    const current = {
      action: Number(action), state: state.map(Number),
      invariants: view("class_invariants").slice(0, count).map(String),
      classNumber: String(view("class_number")[0]),
      regulator: view("accept_regulator").slice(0, 3).map(String),
      relations: String(view("relation_state")[0]),
      work: {
        smallElements: Number(view("counters")[1]),
        factorAttempts: Number(view("progress")[1]),
        ideals: Number(values.search_count) - Number(view("schedule")[0]),
      },
    };
    assert.equal(action, 0n, "this diagnostic requires a completed accepted attempt");
    assert.equal(state[3], 1n);
    for (const key of ["action", "state", "invariants", "classNumber", "regulator"])
      assert.deepEqual(current[key], expected[key], "CPython replay mismatch: " + key);
    if (reference) {
      for (const key of ["classNumber", "invariants", "regulator"])
        assert.deepEqual(current[key], reference[key], "PARI result mismatch: " + key);
      assert.equal(Number(current.relations), reference.relations);
      for (const key of ["smallElements", "factorAttempts", "ideals"])
        assert.equal(current.work[key], reference[key], "PARI work-count mismatch: " + key);
    }
    if (answer) assert.deepEqual(current, answer);
    answer = current;
    return {
      milliseconds, cpuMilliseconds: (usage.user + usage.system) / 1000,
      resetMilliseconds,
      resetCpuMilliseconds: (resetUsage.user + resetUsage.system) / 1000,
    };
  };
  invoke(); // One complete fresh-state warmup, excluded from all samples.
  for (let sample = 0; sample < sampleCount; sample++) {
    const totals = {
      repetitions, milliseconds: 0, cpuMilliseconds: 0,
      resetMilliseconds: 0, resetCpuMilliseconds: 0,
    };
    for (let repetition = 0; repetition < repetitions; repetition++) {
      const timing = invoke();
      for (const key of Object.keys(timing)) totals[key] += timing[key];
    }
    samples.push(totals);
  }
  const report = {
    qualifiedTiming: false, comparisonToPari: false, backend,
    boundary: "Prepared attempt with resident owners restored before every call; kernel totals exclude preparation, packing, reset, compilation, decoding and assertions. Reset totals reported separately. Diagnostic only; batching does not qualify timing.",
    repetitions, sampleCount, warmupCalls: 1,
    timedCalls: repetitions * sampleCount,
    inputSha256: createHash("sha256").update(fs.readFileSync(inputPath)).digest("hex"),
    coreBytes: fs.statSync(built.coreSourcePath).size,
    sourceSha256: createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex"),
    coreSha256: createHash("sha256").update(fs.readFileSync(built.coreSourcePath)).digest("hex"),
    generatedModulePath: built.modulePath,
    generatedCorePath: built.coreSourcePath,
    ownerBytes: bytes, resetSnapshotBytes: bytes, setupMilliseconds,
    ordinaryWordCapacity: wordCapacity, cupWordCapacity: 4,
    profileSymbols,
    largeInputCapacities: Object.fromEntries(Object.entries(capacities)
      .filter(([name, words]) => words > (name.startsWith("hnf_cup_") ? 4 : wordCapacity))),
    samples, answer,
  };
  const json = JSON.stringify(report);
  // Refuse to overwrite existing evidence; stdout remains available either way.
  if (outputPath !== null) fs.writeFileSync(path.resolve(outputPath), json + "\n", { flag: "wx" });
  console.log(json);
})().catch(error => { console.error(error); process.exitCode = 1; });

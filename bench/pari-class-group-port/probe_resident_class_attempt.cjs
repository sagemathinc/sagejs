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
  const generatedResident = process.argv.includes("--generated-resident");
  const warmupCalls = positiveCount("--warmups", generatedResident ? 3 : 1);
  const wordCapacity = positiveCount("--word-capacity", 64);
  const arenaBytes = process.argv.includes("--arena-bytes")
    ? positiveCount("--arena-bytes", 0) : 0;
  const arenaBaseline = process.argv.includes("--arena-baseline");
  assert(!arenaBaseline || arenaBytes, "arena baseline requires the arena build");
  assert(!generatedResident || !arenaBytes, "generated resident arena is not yet qualified");
  assert(arenaBytes <= 128 * 1024 * 1024, "diagnostic arena exceeds 128 MiB ceiling");
  assert(Number.isSafeInteger(repetitions * sampleCount), "unsafe total call count");
  const outputPath = option("--output", null);
  const profileSymbols = process.argv.includes("--profile-symbols");
  const inputPath = path.resolve(process.argv[2]);
  let fixture = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (generatedResident) {
    const directory = path.dirname(inputPath);
    const result = JSON.parse(fs.readFileSync(path.join(directory, "result.json")));
    const output = JSON.parse(fs.readFileSync(path.join(directory, "output.json")));
    assert.equal(result.classNumber, String(output.class_number[0]));
    fixture = { names: fixture.names, inputs: [fixture.input], expected: [{ field: 0 }],
      summary: { cp: [{ action: Number(result.action), state: output.attempt_state.map(Number),
        classNumber: result.classNumber, regulator: result.regulator,
        invariants: output.class_invariants.slice(0, Number(output.attempt_state[2])).map(String) }] } };
  }
  const backend = option("--backend", "gmp");
  assert(!arenaBytes || backend === "gmp", "arena comparison requires explicit GMP backend");
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
  const entryName = generatedResident ? "pari_resident_generated_class_attempt" : "pari_prepared_class_group_attempt";
  const originalPath = path.join(__dirname, generatedResident ? "resident_generated_class_attempt.py" : "prepared_class_group_attempt.py");
  const sourcePath = arenaBytes ? path.join(__dirname, "prepared_class_group_arena.py") : originalPath;
  const signature = fs.readFileSync(originalPath, "utf8")
    .match(new RegExp("def " + entryName + "\\(([\\s\\S]*?)\\n\\)"))[1]
    .trim().split("\n").map(line => line.trim().replace(/,$/, "").split(": "));
  assert.deepEqual(names, signature, "stale exported signature");
  const expected = fixture.summary.cp[0];
  assert.equal(expected.action, 0, "fixture must have checked acceptance");
  if (generatedResident) {
    const qualified = JSON.parse(fs.readFileSync(path.join(path.dirname(inputPath), "result.json")));
    assert.equal(qualified.sourceHash, createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex"), "stale resident source fixture");
  }
  const built = await compileKernel({ sourcePath, profileSymbols });
  const f = require(built.modulePath)[arenaBytes && !arenaBaseline ? "pari_prepared_class_group_arena" : entryName];
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
  if (arenaBytes && !arenaBaseline) args.push(BigInt(arenaBytes));
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
    const faultsBefore = process.resourceUsage();
    const cpu = process.cpuUsage(), start = performance.now();
    const action = f[backend](...args);
    const milliseconds = performance.now() - start, usage = process.cpuUsage(cpu);
    const faultsAfter = process.resourceUsage();
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
        ideals: Number(generatedResident ? view("prep_state")[2] : values.search_count) - Number(view("schedule")[0]),
      },
    };
    assert.equal(action, 0n, "this diagnostic requires a completed accepted attempt");
    assert.equal(state[3], 1n);
    for (const key of ["action", "state", "invariants", "classNumber", "regulator"])
      assert.deepEqual(current[key], expected[key], "checker replay mismatch: " + key);
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
      minorPageFaults: faultsAfter.minorPageFault - faultsBefore.minorPageFault,
      majorPageFaults: faultsAfter.majorPageFault - faultsBefore.majorPageFault,
      resetMilliseconds,
      resetCpuMilliseconds: (resetUsage.user + resetUsage.system) / 1000,
    };
  };
  for (let i = 0; i < warmupCalls; i++) invoke();
  for (let sample = 0; sample < sampleCount; sample++) {
    const totals = {
      repetitions, milliseconds: 0, cpuMilliseconds: 0,
      minorPageFaults: 0, majorPageFaults: 0,
      resetMilliseconds: 0, resetCpuMilliseconds: 0,
    };
    for (let repetition = 0; repetition < repetitions; repetition++) {
      const timing = invoke();
      for (const key of Object.keys(timing)) totals[key] += timing[key];
    }
    samples.push(totals);
  }
  const report = {
    qualifiedTiming: false, comparisonToPari: false, backend, generatedResident,
    boundary: generatedResident
      ? "Prepared nf to initial candidate in one native call, including generated catalogs, policies, packets and analytic normalization. Kernel totals exclude nfinit, packing, zero/reset, compilation and result decoding/checks; reset and setup reported separately. Diagnostic, not full bnfinit timing."
      : "Prepared attempt with resident owners restored before every call; kernel totals exclude preparation, packing, reset, compilation, decoding and assertions. Reset totals reported separately. Diagnostic only; batching does not qualify timing.",
    repetitions, sampleCount, warmupCalls,
    timedCalls: repetitions * sampleCount,
    inputSha256: createHash("sha256").update(fs.readFileSync(inputPath)).digest("hex"),
    coreBytes: fs.statSync(built.coreSourcePath).size,
    sourceSha256: createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex"),
    coreSha256: createHash("sha256").update(fs.readFileSync(built.coreSourcePath)).digest("hex"),
    generatedModulePath: built.modulePath,
    generatedCorePath: built.coreSourcePath,
    ownerBytes: bytes, resetSnapshotBytes: bytes, setupMilliseconds,
    ordinaryWordCapacity: wordCapacity, cupWordCapacity: 4,
    profileSymbols, arenaBytes, arenaBaseline,
    largeInputCapacities: Object.fromEntries(Object.entries(capacities)
      .filter(([name, words]) => words > (name.startsWith("hnf_cup_") ? 4 : wordCapacity))),
    samples, answer,
  };
  if (generatedResident) {
    report.preparation = { state: view("prep_state").map(String), base: view("prep_base_state").map(String),
      degreeState: view("prep_degree_state").map(String), catalogState: view("prep_kummer_state").map(String),
      rng: view("prep_kummer_random_state").map(String), inverseHR: view("accept_inverse_hr").map(String) };
    // Final occupancy is not a peak-limb bound and never changes a running owner.
    report.finalLargestStoredWords = Object.fromEntries(names.filter(([, kind]) => kind === "IntegerBuffer")
      .map(([name]) => [name, values[name].sizes.reduce((m, size) => Math.max(m, Math.abs(size)), 0)]));
  }
  const json = JSON.stringify(report);
  // Refuse to overwrite existing evidence; stdout remains available either way.
  if (outputPath !== null) fs.writeFileSync(path.resolve(outputPath), json + "\n", { flag: "wx" });
  console.log(json);
})().catch(error => { console.error(error); process.exitCode = 1; });

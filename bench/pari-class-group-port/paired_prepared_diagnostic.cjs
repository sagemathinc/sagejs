"use strict";
// Controlled prepared-boundary evidence, NOT full experiment qualification.
// Run only after a coordinator has cleared other benchmark/build activity.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const [input, reference, cpuText, nativeText, pariText] = process.argv.slice(2);
assert(input && reference && cpuText && nativeText && pariText,
  "usage: INPUTS REFERENCE CPU NATIVE_REPETITIONS PARI_REPETITIONS");
const cpu = Number(cpuText), nativeRepetitions = Number(nativeText), pariRepetitions = Number(pariText);
assert(Number.isInteger(cpu) && cpu >= 0);
for (const n of [nativeRepetitions, pariRepetitions]) assert(Number.isInteger(n) && n > 0 && n <= 10000);
const ref = JSON.parse(fs.readFileSync(reference));
const field = JSON.parse(fs.readFileSync(input)).expected[0].field;
assert(ref.build?.executablePath && ref.warmupCallsPerField === 1,
  "reference must have explicit excluded warmup and reusable executable");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-prepared-paired-"));
const env = { ...process.env, OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1",
  NODE_OPTIONS: "--max-old-space-size=1536" };
function run(command, args) {
  const r = spawnSync("taskset", ["-c", String(cpu), "prlimit", "--as=4294967296", command, ...args],
    { env, encoding: "utf8", timeout: 600000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr || String(r.error));
  return r.stdout;
}
const declaration = {
  field, cpu, nativeRepetitions, pariRepetitions,
  orders: [["pari", "gmp", "tagged"], ["tagged", "gmp", "pari"], ["pari", "gmp", "tagged"]],
  inputSha256: hash(input), referenceSha256: hash(reference),
  executableSha256: hash(ref.build.executablePath), referenceBuild: ref.build,
  host: { hostname: os.hostname(), platform: process.platform, arch: process.arch,
    release: os.release(), cpuModel: os.cpus()[cpu]?.model, node: process.version,
    loadBefore: os.loadavg() },
  qualifiedTiming: false,
  scope: "Alternating prepared native/reference diagnostic; no dynamic latency, polynomial setup, units/maps or cross-platform qualification. Native reset is separately reported; reference cache allocation is inside its section.",
};
fs.writeFileSync(path.join(directory, "declaration.json"), JSON.stringify(declaration, null, 2));
const samples = [];
for (const [round, order] of declaration.orders.entries()) {
  for (const backend of order) {
    let result;
    if (backend === "pari") {
      const stdout = run(ref.build.executablePath, [String(pariRepetitions), String(field)]);
      const rows = stdout.trim().split("\n").map(JSON.parse);
      assert.equal(rows.length, 1);
      result = rows[0];
      const want = ref.outputs.find(x => x.field === field);
      for (const key of ["classNumber", "invariants", "regulator", "relations", "smallElements", "factorAttempts", "ideals"])
        assert.deepEqual(result[key], want[key], key);
      samples.push({ round, backend, result, secondsPerCall: result.unqualifiedSecondsTotal / pariRepetitions,
        atLeastOneSecond: result.unqualifiedSecondsTotal >= 1 });
    } else {
      const output = path.join(directory, `${round}-${backend}.json`);
      run(process.execPath, [path.join(__dirname, "probe_resident_class_attempt.cjs"), path.resolve(input),
        "--backend", backend, "--reference-fixtures", path.resolve(reference),
        "--repetitions", String(nativeRepetitions), "--samples", "1", "--output", output]);
      result = JSON.parse(fs.readFileSync(output));
      const sample = result.samples[0];
      samples.push({ round, backend, result, secondsPerCall: sample.milliseconds / nativeRepetitions / 1000,
        atLeastOneSecond: sample.milliseconds >= 1000 });
    }
    fs.writeFileSync(path.join(directory, "samples.json"), JSON.stringify(samples));
  }
}
const summary = { ...declaration, samples, loadAfter: os.loadavg(), directory };
fs.writeFileSync(path.join(directory, "summary.json"), JSON.stringify(summary));
console.log(JSON.stringify(summary));

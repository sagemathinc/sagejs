"use strict";
// Sequential, pinned-CPU segment measurements. No whole-engine qualification.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const {createHash} = require("node:crypto");
const manifestPath = process.argv[2], cpu = Number(process.argv[3]);
const repetitions = Number(process.argv[4]), samples = Number(process.argv[5]);
const output = process.argv[6];
assert(Number.isInteger(cpu) && cpu >= 0);
assert(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 100000);
assert(Number.isInteger(samples) && samples >= 1 && samples <= 3);
assert(output && !fs.existsSync(output), "choose a new evidence path");
const m = JSON.parse(fs.readFileSync(manifestPath));
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for (const [key, file] of Object.entries({exe:m.exe, pariExe:m.pariExe,
  input:m.inputPath, fixture:m.fixturePath, core:m.core, module:m.modulePath})) {
  assert.equal(hash(file), m.hashes[key], key);
}
const fixture = JSON.parse(fs.readFileSync(m.fixturePath));
const python = path.join(__dirname, "run_small_norm_cpython.py");
const readHost = () => ({load:os.loadavg(), stat:fs.readFileSync("/proc/stat", "utf8"),
  affinity:fs.readFileSync("/proc/self/status", "utf8").match(/Cpus_allowed_list:.*$/m)[0]});
const evidence = {qualified:false, workload:"two supplied-prime visits, supplied e0=2",
  cpu, repetitions, samples, warmups:3, manifest:m, pythonSha256:hash(python),
  node:process.version, platform:os.release(), cpus:os.cpus().map(c => c.model),
  measurements:[], limitations:["Host is not exclusively reserved; interference must be assessed.",
    "Arithmetic backend differences remain; this is not a pure language attribution.",
    "Four tuning fields, not the complete 24-field panel or bnfinit path."]};
const command = name => name === "pari" ? [m.pariExe, String(repetitions)] :
  name === "core" ? [m.exe, String(repetitions)] :
  ["python3", python, manifestPath, String(repetitions)];
for (let sample = 0; sample < samples; sample++) {
  for (const name of sample % 2 ? ["cpython", "core", "pari"] : ["pari", "core", "cpython"]) {
    const before = readHost(), start = performance.now();
    const run = spawnSync("prlimit", ["--as=4294967296", "--cpu=600", "--",
      "taskset", "-c", String(cpu), ...command(name)], {
      input:name === "core" ? fs.readFileSync(m.inputPath) : undefined,
      encoding:"utf8", timeout:600000, maxBuffer:4000000,
      env:{...process.env, OMP_NUM_THREADS:"1", OPENBLAS_NUM_THREADS:"1"},
    });
    const wallSeconds = (performance.now()-start)/1000, after = readHost();
    assert.equal(run.status, 0, run.stderr || String(run.error));
    const rows = run.stdout.trim().split("\n").map(JSON.parse);
    assert.equal(rows.length, fixture.cases.length);
    for (const [i, row] of rows.entries()) {
      const {index, seconds, repetitions:count, ...actual} = row;
      assert.equal(index, i); assert(Number.isFinite(seconds) && seconds >= 0);
      assert.equal(count, name === "pari" ? repetitions : undefined);
      assert.deepEqual(actual, fixture.cases[i].expected, name + i);
    }
    const entrySeconds = rows.reduce((s, r) => s+r.seconds, 0);
    evidence.measurements.push({sample, name, wallSeconds, entrySeconds,
      rows:rows.map(({index,seconds})=>({index,seconds})), before, after});
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({sample, name, wallSeconds, entrySeconds}));
  }
}
evidence.allSamplesAtLeastOneSecond = evidence.measurements.every(r => r.entrySeconds >= 1);
fs.writeFileSync(output, JSON.stringify(evidence, null, 2));

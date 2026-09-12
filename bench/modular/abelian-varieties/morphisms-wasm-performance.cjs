"use strict";
const assert = require("node:assert/strict");
const { spawnSync, execFileSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const os = require("node:os");
const root = path.resolve(__dirname, "../../..");
const output = process.argv[2];
const samples = Number(process.argv[3] || 3);
if (!output || !Number.isSafeInteger(samples) || samples < 1) throw Error("usage: node morphisms-wasm-performance.cjs OUTPUT.json [SAMPLES]");
const reference = JSON.parse(readFileSync(path.join(__dirname, "morphisms-performance-linux-x64.json")));
const artifact = JSON.parse(readFileSync(path.join(root, "packages/flint-wasm/dist/production-manifest.json")));
const sources = [...Object.keys(reference.sourceSha256), "ffi/flint.ffi.py", "ffi/flint.ffi.json", "src/lib/sagejs/ffi/flint.py"];
const report = {
  date: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  host: { cpu: os.cpus()[0].model, platform: os.platform(), architecture: os.arch(), node: process.version },
  artifact: artifact.identity,
  sourceSha256: Object.fromEntries(sources.map(f => [f, createHash("sha256").update(readFileSync(path.join(root, f))).digest("hex")])),
  policy: "Sequential fresh Node/Wasm processes. Startup excluded. No library warmup. Evaluation timeout 120s; process timeout 150s. Exact comparison with the pinned Sage/native receipt; no timings of concurrent owned builds/tests.",
  reference: "morphisms-performance-linux-x64.json",
  samples,
  results: [],
};
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
save();
for (const level of [389, 1009]) {
  const oracle = reference.results.find(x => x.system === "sage" && x.level === level).records[0];
  for (let sample = 0; sample < samples; sample++) {
    console.log(`Node/Wasm N=${level} sample=${sample}`);
    const child = spawnSync(process.execPath, [path.join(__dirname, "morphisms-sagejs.cjs"), String(level), "--wasm"], { cwd: root, encoding: "utf8", timeout: 150000, maxBuffer: 8*1024*1024 });
    const records = (child.stdout || "").split("\n").filter(x => x.startsWith("{")).map(JSON.parse);
    report.results.push({ level, sample, status: child.status, signal: child.signal, error: child.error?.message, stderr: child.stderr || undefined, records });
    save();
    if (child.status !== 0) throw Error(child.stderr || String(child.error));
    assert.equal(records.length, 1);
    for (const field of ["dimension", "rank", "invariants"]) assert.deepEqual(records[0][field], oracle[field]);
  }
}
console.log(`Saved exact-checked portable benchmark: ${output}`);

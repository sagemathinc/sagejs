"use strict";
// Frozen-artifact diagnostic. Never replaces mathematical source or defaults.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe = path.join(__dirname, "probe_resident_class_attempt.cjs");
if (process.argv[2] === "--child") {
  const manifest = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
  const arm = manifest.arms[Number(process.argv[4])], report = arm.report;
  for (const [file, digest] of Object.entries(arm.files)) assert.equal(hash(file), digest, file);
  assert.equal(hash(probe), manifest.probeSha256);
  assert.equal(hash(manifest.input), manifest.inputSha256);
  assert.equal(hash(manifest.reference), manifest.referenceSha256);
  const actualRequire = createRequire(probe);
  const scopedRequire = request => request === "../../tools/native-kernel/compiler.cjs"
    ? { compileKernel: async ({ sourcePath, profileSymbols }) => {
      assert.equal(hash(sourcePath), report.sourceSha256);
      assert.equal(profileSymbols, report.profileSymbols);
      return { modulePath: report.generatedModulePath, coreSourcePath: report.generatedCorePath };
    } } : actualRequire(request);
  const scopedProcess = Object.create(process);
  Object.defineProperty(scopedProcess, "argv", { value: [process.execPath, probe,
    manifest.input, "--backend", "gmp", "--arena-bytes", "134217728", "--profile-symbols",
    "--samples", "1", "--repetitions", "20", "--reference-fixtures", manifest.reference] });
  // Propagate asynchronous probe failures to the real child exit status.
  Object.defineProperty(scopedProcess, "exitCode", {
    get: () => process.exitCode, set: value => { process.exitCode = value; }
  });
  new Function("require", "__dirname", "__filename", "process", "console", fs.readFileSync(probe, "utf8"))(
    scopedRequire, __dirname, probe, scopedProcess, console);
} else {
  const [oldPath, newPath, inputPath, referencePath, cpu] = process.argv.slice(2);
  assert(/^\d+$/.test(cpu), "explicit CPU required");
  const reports = [oldPath, newPath].map(file => JSON.parse(fs.readFileSync(file, "utf8")));
  const buildManifests = reports.map(report => JSON.parse(fs.readFileSync(
    path.join(path.dirname(report.generatedModulePath), "manifest.json"), "utf8")));
  // Pin the entire lowered mathematical closure, not merely its tiny wrapper.
  assert.deepEqual(buildManifests[0].ir, buildManifests[1].ir, "different mathematical IR closure");
  assert.deepEqual(buildManifests[0].foreignDeclarations, buildManifests[1].foreignDeclarations);
  assert.equal(hash(path.join(path.dirname(reports[0].generatedModulePath), "binding.gyp")),
    hash(path.join(path.dirname(reports[1].generatedModulePath), "binding.gyp")), "different build recipe");
  const irSha256 = createHash("sha256").update(JSON.stringify(buildManifests[0].ir)).digest("hex");
  for (const report of reports) {
    assert.equal(report.backend, "gmp"); assert.equal(report.arenaBytes, 134217728);
    assert.equal(report.arenaBaseline, false); assert.equal(report.profileSymbols, true);
    assert.equal(hash(report.generatedCorePath), report.coreSha256);
  }
  for (const key of ["inputSha256", "sourceSha256", "ownerBytes", "resetSnapshotBytes",
    "ordinaryWordCapacity", "cupWordCapacity", "largeInputCapacities", "answer"])
    assert.deepEqual(reports[0][key], reports[1][key], key);
  const input = path.resolve(inputPath), reference = path.resolve(referencePath);
  assert.equal(hash(input), reports[0].inputSha256);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-artifact-pair-"));
  const manifest = { qualifiedTiming: false, input, reference, cpu, irSha256, probeSha256: hash(probe),
    inputSha256: hash(input), referenceSha256: hash(reference), node: process.version,
    host: os.hostname(), cpuModel: os.cpus()[Number(cpu)]?.model, nodeSha256: hash(process.execPath),
    boundary: "Three alternating frozen GMP arena artifact pairs; fresh owners and excluded reset/setup. Shared-host diagnostic, not PARI qualification.",
    arms: reports.map(report => ({ report, files: Object.fromEntries([
      report.generatedModulePath, report.generatedCorePath,
      path.join(path.dirname(report.generatedModulePath), "manifest.json"),
      path.join(path.dirname(report.generatedModulePath), "binding.gyp"),
      path.join(path.dirname(report.generatedModulePath), "build/Release/sagejs_native_kernel.node")
    ].map(file => [file, hash(file)])) })) };
  const manifestPath = path.join(directory, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const records = [];
  for (const arm of [0, 1, 1, 0, 0, 1]) {
    const child = spawnSync("taskset", ["-c", cpu, process.execPath, __filename, "--child", manifestPath, String(arm)],
      { encoding: "utf8", timeout: 120000, maxBuffer: 2 ** 20,
        env: { ...process.env, OPENBLAS_NUM_THREADS: "1" } });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    const report = JSON.parse(child.stdout.trim()), expected = reports[arm];
    for (const key of ["coreSha256", "sourceSha256", "inputSha256", "answer", "ownerBytes", "resetSnapshotBytes"])
      assert.deepEqual(report[key], expected[key], key);
    assert.equal(report.samples.length, 1); assert.equal(report.repetitions, 20);
    records.push({ arm, report });
    console.log(JSON.stringify({ arm, millisecondsPerCall: report.samples[0].milliseconds / 20 }));
    fs.writeFileSync(path.join(directory, "records.json"), JSON.stringify(records, null, 2));
  }
  const ratios = [];
  for (let i = 0; i < records.length; i += 2) {
    const pair = records.slice(i, i + 2);
    ratios.push(pair.find(x => x.arm === 1).report.samples[0].milliseconds /
      pair.find(x => x.arm === 0).report.samples[0].milliseconds);
  }
  const result = { ...manifest, records, ratios,
    geometricMeanRatio: Math.exp(ratios.reduce((s, r) => s + Math.log(r), 0) / ratios.length),
    allSamplesAtLeastOneSecond: records.every(x => x.report.samples[0].milliseconds >= 1000) };
  const output = path.join(directory, "result.json");
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, ratios, geometricMeanRatio: result.geometricMeanRatio }));
}

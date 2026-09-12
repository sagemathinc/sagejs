"use strict";
// Standalone warm execution only. No compilation or startup is timed.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const sha = filename => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const fixture = path.join(__dirname, "fixture.py");
const names = ["control", "calls", "plain_create", "owned_create", "plain_resume", "owned_resume", "validate_created", "correctness"];
const [mode, location, ...roots] = process.argv.slice(2);
if (mode === "prepare") {
  fs.mkdirSync(location, { recursive: true });
  const artifacts = roots.map((root, index) => {
    const filename = `candidate-${index}.cjs`;
    const output = path.resolve(location, filename);
    const inputs = ["dist/compiler/compiler.js", "dist/compiler/baselib-plain-pretty.js", "dist/tools/python/lowerer.js", "dist/build-receipt.json"];
    execFileSync(process.execPath, [path.join(root, "bin/sagejs-source.cjs"), "compile", "--python", "--bare", "--output", output, fixture], { cwd: root, stdio: "inherit" });
    return { filename, root, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      buildCompletedAt: JSON.parse(fs.readFileSync(path.join(root, "dist/build-receipt.json"))).completedAt,
      inputs: Object.fromEntries(inputs.map(name => [name, sha(path.join(root, name))])),
      sha256: sha(output), bytes: fs.statSync(output).size };
  });
  fs.writeFileSync(path.join(location, "identity.json"), JSON.stringify({ fixtureSha256: sha(fixture), driverSha256: sha(__filename), artifacts }, null, 2) + "\n");
} else if (mode === "check" || mode === "run") {
  const filename = path.resolve(location);
  const identity = JSON.parse(fs.readFileSync(path.join(path.dirname(filename), "identity.json")));
  const artifact = identity.artifacts.find(item => item.filename === path.basename(filename));
  assert.ok(artifact);
  assert.equal(sha(filename), artifact.sha256);
  assert.equal(sha(__filename), identity.driverSha256);
  assert.equal(sha(fixture), identity.fixtureSha256);
  const compiled = new Module(filename, module);
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(fs.readFileSync(filename, "utf8") + '\nmodule.exports = ρσ_modules["__main__"];\n', filename);
  const api = compiled.exports;
  for (const name of names) assert.equal(typeof api[name], "function");
  assert.equal(api.correctness(), true);
  const results = [];
  if (mode === "run") {
    for (const [name, n] of [["control", 1000000], ["calls", 1000000], ["plain_create", 20000], ["plain_resume", 500000], ["owned_create", 20000], ["owned_resume", 500000]]) {
      const samples = [];
      for (let iteration = 0; iteration < 10; iteration++) {
        const begin = process.hrtime.bigint();
        const result = api[name](n);
        const seconds = Number(process.hrtime.bigint() - begin) / 1e9;
        if (name.endsWith("create")) {
          assert.equal(result.length, n);
          api.validate_created(result);
        } else assert.equal(result, name.endsWith("resume") ? n * (n - 1) / 2 : n * (n + 1) / 2);
        samples.push({ iteration, warmup: iteration < 3, seconds });
      }
      results.push({ name, n, samples });
    }
  }
  console.log(JSON.stringify({ schema: "sagejs.handled-state-cost/v1", node: process.version, nodeSha256: sha(process.execPath), artifact, fixtureSha256: identity.fixtureSha256, driverSha256: identity.driverSha256, correctness: true, results }));
} else throw new Error("Usage: driver.cjs prepare DIRECTORY ROOT244 ROOT249 | check|run ARTIFACT");

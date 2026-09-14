"use strict";
// Untimed harness validation, not performance qualification.
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createHash } = require("node:crypto");
const m = JSON.parse(fs.readFileSync(process.argv[2]));
for (const [key, file] of Object.entries({exe:m.exe, pariExe:m.pariExe,
  fixture:m.fixturePath, input:m.inputPath})) {
  assert.equal(createHash("sha256").update(fs.readFileSync(file)).digest("hex"), m.hashes[key]);
}
const fixture = JSON.parse(fs.readFileSync(m.fixturePath));
const dynamic = path.join(__dirname, "run_small_norm_dynamic.cjs");
for (const [name, exe, args, input] of [
  ["core", m.exe, ["1"], fs.readFileSync(m.inputPath)],
  ["pari", m.pariExe, ["1"], undefined],
  ["javascript", process.execPath, [dynamic, m.preparedManifest, "javascript", "1"], undefined],
  ["gmp", process.execPath, [dynamic, m.preparedManifest, "gmp", "1"], undefined],
]) {
  const r = spawnSync(exe, args, {input, encoding:"utf8", timeout:60000, maxBuffer:4000000});
  assert.equal(r.status, 0, r.stderr);
  const rows = r.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(rows.length, fixture.cases.length);
  for (const [i, row] of rows.entries()) {
    const {index, seconds, repetitions, ...actual} = row;
    assert.equal(index, i);
    assert(Number.isFinite(seconds) && seconds >= 0);
    if (name === "pari") assert.equal(repetitions, 1);
    else assert.equal(repetitions, undefined);
    assert.deepEqual(actual, fixture.cases[i].expected, name + i);
  }
  console.log(JSON.stringify({qualified:false, name, cases:rows.length,
    diagnosticSeconds:rows.reduce((sum, row) => sum + row.seconds, 0)}));
}

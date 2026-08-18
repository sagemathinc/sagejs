#!/usr/bin/env node

/** Regenerate the Sage/PARI corpus once and compare all deterministic data. */

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "../..");
const sage = process.env.SAGE_ORACLE || "/home/user/sagelite/sage";
const generator = resolve(root, "upstream-tests/sage/elliptic-lseries.sage");
const spec = resolve(root, "test/data/elliptic-lseries/corpus-spec.json");
const expectedPath = resolve(root, "test/data/elliptic-lseries/sage-pari-oracles.json");
const directory = mkdtempSync(join(tmpdir(), "sagejs-lseries-sage-"));
const regeneratedPath = join(directory, "oracles.json");

function deterministic(corpus) {
  const copy = structuredClone(corpus);
  delete copy.provenance.captured_on;
  delete copy.provenance.platform;
  delete copy.provenance.total_capture_seconds;
  for (const record of copy.records) delete record.capture_seconds;
  return copy;
}

try {
  const result = spawnSync(sage, ["-python", generator, spec, regeneratedPath], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`Sage/PARI capture exited with status ${result.status}`);
  }
  const expected = JSON.parse(readFileSync(expectedPath));
  const regenerated = JSON.parse(readFileSync(regeneratedPath));
  assert.deepEqual(deterministic(regenerated), deterministic(expected));
  process.stdout.write(
    `Sage/PARI capture reproduced ${regenerated.records.reduce((sum, record) => sum + record.values.length, 0)} values in one process\n`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}

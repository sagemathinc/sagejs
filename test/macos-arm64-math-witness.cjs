"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const root = resolve(__dirname, "..");
const script = join(root, "bench", "macos-arm64-math-witness.cjs");

function entry(name, comparable, warm) {
  return {
    name,
    family: "matrix",
    comparable,
    ok: true,
    first_ms: warm + 1,
    warm_ms: warm,
    summary: [name],
    first_summary_matches: true,
  };
}

function render(measurements) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-macos-witness-test-"));
  try {
    const input = join(directory, "report.json");
    writeFileSync(input, JSON.stringify({
      repository: { commit: "test" },
      host: { cpu: "test-cpu", platform: "darwin", architecture: "arm64" },
      measurements,
    }));
    return execFileSync(process.execPath, [script, "--render-report", input], {
      cwd: root,
      encoding: "utf8",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("witness Markdown does not compare unlike serialization formats", () => {
  const markdown = render({
    sagejs: [entry("QQ.matrix.dump", false, 2)],
    sage: [entry("QQ.matrix.dump", false, 1)],
  });
  assert.match(markdown, /\| QQ\.matrix\.dump \| 3\.000 ms \| 2\.000 ms \| 1\.000 ms \| — \| runtime-local \|/);
  assert.doesNotMatch(markdown, /2\.00×/);
});

test("single-Sage Markdown labels its runtime honestly", () => {
  const markdown = render({ sage: [entry("ZZ.matrix.str", true, 4)] });
  assert.match(markdown, /\| operation \| Sage first \| Sage warm \| status \|/);
  assert.match(markdown, /\| ZZ\.matrix\.str \| 5\.000 ms \| 4\.000 ms \| ok \|/);
  assert.doesNotMatch(markdown, /\| Sage\.js first \||\| ratio \|/);
});

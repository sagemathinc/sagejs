#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "../../..");
const corpus = JSON.parse(readFileSync(join(root, "test/browser-wasm-parity-corpus.json")));

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const tier = option("--tier", "release");
const receiptPath = option("--receipt", null);
const cases = corpus.cases.filter((item) => item.tier === tier);
if (cases.length === 0) throw new Error(`no ${tier} public corpus cases`);

const temporary = mkdtempSync(join(tmpdir(), "sagejs-node-wasm-parity-"));
const results = [];
try {
  for (const item of cases) {
    const diagnostics = join(temporary, `${item.id}.json`);
    const expectedOutput = `${item.expect.stdout}${item.expect.repr
      ? `${item.expect.repr}\n`
      : ""}`;
    const run = spawnSync(
      process.execPath,
      [
        join(root, "packages/flint-wasm/node-cli.mjs"),
        "--timeout",
        String(item.timeout_ms),
        "--diagnostics-file",
        diagnostics,
        "-c",
        item.source,
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: item.timeout_ms + 30_000,
        env: { ...process.env, GITHUB_SHA: process.env.GITHUB_SHA ?? "" },
      },
    );
    assert.equal(run.status, 0, `${item.id} failed:\n${run.stderr}`);
    assert.equal(run.stdout, expectedOutput, `${item.id} output drifted`);
    const diagnostic = JSON.parse(readFileSync(diagnostics, "utf8"));
    assert.equal(diagnostic.outcome, "ok", `${item.id} did not complete`);
    const observed = new Set((diagnostic.instrumentation?.routes ?? []).map((route) =>
      `${route.capability_id}\0${route.selected_route}`
    ));
    for (const requirement of item.requires) {
      assert.ok(
        observed.has(`${requirement.id}\0${requirement.route}`),
        `${item.id} did not observe ${requirement.id} via ${requirement.route}`,
      );
    }
    results.push({
      id: item.id,
      status: "passed",
      elapsed_ms: diagnostic.elapsed_ms,
      instrumentation: diagnostic.instrumentation,
      artifact_identity: diagnostic.artifact_identity,
      source_revision: diagnostic.source_revision,
    });
  }
  const identities = [...new Set(results.map((item) => item.artifact_identity))];
  const revisions = [...new Set(results.map((item) => item.source_revision))];
  assert.equal(identities.length, 1, "CLI corpus used more than one artifact");
  assert.equal(revisions.length, 1, "CLI corpus used more than one source revision");
  const receipt = {
    schema: "sagejs.node-wasm-cli-parity/v1",
    tier,
    artifact_identity: identities[0],
    source_revision: revisions[0],
    cases: results,
  };
  if (receiptPath) writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`Node-Wasm CLI ${tier} corpus passed (${results.length}/${results.length}).`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

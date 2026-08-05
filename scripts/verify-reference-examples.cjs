#!/usr/bin/env node
"use strict";

const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const { createSage } = require("../dist/tools/kernel.js");
const {
  collectReferenceSources,
  combinedFixture,
  examplesForEntry,
} = require("./reference-examples.cjs");

const root = join(__dirname, "..");

async function main() {
  const session = await createSage();
  let catalog;
  try {
    catalog = await session.documentation();
  } finally {
    await session.close();
  }
  const sources = collectReferenceSources(root);
  const examplesById = new Map();
  for (const entry of catalog.entries) {
    for (const example of examplesForEntry(entry, sources)) {
      examplesById.set(example.id, example);
    }
  }
  // Keep the committed verification artifact byte-for-byte reproducible.
  // Release provenance belongs to the build attestation, while every example
  // ID already contains its exact source path and line.
  const revision = "working-tree";
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-reference-"));
  const fixture = join(temporary, "reference.doctests.json");
  const expectations = join(temporary, "reference.expectations.json");
  const results = join(temporary, "reference.results.json");
  writeFileSync(
    fixture,
    JSON.stringify(combinedFixture([...examplesById.values()], revision), null, 2),
  );
  const mergedExpectations = {
    schema: "sagejs.sage-doctest-expectations/v1",
    fixture: "reference.doctests.json",
    skip: {},
    xfail: {},
  };
  const attachedIds = new Set(examplesById.keys());
  const pending = [join(root, "upstream-tests", "sage")];
  while (pending.length) {
    const directory = pending.pop();
    for (const item of require("node:fs").readdirSync(
      directory, { withFileTypes: true },
    )) {
      const path = join(directory, item.name);
      if (item.isDirectory()) pending.push(path);
      else if (item.name.endsWith(".expectations.json")) {
        const source = JSON.parse(readFileSync(path, "utf8"));
        for (const kind of ["skip", "xfail"]) {
          for (const [id, reason] of Object.entries(source[kind] ?? {})) {
            if (attachedIds.has(id)) mergedExpectations[kind][id] = reason;
          }
        }
      }
    }
  }
  writeFileSync(expectations, JSON.stringify(mergedExpectations, null, 2));
  const run = spawnSync(process.execPath, [
    join(root, "scripts", "run-sage-doctests.cjs"),
    fixture,
    "--expectations", expectations,
    "--optional", "sage.plot",
    "--random-seed", "sagejs-reference-0",
    "--allow-failures",
    "--write-results", results,
  ], { cwd: root, encoding: "utf8" });
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
  if (run.status !== 0) process.exit(run.status ?? 1);
  const report = JSON.parse(readFileSync(results, "utf8"));
  report.revision = revision;
  writeFileSync(
    join(root, "website", "reference-results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Wrote website/reference-results.json");
  if (report.counts.fail || report.counts.xpass) {
    throw new Error(
      `reference verification has ${report.counts.fail} failures and ` +
      `${report.counts.xpass} unexpected passes`,
    );
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});

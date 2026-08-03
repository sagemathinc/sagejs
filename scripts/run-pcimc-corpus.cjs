#!/usr/bin/env node
"use strict";

const { readFileSync, writeFileSync } = require("node:fs");
const { basename, join, resolve } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");
const {
  prepareSubmittedPolyglotCell,
  rewriteQuestionMarkHelp,
} = require("../dist/tools/polyglot.js");

const root = resolve(__dirname, "..");
const corpus = join(root, "upstream-tests", "pcimc");

function parseArguments(argv) {
  const options = {
    allowFailures: false,
    verbose: false,
    timeout: 30_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--allow-failures") options.allowFailures = true;
    else if (value === "--verbose") options.verbose = true;
    else if (value === "--only") options.only = new RegExp(argv[++index]);
    else if (value === "--file") options.file = new RegExp(argv[++index]);
    else if (value === "--timeout") options.timeout = Number(argv[++index]);
    else if (value === "--write-results") {
      options.results = resolve(argv[++index]);
    } else throw new Error(`unknown option: ${value}`);
  }
  return options;
}

function loadJson(filename) {
  return JSON.parse(readFileSync(join(corpus, filename), "utf8"));
}

function prepareCell(cell) {
  let source = cell.source;
  let language = "sage";
  const magic = source.match(/^\s*%%([A-Za-z0-9_]+)\s*(?:\r?\n|$)/);
  if (magic) {
    const name = magic[1].toLowerCase();
    source = source.slice(magic[0].length);
    if (name === "time") {
      // Timing text is deliberately not an oracle; the cell body is.
    } else if (name === "python" || name === "python3") {
      language = "python";
    } else if (name === "mathematica") {
      language = "wolfram";
    } else {
      language = name;
    }
  }
  return prepareSubmittedPolyglotCell({
    language,
    source: rewriteQuestionMarkHelp(source, language),
    cursorOffset: 0,
    hasMagic: Boolean(magic),
  });
}

function selectedDocuments(fixture, options) {
  return fixture.documents
    .filter((document) => !options.file || options.file.test(document.path))
    .map((document) => ({
      ...document,
      cells: document.cells.filter(
        (cell) =>
          !options.only ||
          options.only.test(cell.id) ||
          options.only.test(cell.source),
      ),
    }))
    .filter((document) => document.cells.length);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const fixture = loadJson("cells.json");
  const source = loadJson("SOURCE.json");
  const expectations = loadJson("expectations.json");
  if (JSON.stringify(fixture.source) !== JSON.stringify(source)) {
    throw new Error("PCIMC fixture provenance is stale; run pnpm pcimc:extract");
  }
  if (expectations.fixture !== "cells.json") {
    throw new Error("PCIMC expectations refer to an unknown fixture");
  }
  const documents = selectedDocuments(fixture, options);
  const selected = documents.flatMap((document) => document.cells);
  const knownIds = new Set(
    fixture.documents.flatMap((document) =>
      document.cells.map((cell) => cell.id),
    ),
  );
  if (!options.only && !options.file) {
    for (const id of [
      ...Object.keys(expectations.skip ?? {}),
      ...Object.keys(expectations.run ?? {}),
      ...Object.keys(expectations.xfail ?? {}),
    ]) {
      if (!knownIds.has(id)) {
        throw new Error(`expectation refers to unknown cell: ${id}`);
      }
    }
  }

  const counts = {
    pass: 0,
    fail: 0,
    skip: 0,
    xfail: 0,
    xpass: 0,
  };
  const byFile = {};
  const results = [];

  function record(document, cell, status, error, reason) {
    counts[status] += 1;
    byFile[document.path] ??= {};
    byFile[document.path][status] =
      (byFile[document.path][status] ?? 0) + 1;
    results.push({
      id: cell.id,
      kind: document.kind,
      path: document.path,
      section: cell.section,
      status,
      reason,
      error,
      source: cell.source,
    });
  }

  for (const document of documents) {
    const session = await createSage();
    try {
      for (const cell of document.cells) {
        const automaticSkip =
          cell.classification === "executable"
            ? undefined
            : cell.classification;
        const reason =
          expectations.skip?.[cell.id] ??
          (expectations.run?.[cell.id] ? undefined : automaticSkip);
        if (reason) {
          record(document, cell, "skip", undefined, reason);
          if (options.verbose) {
            process.stdout.write(`SKIP  ${cell.id} — ${reason}\n`);
          }
          continue;
        }

        let error;
        try {
          const prepared = prepareCell(cell);
          await session.evaluate(prepared.source, {
            filename: cell.id,
            language: prepared.language,
            timeout: options.timeout,
          });
        } catch (caught) {
          error = `${caught.name ?? "Error"}: ${caught.message ?? caught}`;
        }

        const expectedFailure = expectations.xfail?.[cell.id];
        let status;
        if (expectedFailure) status = error ? "xfail" : "xpass";
        else status = error ? "fail" : "pass";
        record(document, cell, status, error, expectedFailure);
        if (options.verbose || status === "fail" || status === "xpass") {
          process.stdout.write(
            `${status.toUpperCase().padEnd(5)} ${cell.id}` +
              `${expectedFailure ? ` — ${expectedFailure}` : ""}\n`,
          );
          if (error) process.stdout.write(`  ${error}\n`);
        }
      }
    } finally {
      await session.close();
    }
  }

  if (options.results) {
    writeFileSync(
      options.results,
      `${JSON.stringify(
        {
          schema: "sagejs.pcimc-results/v1",
          source: fixture.source,
          counts,
          byFile,
          results,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
  for (const [path, fileCounts] of Object.entries(byFile)) {
    const summary = Object.entries(fileCounts)
      .map(([status, count]) => `${count} ${status}`)
      .join(", ");
    process.stdout.write(`${basename(path)}: ${summary}\n`);
  }
  process.stdout.write(
    `PCIMC corpus: ${counts.pass} passed, ${counts.xfail} xfailed, ` +
      `${counts.skip} skipped, ${counts.fail} failed, ` +
      `${counts.xpass} xpassed (${selected.length} selected)\n`,
  );
  if (
    !options.allowFailures &&
    (counts.fail > 0 || counts.xpass > 0)
  ) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  prepareCell,
};

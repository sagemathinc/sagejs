#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const corpus = join(root, "upstream-tests", "pcimc");
const bookCheckout = join(corpus, "source");
const homeworkCheckout = join(corpus, "homework-source");
const metadata = JSON.parse(
  readFileSync(join(corpus, "SOURCE.json"), "utf8"),
);

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `PCIMC source submodule is unavailable at ${cwd}; run ` +
        "`git submodule update --init upstream-tests/pcimc/source " +
        "upstream-tests/pcimc/homework-source`",
    );
  }
  return result.stdout.trim();
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function headingText(line) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+#+\s*$/, "")
    .trim();
}

function classifyCell(source, kind) {
  // Homework notebooks combine student-fillable functions with the checks
  // and benchmarks that depend on those answers. Keep every cell in the
  // inventory, but do not pretend the unfilled notebooks are programs.
  if (kind === "homework") return "exercise-template";
  if (/^\s*!/.test(source) || /^\s*%%!/.test(source)) {
    return "notebook-shell";
  }
  const magic = source.match(/^\s*%%([A-Za-z0-9_]+)/)?.[1].toLowerCase();
  if (magic === "time") return "benchmark";
  if (
    magic &&
    ![
      "time",
      "sage",
      "python",
      "python3",
      "magma",
      "matlab",
      "maple",
      "wolfram",
      "mathematica",
    ].includes(magic)
  ) {
    return "unsupported-cell-magic";
  }
  return "executable";
}

function splitMystCellBody(body) {
  if (body[0] !== "---") return { source: body.join("\n") };
  const end = body.indexOf("---", 1);
  if (end < 0) {
    throw new Error("unterminated MyST cell metadata block");
  }
  return {
    metadata: body.slice(1, end).join("\n"),
    source: body.slice(end + 1).join("\n"),
  };
}

function extractMyst(path, source) {
  const lines = source.split("\n");
  const cells = [];
  let section = "";
  for (let index = 0; index < lines.length; index += 1) {
    if (/^#{1,6}\s+/.test(lines[index])) {
      section = headingText(lines[index]);
      continue;
    }
    if (!/^```\{code-cell\}(?:\s+\S+)?\s*$/.test(lines[index])) continue;
    const line = index + 1;
    const body = [];
    index += 1;
    while (index < lines.length && lines[index] !== "```") {
      body.push(lines[index]);
      index += 1;
    }
    if (index >= lines.length) {
      throw new Error(`${path}:${line}: unterminated MyST code cell`);
    }
    const parsed = splitMystCellBody(body);
    const cellSource = parsed.source;
    cells.push({
      id: `book/${path}:${line}`,
      line,
      section,
      ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
      source: cellSource,
      classification: classifyCell(cellSource, "book"),
    });
  }
  return cells;
}

function markdownHeading(cell, current) {
  if (cell.cell_type !== "markdown") return current;
  for (const line of cell.source.join("").split("\n")) {
    if (/^#{1,6}\s+/.test(line)) current = headingText(line);
  }
  return current;
}

function extractNotebook(path, notebook) {
  const cells = [];
  let section = "";
  let codeIndex = 0;
  for (let index = 0; index < notebook.cells.length; index += 1) {
    const cell = notebook.cells[index];
    section = markdownHeading(cell, section);
    if (cell.cell_type !== "code") continue;
    codeIndex += 1;
    const source = cell.source.join("").replace(/\n$/, "");
    cells.push({
      id: `homework/${path}:cell-${codeIndex}`,
      cell: codeIndex,
      notebookIndex: index,
      section,
      source,
      classification: classifyCell(source, "homework"),
    });
  }
  return cells;
}

function sourceEntry(path, source, cells) {
  return {
    path,
    sha256: sha256(source),
    lines: source.split("\n").length,
    cells,
  };
}

for (const [name, checkout] of [
  ["book", bookCheckout],
  ["homework", homeworkCheckout],
]) {
  const revision = git(checkout, "rev-parse", "HEAD");
  if (revision !== metadata[name].revision) {
    throw new Error(
      `${name} submodule is at ${revision}, expected ${metadata[name].revision}`,
    );
  }
}

const bookFiles = readdirSync(bookCheckout)
  .filter((name) => /^\d\d-.*\.md$/.test(name))
  .sort()
  .map((path) => {
    const source = readFileSync(join(bookCheckout, path), "utf8");
    return sourceEntry(path, source, extractMyst(path, source));
  });
const homeworkFiles = readdirSync(homeworkCheckout)
  .filter((name) => /^hw\d+\.ipynb$/.test(name))
  .sort()
  .map((path) => {
    const source = readFileSync(join(homeworkCheckout, path), "utf8");
    return sourceEntry(
      path,
      source,
      extractNotebook(path, JSON.parse(source)),
    );
  });

const documents = [
  ...bookFiles.map((file) => ({ kind: "book", ...file })),
  ...homeworkFiles.map((file) => ({ kind: "homework", ...file })),
];
const allCells = documents.flatMap((document) => document.cells);
const classifications = {};
for (const cell of allCells) {
  classifications[cell.classification] =
    (classifications[cell.classification] ?? 0) + 1;
}

const fixture = {
  schema: "sagejs.pcimc-cells/v1",
  generatedBy: "scripts/extract-pcimc-corpus.cjs",
  source: metadata,
  summary: {
    documents: documents.length,
    bookChapters: bookFiles.length,
    homeworkNotebooks: homeworkFiles.length,
    cells: allCells.length,
    classifications,
  },
  documents,
};
mkdirSync(corpus, { recursive: true });
writeFileSync(
  join(corpus, "cells.json"),
  `${JSON.stringify(fixture, null, 2)}\n`,
  "utf8",
);
writeFileSync(
  join(corpus, "manifest.json"),
  `${JSON.stringify(
    {
      schema: "sagejs.pcimc-manifest/v1",
      generatedBy: fixture.generatedBy,
      source: metadata,
      fixture: "cells.json",
      summary: fixture.summary,
      sourceFiles: documents.map(({ kind, path, sha256, lines, cells }) => ({
        kind,
        path,
        sha256,
        lines,
        cells: cells.length,
      })),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

process.stdout.write(
  `PCIMC ${metadata.book.revision.slice(0, 12)} / ` +
    `${metadata.homework.revision.slice(0, 12)}: ${allCells.length} cells ` +
    `in ${documents.length} documents (${JSON.stringify(classifications)})\n`,
);

module.exports = {
  classifyCell,
  extractMyst,
  extractNotebook,
  splitMystCellBody,
};

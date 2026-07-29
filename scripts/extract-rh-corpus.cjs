#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { join, relative, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { extractSageDoctests } = require("../tools/sage-doctest-fixture.cjs");

const root = resolve(__dirname, "..");
const corpus = join(root, "upstream-tests", "rh");
const checkout = join(corpus, "source");
const sourceMetadata = JSON.parse(
  readFileSync(join(corpus, "SOURCE.json"), "utf8"),
);

function git(...args) {
  const result = spawnSync("git", args, {
    cwd: checkout,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      "RH source submodule is unavailable; run " +
        "`git submodule update --init upstream-tests/rh/source`",
    );
  }
  return result.stdout.trim();
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function writeJson(filename, value) {
  mkdirSync(corpus, { recursive: true });
  writeFileSync(
    join(corpus, filename),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function extractBookSession(tex, path) {
  const lines = tex.split("\n");
  const examples = [];
  let active = false;
  let pending;

  function finishPending() {
    if (!pending) return;
    examples.push(pending);
    pending = undefined;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw.includes("We verify the factorization above in SageMath")) {
      active = true;
      continue;
    }
    if (!active) continue;
    if (raw.includes("} and \\bibnote")) {
      finishPending();
      break;
    }

    const line = raw.replaceAll("\\_", "_").replace(/\\\\\s*$/, "");
    const prompt = line.match(/^sage:\s?(.*)$/);
    if (prompt) {
      finishPending();
      pending = {
        id: `${path}:${index + 1}`,
        line: index + 1,
        source: prompt[1],
        want: "",
        tags: [],
      };
      continue;
    }
    if (
      !pending ||
      !line.trim() ||
      line.trim() === "{\\sf" ||
      line.trim() === "}"
    ) {
      continue;
    }
    if (/^\d+$/.test(line.trim()) && /=\s*\d+$/.test(pending.source)) {
      pending.source += line.trim();
      continue;
    }
    pending.want += `${line.trim()}\n`;
  }

  return {
    schema: "sagejs.rh-book-session/v1",
    generatedBy: "scripts/extract-rh-corpus.cjs",
    source: {
      repository: sourceMetadata.repository,
      revision: sourceMetadata.revision,
      path,
      sha256: sha256(tex),
      license: sourceMetadata.license,
    },
    summary: { examples: examples.length },
    examples,
  };
}

function topLevelFigureGenerators(source) {
  const figures = [];
  const pattern = /^def (fig_[A-Za-z0-9_]+)\(([^)]*)\):/gm;
  for (const match of source.matchAll(pattern)) {
    const line = source.slice(0, match.index).split("\n").length;
    figures.push({
      id: `rh/code/code.sage:${line}`,
      name: match[1],
      line,
      parameters: match[2],
    });
  }
  return figures;
}

const revision = git("rev-parse", "HEAD");
if (revision !== sourceMetadata.revision) {
  throw new Error(
    `RH submodule is at ${revision}, expected ${sourceMetadata.revision}`,
  );
}

const codePath = "rh/code/code.sage";
const texPath = "rh/rh.tex";
const worksheetPath = "rh/code/code.sagews";
const code = readFileSync(join(checkout, codePath), "utf8");
const tex = readFileSync(join(checkout, texPath), "utf8");
const worksheet = readFileSync(join(checkout, worksheetPath), "utf8");

const doctests = extractSageDoctests(code, {
  repository: sourceMetadata.repository,
  revision,
  path: codePath,
  license: sourceMetadata.license,
});
const bookSession = extractBookSession(tex, texPath);
const figures = topLevelFigureGenerators(code);
const worksheetCells = [...worksheet.matchAll(/^︠/gm)].length;

writeJson("code.doctests.json", doctests);
writeJson("book-session.json", bookSession);
writeJson("manifest.json", {
  schema: "sagejs.rh-compatibility-manifest/v1",
  generatedBy: "scripts/extract-rh-corpus.cjs",
  source: {
    repository: sourceMetadata.repository,
    revision,
    license: sourceMetadata.license,
  },
  canonical: {
    doctests: {
      fixture: "code.doctests.json",
      examples: doctests.summary.examples,
      groups: doctests.summary.groups,
    },
    bookSession: {
      fixture: "book-session.json",
      examples: bookSession.summary.examples,
    },
    figureGenerators: figures,
  },
  excludedInventories: [
    {
      path: worksheetPath,
      count: worksheetCells,
      classification: "historical-development-transcript",
      reason:
        "Exploratory worksheet cells include UI commands, timing output, " +
        "repeated loads, and recorded failures; canonical behavior is " +
        "promoted into explicit fixtures instead.",
    },
  ],
  sourceFiles: [
    {
      path: codePath,
      sha256: sha256(code),
      lines: code.split("\n").length,
    },
    {
      path: texPath,
      sha256: sha256(tex),
      lines: tex.split("\n").length,
    },
  ],
});

process.stdout.write(
  `RH ${revision.slice(0, 12)}: ${doctests.summary.examples} doctests, ` +
    `${bookSession.summary.examples} book-session examples, ` +
    `${figures.length} figure generators; ` +
    `${worksheetCells} historical worksheet cells classified separately\n`,
);

#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} = require("node:fs");
const { join, relative, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  extractRstSageDoctests,
} = require("../tools/sage-doctest-fixture.cjs");

const root = resolve(__dirname, "..");
const corpus = join(root, "upstream-tests", "sage", "prep");
const metadata = JSON.parse(
  readFileSync(join(corpus, "SOURCE.json"), "utf8"),
);

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write("Usage: extract-sage-prep.cjs --sage-root DIR\n");
  process.exit(message ? 2 : 0);
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--") continue;
    if (argv[index] === "--help") usage();
    if (argv[index] !== "--sage-root") {
      usage(`unexpected argument: ${argv[index]}`);
    }
    options.sageRoot = resolve(argv[++index] ?? "");
  }
  if (!options.sageRoot) usage("--sage-root is required");
  return options;
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
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

function rstFiles(directory) {
  const answer = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) answer.push(...rstFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".rst")) answer.push(absolute);
  }
  return answer.sort();
}

const options = parseArguments(process.argv.slice(2));
const revision = git(options.sageRoot, "rev-parse", "HEAD");
if (revision !== metadata.revision) {
  throw new Error(
    `Sage checkout is at ${revision}, expected ${metadata.revision}`,
  );
}

const sourceDirectory = join(options.sageRoot, "src", "doc", "en", "prep");
const groups = [];
const sourceFiles = [];
for (const absolute of rstFiles(sourceDirectory)) {
  const source = readFileSync(absolute, "utf8");
  const path = relative(options.sageRoot, absolute).replaceAll("\\", "/");
  const fixture = extractRstSageDoctests(source, {
    repository: metadata.repository,
    revision,
    path,
    license: metadata.license,
  });
  if (fixture.summary.examples) groups.push(...fixture.groups);
  sourceFiles.push({
    path,
    sha256: sha256(source),
    lines: source.split("\n").length,
    examples: fixture.summary.examples,
  });
}

const examples = groups.reduce(
  (total, group) => total + group.examples.length,
  0,
);
writeJson("prep.doctests.json", {
  schema: "sagejs.sage-doctests/v1",
  generatedBy: "scripts/extract-sage-prep.cjs",
  source: {
    repository: metadata.repository,
    revision,
    path: metadata.path,
    license: metadata.license,
    files: sourceFiles,
  },
  summary: { groups: groups.length, examples },
  groups,
});
writeJson("manifest.json", {
  schema: "sagejs.sage-prep-manifest/v1",
  generatedBy: "scripts/extract-sage-prep.cjs",
  source: metadata,
  fixture: "prep.doctests.json",
  summary: {
    files: sourceFiles.length,
    groups: groups.length,
    examples,
  },
  sourceFiles,
});

process.stdout.write(
  `Sage PREP ${revision.slice(0, 12)}: ${examples} examples ` +
    `from ${sourceFiles.length} source files\n`,
);

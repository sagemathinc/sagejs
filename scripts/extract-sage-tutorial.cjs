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
const corpus = join(root, "upstream-tests", "sage", "tutorial");
const metadata = JSON.parse(
  readFileSync(join(corpus, "SOURCE.json"), "utf8"),
);

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(
    "Usage: extract-sage-tutorial.cjs --sage-root DIR\n",
  );
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

const options = parseArguments(process.argv.slice(2));
const revision = git(options.sageRoot, "rev-parse", "HEAD");
if (revision !== metadata.revision) {
  throw new Error(
    `Sage checkout is at ${revision}, expected ${metadata.revision}`,
  );
}

const sourceDirectory = join(
  options.sageRoot,
  "src",
  "doc",
  "en",
  "tutorial",
);
const filenames = readdirSync(sourceDirectory)
  .filter((name) => /^tour(?:_[a-z]+)?\.rst$/.test(name))
  .sort();
const fixtures = [];
const groups = [];
const sourceFiles = [];

for (const filename of filenames) {
  const absolute = join(sourceDirectory, filename);
  const source = readFileSync(absolute, "utf8");
  const path = relative(options.sageRoot, absolute);
  const fixture = extractRstSageDoctests(source, {
    repository: metadata.repository,
    revision,
    path,
    license: metadata.license,
  });
  fixtures.push(fixture);
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
writeJson("guided-tour.doctests.json", {
  schema: "sagejs.sage-doctests/v1",
  generatedBy: "scripts/extract-sage-tutorial.cjs",
  source: {
    repository: metadata.repository,
    revision,
    path: "src/doc/en/tutorial/tour*.rst",
    license: metadata.license,
    files: sourceFiles,
  },
  summary: { groups: groups.length, examples },
  groups,
});
writeJson("manifest.json", {
  schema: "sagejs.sage-tutorial-manifest/v1",
  generatedBy: "scripts/extract-sage-tutorial.cjs",
  source: metadata,
  fixture: "guided-tour.doctests.json",
  summary: {
    files: sourceFiles.length,
    groups: groups.length,
    examples,
  },
  sourceFiles,
});

process.stdout.write(
  `Sage Guided Tour ${revision.slice(0, 12)}: ${examples} examples ` +
    `from ${sourceFiles.length} source files\n`,
);

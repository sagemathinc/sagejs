#!/usr/bin/env node
"use strict";

const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { dirname, relative, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  extractSageDoctests,
  filterSageDoctests,
} = require("../tools/sage-doctest-fixture.cjs");

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(
    "Usage: extract-sage-doctests.cjs --source FILE --output FILE [--root DIR]\n" +
      "       [--repository URL] [--revision REV] [--license SPDX-ID]\n" +
      "       [--owner-regexp REGEXP]\n",
  );
  process.exit(message ? 2 : 0);
}

function argumentsFrom(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--help") usage();
    if (!name.startsWith("--")) usage(`unexpected argument: ${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) usage(`missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  if (!options.source || !options.output) {
    usage("--source and --output are required");
  }
  return options;
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) return;
  return result.stdout.trim();
}

const options = argumentsFrom(process.argv.slice(2));
const sourceFile = resolve(options.source);
const inferredRoot =
  options.root && resolve(options.root) ||
  git(dirname(sourceFile), "rev-parse", "--show-toplevel");
if (!inferredRoot) usage("could not infer the source repository root");

const repository =
  options.repository ||
  git(inferredRoot, "remote", "get-url", "origin") ||
  "unknown";
const revision =
  options.revision || git(inferredRoot, "rev-parse", "HEAD") || "unknown";
const sourcePath = relative(inferredRoot, sourceFile);
const source = readFileSync(sourceFile, "utf8");
let fixture = extractSageDoctests(source, {
  repository,
  revision,
  path: sourcePath,
  license: options.license,
});
if (options["owner-regexp"]) {
  fixture = filterSageDoctests(fixture, {
    ownerPattern: new RegExp(options["owner-regexp"]),
  });
}

const output = resolve(options.output);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
process.stdout.write(
  `Extracted ${fixture.summary.examples} examples in ` +
    `${fixture.summary.groups} groups from ${sourcePath}\n`,
);

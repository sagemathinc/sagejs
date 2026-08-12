#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { relative, resolve } = require("node:path");

const declarations = require("../tools/ffi/declarations.cjs");
const hostAdapters = require("../tools/ffi/host-adapters.cjs");

const ROOT = resolve(__dirname, "..");
const GENERATED_SNAPSHOTS = [
  "architecture/native-boundaries.json",
  "architecture/native-exports.json",
];

function repositoryPath(root, filename) {
  return relative(root, resolve(filename)).replaceAll("\\", "/");
}

function expectedGeneratedPaths(root = ROOT) {
  const resolvedRoot = resolve(root);
  const registry = declarations.loadRegistry({ root: resolvedRoot });
  const paths = new Set(GENERATED_SNAPSHOTS);
  for (const declaration of registry.libraries) {
    paths.add(repositoryPath(resolvedRoot, declaration.filename));
    for (const filename of declarations.generatedModulePaths(
      resolvedRoot,
      declaration,
    )) {
      paths.add(repositoryPath(resolvedRoot, filename));
    }
    paths.add(repositoryPath(
      resolvedRoot,
      hostAdapters.generatedHostAdapterPath(resolvedRoot, declaration),
    ));
  }
  return [...paths].sort();
}

function trackedPaths(root = ROOT) {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  }).split("\0").filter(Boolean).sort();
}

function generatedAttributes(paths, root = ROOT) {
  if (paths.length === 0) return new Map();
  const output = execFileSync(
    "git",
    ["check-attr", "-z", "--stdin", "linguist-generated"],
    {
      cwd: root,
      encoding: "utf8",
      input: `${paths.join("\0")}\0`,
    },
  ).split("\0");
  const result = new Map();
  for (let index = 0; index + 2 < output.length; index += 3) {
    const [path, attribute, value] = output.slice(index, index + 3);
    if (attribute !== "linguist-generated") {
      throw new Error(`unexpected Git attribute ${attribute} for ${path}`);
    }
    result.set(path, value);
  }
  return result;
}

function validateClassification(expected, tracked, attributes) {
  const expectedSet = new Set(expected);
  const trackedSet = new Set(tracked);
  const missing = expected.filter((path) => !trackedSet.has(path));
  if (missing.length > 0) {
    throw new Error(
      `expected generated artifacts are not tracked:\n  ${missing.join("\n  ")}`,
    );
  }
  const classified = (path) => {
    const value = attributes.get(path);
    if (value === "set" || value === "true") return true;
    if (value === "unset" || value === "unspecified") return false;
    throw new Error(
      `${path} has ambiguous linguist-generated value ${JSON.stringify(value)}`,
    );
  };
  const incorrectlyUnclassified = expected.filter((path) => !classified(path));
  if (incorrectlyUnclassified.length > 0) {
    throw new Error(
      "generated artifacts lack linguist-generated=true:\n  " +
        incorrectlyUnclassified.join("\n  "),
    );
  }
  const incorrectlyClassified = tracked.filter(
    (path) => classified(path) && !expectedSet.has(path),
  );
  if (incorrectlyClassified.length > 0) {
    throw new Error(
      "authoritative files are incorrectly classified as generated:\n  " +
        incorrectlyClassified.join("\n  "),
    );
  }
  return { generated: expected.length, authoritative: tracked.length - expected.length };
}

function checkGeneratedClassification(root = ROOT) {
  const expected = expectedGeneratedPaths(root);
  const tracked = trackedPaths(root);
  const attributes = generatedAttributes(tracked, root);
  return validateClassification(expected, tracked, attributes);
}

function run() {
  const result = checkGeneratedClassification();
  console.log(
    `Review classification is exact: ${result.generated} generated artifacts ` +
      `and ${result.authoritative} authoritative tracked paths.`,
  );
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  checkGeneratedClassification,
  expectedGeneratedPaths,
  generatedAttributes,
  trackedPaths,
  validateClassification,
};

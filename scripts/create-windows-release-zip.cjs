#!/usr/bin/env node
"use strict";

const {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} = require("node:fs");
const { basename, join, resolve } = require("node:path");
const { zipSync } = require("fflate");

const DISTRIBUTION_NAME = "sagejs-windows-x64";
// ZIP stores a wall-clock timestamp without a time-zone. Construct this in the
// local zone so every host writes the same minimum representable DOS timestamp.
const ZIP_MTIME = new Date(1980, 0, 1, 0, 0, 0, 0);

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function collectRegularFiles(root, prefix = "") {
  const files = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })
    .sort((left, right) => compareNames(left.name, right.name))) {
    const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (
      relativeName.includes("\\") ||
      /[^\x21-\x7e]/.test(relativeName) ||
      relativeName.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error(`unsafe Windows release path ${JSON.stringify(relativeName)}`);
    }
    const filename = join(root, ...relativeName.split("/"));
    const information = lstatSync(filename);
    if (information.isSymbolicLink()) {
      throw new Error(`Windows release contains a symbolic link: ${relativeName}`);
    }
    if (entry.isDirectory()) files.push(...collectRegularFiles(root, relativeName));
    else if (entry.isFile()) files.push(relativeName);
    else throw new Error(`Windows release contains a special file: ${relativeName}`);
  }
  return files;
}

function createWindowsReleaseZip(directory, output) {
  const declaredRoot = resolve(directory);
  const rootInformation = lstatSync(declaredRoot);
  if (rootInformation.isSymbolicLink()) {
    throw new Error(
      "Windows release directory must not be a symbolic link or junction",
    );
  }
  if (!rootInformation.isDirectory()) {
    throw new Error("Windows release path must be a directory");
  }
  const root = realpathSync(declaredRoot);
  if (basename(root) !== DISTRIBUTION_NAME) {
    throw new Error(`Windows release directory must be named ${DISTRIBUTION_NAME}`);
  }
  const destination = resolve(output);
  if (existsSync(destination)) {
    throw new Error(`refusing to replace existing Windows release ZIP ${destination}`);
  }
  const relativeFiles = collectRegularFiles(root);
  if (relativeFiles.length === 0) throw new Error("Windows release directory is empty");
  const inputs = Object.fromEntries(relativeFiles.map((relativeName) => [
    `${DISTRIBUTION_NAME}/${relativeName}`,
    [
      readFileSync(join(root, ...relativeName.split("/"))),
      { level: 6, mtime: ZIP_MTIME },
    ],
  ]));
  writeFileSync(destination, zipSync(inputs), { flag: "wx", mode: 0o644 });
  return {
    files: relativeFiles,
    output: destination,
  };
}

function main(arguments_ = process.argv.slice(2)) {
  if (arguments_.length !== 2 || arguments_.includes("--help")) {
    const stream = arguments_.includes("--help") ? process.stdout : process.stderr;
    stream.write(
      "Usage: node scripts/create-windows-release-zip.cjs DIRECTORY OUTPUT\n",
    );
    if (!arguments_.includes("--help")) process.exitCode = 2;
    return;
  }
  const result = createWindowsReleaseZip(arguments_[0], arguments_[1]);
  console.log(
    `Created ${result.output} with ${result.files.length} regular file(s).`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  DISTRIBUTION_NAME,
  ZIP_MTIME,
  collectRegularFiles,
  createWindowsReleaseZip,
};

#!/usr/bin/env node
"use strict";

// A fresh Actions runner loses the previous attempt's publication journal.
// Restoring it prevents a second npm publish while an accepted version is
// still being validated and is not yet visible through the public registry.
// This is only a checkpoint hint: publishNpmPackages rebinds it to the exact
// qualified tarballs and verifies every public version before promotion.
const fs = require("node:fs"), path = require("node:path");
const { atomicJson } = require("./runner.cjs");
const { realDirectory } = require("./directory-transaction.cjs");
const { validateRequest } = require("./publish-prepared.cjs");

const packageNames = [
  "@sagemath/sagejs-linux-x64", "@sagemath/sagejs-linux-arm64",
  "@sagemath/sagejs-win32-x64", "@sagemath/sagejs-darwin-arm64",
  "@sagemath/sagejs",
];
function recoveryPins(runId = "", artifactId = "") {
  if (runId === "" && artifactId === "") return null;
  if (![runId, artifactId].every(value => typeof value === "string" &&
      /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value)))) {
    throw new Error("publication recovery requires both exact prior run and artifact IDs");
  }
  return { runId: Number(runId), artifactId: Number(artifactId) };
}
function boundedJson(filename, limit) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size <= 0 || stat.size > limit) {
    throw new Error("unsafe publication recovery input");
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(filename)));
}
function restoreAcceptedNpmJournal(requestFile, previousFile, cacheDirectory) {
  const request = validateRequest(boundedJson(requestFile, 8192));
  const journal = boundedJson(previousFile, 1024 * 1024);
  const version = request.tag.slice(1).split("+")[0];
  if (journal?.schema !== "sagejs.npm-publication/v1" || journal.binding?.registry !== "https://registry.npmjs.org/" ||
      journal.binding.tag !== request.tag || journal.binding.source !== request.sourceRevision ||
      journal.phase !== "waiting-for-registry:@sagemath/sagejs" ||
      !Array.isArray(journal.accepted) || journal.accepted.length !== packageNames.length ||
      journal.accepted.some((name, index) => name !== packageNames[index]) ||
      !Array.isArray(journal.binding.packages) || journal.binding.packages.length !== packageNames.length ||
      journal.binding.packages.some((entry, index) => entry.name !== packageNames[index] || entry.version !== version)) {
    throw new Error("prior npm journal is not the exact accepted root publication");
  }
  const cache = path.resolve(cacheDirectory);
  fs.mkdirSync(cache, { recursive: true }); realDirectory(cache);
  const directory = path.join(cache, "publication");
  fs.mkdirSync(directory, { recursive: true }); realDirectory(directory);
  const target = path.join(directory, "npm.json");
  if (fs.existsSync(target)) throw new Error("npm publication journal already exists");
  atomicJson(target, journal);
  return { tag: request.tag, source: request.sourceRevision, accepted: journal.accepted.length };
}
if (require.main === module) {
  try {
    if (process.argv[2] === "admit" && process.argv.length === 3) {
      console.log(JSON.stringify({ resume: recoveryPins(process.env.SAGEJS_RESUME_RUN_ID, process.env.SAGEJS_RESUME_ARTIFACT_ID) }));
      process.exit(0);
    }
    if (process.argv.length !== 5) throw new Error("specify request, prior journal and cache directory");
    console.log(JSON.stringify(restoreAcceptedNpmJournal(...process.argv.slice(2))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { recoveryPins, restoreAcceptedNpmJournal };

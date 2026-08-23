#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const {
  nativeArtifactSpecs,
} = require("./native-worktree-cache.cjs");

function nativeOracleCacheIdentity(workspace = path.resolve(__dirname, "..")) {
  const artifacts = nativeArtifactSpecs(workspace)
    .map(({ id, key, packageId, stage }) => ({ id, key, packageId, stage }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    schema: "sagejs.native-oracle-actions-cache/v1",
    platform: process.platform,
    architecture: process.arch,
    artifacts,
  };
}

function nativeOracleCacheKey(workspace) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(nativeOracleCacheIdentity(workspace)))
    .digest("hex");
}

if (require.main === module) {
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(nativeOracleCacheIdentity(), null, 2)}\n`);
  } else {
    process.stdout.write(`${nativeOracleCacheKey()}\n`);
  }
}

module.exports = {
  nativeOracleCacheIdentity,
  nativeOracleCacheKey,
};

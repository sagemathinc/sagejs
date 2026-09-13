#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "install.sh");
const releasePath = path.join(root, "website", "published-release.json");
const outputPath = path.join(root, "website", "install.sh");
const marker = 'requested_version="${SAGEJS_VERSION:-latest}"';

const release = JSON.parse(fs.readFileSync(releasePath, "utf8"));
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(release.version)) {
  throw new Error("website/published-release.json has an invalid version");
}
const escapedVersion = release.version.replaceAll(".", "\\.");
if (!new RegExp(`^v${escapedVersion}(?:\\+release\\.[1-9][0-9]*)?$`).test(
  release.releaseTag,
)) {
  throw new Error("website/published-release.json has an invalid releaseTag");
}

const source = fs.readFileSync(sourcePath, "utf8");
if (source.split(marker).length !== 2) {
  throw new Error("install.sh must contain exactly one default-version marker");
}

fs.writeFileSync(
  outputPath,
  source.replace(marker, `requested_version="\${SAGEJS_VERSION:-${release.releaseTag}}"`),
);
console.log(
  `Staged website installer pinned to Sage.js ${release.version} (${release.releaseTag})`,
);

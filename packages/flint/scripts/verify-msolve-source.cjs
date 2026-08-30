"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "vendor", "msolve");
const receipt = JSON.parse(readFileSync(path.join(root, "SOURCE.json"), "utf8"));

assert.equal(receipt.schema, "sagejs.vendored-source/v1");
assert.equal(receipt.name, "msolve");
assert.match(receipt.commit, /^[0-9a-f]{40}$/);
assert.equal(receipt.license, "GPL-2.0-or-later");
assert.match(readFileSync(path.join(root, receipt.licenseFile), "utf8"), /GNU GENERAL PUBLIC LICENSE/);
for (const directory of receipt.sourceDirectories) {
  assert.match(directory, /^src\/[a-z]+$/);
}

const msolveData = readFileSync(
  path.join(root, "src", "msolve", "msolve-data.h"), "utf8",
);
const getdelim = readFileSync(
  path.join(root, "src", "msolve", "getdelim.h"), "utf8",
);
assert.match(msolveData, /!defined\(_WIN32\)[\s\S]*#include <getopt\.h>/);
assert.match(getdelim, /typedef intptr_t ssize_t/);
assert.match(getdelim, /#define SSIZE_MAX INTPTR_MAX/);

console.log(`verified vendored msolve ${receipt.version} (${receipt.commit})`);

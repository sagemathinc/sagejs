"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync, readdirSync } = require("node:fs");
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

const sourceFiles = [];
function collect(directory) {
  for (const entry of readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) collect(relative);
    else if (entry.isFile() && /\.[ch]$/.test(entry.name)) sourceFiles.push(relative);
  }
}
for (const directory of receipt.sourceDirectories) collect(directory);
sourceFiles.sort();
const aggregate = createHash("sha256");
for (const filename of sourceFiles) {
  const bytes = readFileSync(path.join(root, filename));
  aggregate.update(Buffer.from(`${filename}\0${bytes.length}\0`));
  aggregate.update(bytes);
  aggregate.update(Buffer.from("\0"));
}
assert.equal(
  receipt.vendoredAggregateAlgorithm,
  "sha256(path\\0length\\0bytes\\0) over sorted relative .c/.h paths",
);
assert.equal(aggregate.digest("hex"), receipt.vendoredCAndHeaderAggregateSha256);

const msolveData = readFileSync(
  path.join(root, "src", "msolve", "msolve-data.h"), "utf8",
);
const getdelim = readFileSync(
  path.join(root, "src", "msolve", "getdelim.h"), "utf8",
);
assert.match(msolveData, /!defined\(_WIN32\)[\s\S]*#include <getopt\.h>/);
assert.match(getdelim, /typedef intptr_t ssize_t/);
assert.match(getdelim, /#define SSIZE_MAX INTPTR_MAX/);
for (const filename of [
  "src/fglm/fglm_core.c",
  "src/msolve/libmsolve.c",
  "src/neogb/gb.c",
  "src/usolve/usolve.c",
]) {
  assert.match(readFileSync(path.join(root, filename), "utf8"),
    /#define exit sagejs_msolve_exit/);
}
assert.match(readFileSync(path.join(root, "src/msolve/libmsolve.c"), "utf8"),
  /#define next_prime sagejs_msolve_next_prime/);

console.log(`verified vendored msolve ${receipt.version} (${receipt.commit})`);

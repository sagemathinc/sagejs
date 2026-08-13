#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const nativePackages = [
  "native-darwin-arm64",
  "native-linux-arm64",
  "native-linux-x64",
  "native-win32-x64",
];
const names = [];
for (const directory of nativePackages) {
  const manifest = JSON.parse(
    readFileSync(join(root, "packages", directory, "package.json"), "utf8"),
  );
  assert.equal(
    manifest.version,
    rootPackage.version,
    `${manifest.name} version must match @sagemath/sagejs`,
  );
  assert.equal(manifest.private, undefined, `${manifest.name} must be publishable`);
  names.push(manifest.name);
}
assert.deepEqual(
  Object.keys(rootPackage.optionalDependencies).sort(),
  names.sort(),
  "native optional dependencies must exactly match platform packages",
);
for (const name of names) {
  assert.equal(rootPackage.optionalDependencies[name], "workspace:*");
}

assert.deepEqual(rootPackage.bin, {
  sagejs: "bin/sagejs",
  "sagejs-jupyter": "bin/sagejs-jupyter",
  sagepython: "bin/sagepython",
});
for (const filename of Object.values(rootPackage.bin)) {
  assert.ok(existsSync(join(root, filename)), `missing public launcher ${filename}`);
}
for (const filename of ["bin", "dist", "index.cjs"]) {
  assert.ok(
    rootPackage.files.includes(filename),
    `published source package must include ${filename}`,
  );
}
assert.ok(
  existsSync(join(root, "scripts", "test-npm-package.cjs")),
  "release must retain the clean npm installation validator",
);

const tagIndex = process.argv.indexOf("--tag");
if (tagIndex >= 0) {
  const tag = process.argv[tagIndex + 1];
  assert.equal(tag, `v${rootPackage.version}`, "tag must match package version");
}
console.log(`Sage.js ${rootPackage.version} release metadata is consistent.`);

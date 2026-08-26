#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const releaseWorkflow = readFileSync(
  join(root, ".github", "workflows", "ci.yml"),
  "utf8",
);
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
  assert.equal(
    manifest.private,
    true,
    `${manifest.name} workspace anchor must not be published directly`,
  );
  // These directories only give `workspace:*` a version to rewrite when the
  // root package is packed.  The release builder creates the real platform
  // tarballs and adds their `os`, `cpu`, `libc`, `bin`, and `files` metadata.
  // Keeping the anchors platform-neutral prevents pnpm from warning about
  // every foreign workspace package during an ordinary source install.
  for (const field of ["os", "cpu", "libc", "bin", "files", "publishConfig"]) {
    assert.equal(
      manifest[field],
      undefined,
      `${manifest.name} workspace anchor must not define ${field}`,
    );
  }
  names.push(manifest.name);
}
assert.deepEqual(
  Object.entries(rootPackage.optionalDependencies)
    .filter(([, requirement]) => requirement === "workspace:*")
    .map(([name]) => name)
    .sort(),
  names.sort(),
  "workspace-backed optional dependencies must exactly match platform packages",
);
for (const name of names) {
  assert.equal(rootPackage.optionalDependencies[name], "workspace:*");
}

const draftIndex = releaseWorkflow.indexOf(
  "- name: Create or update the draft GitHub release",
);
const uploadIndex = releaseWorkflow.indexOf('gh release upload "$TAG"');
const npmIndex = releaseWorkflow.indexOf(
  "- name: Publish the platform and public npm packages",
);
const availabilityIndex = releaseWorkflow.indexOf("wait_for_package()", npmIndex);
const publishIndex = releaseWorkflow.indexOf(
  "- name: Publish the immutable GitHub release",
);
assert.ok(draftIndex >= 0, "release workflow must create a draft release");
assert.ok(
  releaseWorkflow.indexOf("--draft", draftIndex) > draftIndex,
  "release creation must remain draft-first for immutable repositories",
);
assert.ok(
  draftIndex < uploadIndex &&
    uploadIndex < npmIndex &&
    npmIndex < availabilityIndex &&
    availabilityIndex < publishIndex,
  "release workflow must upload, publish npm, and await public availability before making GitHub immutable",
);

const tagIndex = process.argv.indexOf("--tag");
if (tagIndex >= 0) {
  const tag = process.argv[tagIndex + 1];
  assert.equal(tag, `v${rootPackage.version}`, "tag must match package version");
}
console.log(`Sage.js ${rootPackage.version} release metadata is consistent.`);

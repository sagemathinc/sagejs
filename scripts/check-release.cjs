#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const versionInfo = JSON.parse(
  readFileSync(join(root, "sagejs-version.json"), "utf8"),
);
assert.deepEqual(
  Object.keys(versionInfo).sort(),
  ["name", "release_date", "schema", "version"],
  "the public Sage.js version record must have exactly the stable v1 fields",
);
assert.equal(versionInfo.schema, "sagejs.version/v1");
assert.equal(versionInfo.name, "Sage.js");
assert.equal(
  versionInfo.version,
  rootPackage.version,
  "sagejs-version.json must match the npm package version",
);
assert.match(
  versionInfo.release_date,
  /^\d{4}-\d{2}-\d{2}$/,
  "the Sage.js release date must use ISO YYYY-MM-DD form",
);
const releaseWorkflow = readFileSync(
  join(root, ".github", "workflows", "ci.yml"),
  "utf8",
);
const validatedPublishWorkflow = readFileSync(
  join(root, ".github", "workflows", "publish-validated-release.yml"),
  "utf8",
);
const browserDeployWorkflow = readFileSync(
  join(root, ".github", "workflows", "wasm-deploy-cloudflare.yml"),
  "utf8",
);
const numericalGateAuthenticator = readFileSync(
  join(
    root,
    "scripts",
    "numerical-computing",
    "qualification",
    "authenticate-release-gate.cjs",
  ),
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
const numericalGateIndex = releaseWorkflow.indexOf(
  "- name: Rebuild and authenticate the gate and exact public npm root",
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
  numericalGateIndex >= 0 && numericalGateIndex < draftIndex,
  "release workflow must authenticate numerical qualification before creating a draft",
);
assert.match(
  releaseWorkflow,
  /publish-release:[\s\S]*?needs:\n\s+- numerical-release-gate/,
  "automatic publication must depend on the mandatory numerical release gate",
);
assert.match(
  releaseWorkflow,
  /publish-release:[\s\S]*?Require successful same-tag WebAssembly release[\s\S]*?actions\/workflows\/wasm-release\.yml\/runs\?event=push&head_sha=\$\{GITHUB_SHA\}[\s\S]*?require-wasm-release\.cjs[\s\S]*?--sha "\$GITHUB_SHA" --tag "\$GITHUB_REF_NAME"/,
  "automatic publication must require a successful WebAssembly run for the exact tag and SHA",
);
assert.match(
  releaseWorkflow,
  /name: numerical-release-evidence[\s\S]+path: build\/numerical-qualification[\s\S]+release:qualify:numerics:gate[\s\S]+--input build\/numerical-qualification[\s\S]+--output build\/numerical-qualification\/gate[\s\S]+release:qualify:numerics:authenticate[\s\S]+--rebuilt-gate build\/numerical-qualification\/gate\/release-gate\.json[\s\S]+--public-npm-root release\/npm\/sagejs\.tgz/,
  "automatic publication must rebuild the gate from raw evidence before authenticating the selected public npm root",
);
assert.ok(
  !releaseWorkflow.includes("merge-multiple: true"),
  "release artifacts must be restored by producer name, not merged ambiguously",
);
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
assert.match(
  releaseWorkflow,
  /id-token:\s*write/,
  "release workflow must be allowed to request an npm OIDC token",
);
assert.ok(
  !releaseWorkflow.includes("secrets.NPM_TOKEN"),
  "release workflow must use npm Trusted Publishing instead of a reusable token",
);
assert.ok(
  releaseWorkflow.includes('npm publish "$archive"'),
  "release workflow must invoke the OIDC-aware npm CLI directly",
);
assert.match(
  releaseWorkflow,
  /createHash\("sha512"\)[\s\S]+npm view "\$\{name\}@\$\{version\}" dist\.integrity --json/,
  "idempotent publication must bind existing registry packages to the exact local archives",
);
assert.match(
  releaseWorkflow,
  /\[\[ "\$version" == "\$package_version" \]\]/,
  "every platform archive must match the public root package version",
);
assert.ok(
  !releaseWorkflow.includes('pnpm publish "$archive"'),
  "release workflow must not route Trusted Publishing through pnpm",
);

assert.match(
  validatedPublishWorkflow,
  /gh workflow run \.github\/workflows\/ci\.yml/,
  "manual recovery must delegate to the one npm-trusted workflow identity",
);
assert.ok(
  !validatedPublishWorkflow.includes("secrets.NPM_TOKEN") &&
    !validatedPublishWorkflow.includes("id-token: write") &&
    !validatedPublishWorkflow.includes("npm publish") &&
    !validatedPublishWorkflow.includes("pnpm publish"),
  "manual recovery must not contain any npm publication authority or command",
);
assert.match(
  releaseWorkflow,
  /recover-publish:[\s\S]+actions:\s*write[\s\S]+actions\/jobs\/\$\{publisher_id\}\/rerun/,
  "trusted CI recovery must authenticate and rerun its original publisher job",
);
assert.match(
  releaseWorkflow,
  /gh api --paginate[\s\S]+jobs\?filter=all&per_page=100[\s\S]+\| jq -s '\.' > "\$jobs_file"[\s\S]+select-recovery-publisher\.cjs/,
  "recovery must authenticate the latest exact producer and publisher occurrences across all attempts",
);
assert.match(
  releaseWorkflow,
  /\.head_branch \/\/ ""[\s\S]+== "\$RECOVERY_TAG"/,
  "recovery must bind the source run to the exact immutable tag, not only its commit",
);

const numericalGateJob = releaseWorkflow.slice(
  releaseWorkflow.indexOf("numerical-release-gate:"),
  releaseWorkflow.indexOf("publish-release:"),
);
assert.equal(
  [...numericalGateJob.matchAll(/release:qualify:numerics:gate --/g)].length,
  2,
  "the release gate job must execute a real canonical second reconstruction",
);
assert.match(
  numericalGateJob,
  /rm -rf build\/numerical-qualification\/gate[\s\S]+--output build\/numerical-qualification\/gate[\s\S]+--rebuilt-gate build\/numerical-qualification\/gate\/release-gate\.json/,
  "the second release-gate reconstruction must use the exact canonical workflow layout",
);

for (const required of [
  "qualification_run_id:",
  ".github/workflows/ci.yml",
  "Numerical release qualification gate",
  "qualification_sha",
  "numerical-release-gate",
  "numerical-release-evidence",
  "release:qualify:numerics:gate",
  "release:qualify:numerics:authenticate",
]) {
  assert.ok(
    browserDeployWorkflow.includes(required),
    `browser deployment must authenticate numerical qualification: ${required}`,
  );
}
assert.match(
  browserDeployWorkflow,
  /qualification_sha[\s\S]+source_sha/,
  "browser deployment must bind the numerical gate to its exact Wasm source SHA",
);
assert.match(numericalGateAuthenticator, /RELEASE_GATE_SCHEMA/);
assert.match(numericalGateAuthenticator, /validateMatrixInventory/);
assert.match(numericalGateAuthenticator, /validateSupplementalInventory/);
assert.match(numericalGateAuthenticator, /validateScipyCoherence/);
assert.match(numericalGateAuthenticator, /authenticatePublicNpmRoot/);
assert.match(numericalGateAuthenticator, /authenticateRebuiltGate/);
assert.match(
  browserDeployWorkflow,
  /--input build\/numerical-qualification[\s\S]+--output build\/numerical-qualification\/gate[\s\S]+--rebuilt-gate build\/numerical-qualification\/gate\/release-gate\.json/,
  "browser deployment must reconstruct the compact gate from the raw evidence artifact",
);

const tagIndex = process.argv.indexOf("--tag");
if (tagIndex >= 0) {
  const tag = process.argv[tagIndex + 1];
  const version = rootPackage.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    tag,
    new RegExp(`^v${version}(?:\\+release\\.[1-9]\\d*)?$`),
    "tag must match the package version or its numbered recovery tag",
  );
}
console.log(`Sage.js ${rootPackage.version} release metadata is consistent.`);

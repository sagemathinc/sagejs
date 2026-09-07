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

// Check the actual publisher wiring, not shell fragments from a superseded
// inline implementation. Controller retry/integrity/ordering semantics are
// exercised in release-finalization and publisher fixture tests.
const ci = require("./release/workflow-inventory.cjs").parseWorkflow(releaseWorkflow, "ci.yml");
const publisher = ci.jobs["publish-release"];
assert.ok(publisher.needs.includes("numerical-release-gate"));
assert.ok(publisher.needs.includes("native-product-acceptance"));
const ordered = [
  "Rebuild and authenticate the gate and exact public npm root",
  "Create or update the draft GitHub release",
  "Publish the platform and public npm packages",
  "Publish the immutable GitHub release",
].map(name => publisher.steps.findIndex(step => step.name === name));
assert.ok(ordered.every((index, i) => index >= 0 && (i === 0 || ordered[i - 1] < index)),
  "raw authentication must precede artifact upload, npm publication/availability and final promotion");
for (const [i, command] of [
  [1, "node scripts/release/publish-github-assets.cjs"],
  [2, "node scripts/release/publish-npm-packages.cjs"],
  [3, "node scripts/release/finalize-github-release.cjs"],
]) assert.equal(publisher.steps[ordered[i]].run, command);
assert.equal(publisher.permissions["id-token"], "write");
assert.equal(publisher.environment, "sagejs-release");
assert.ok(!releaseWorkflow.includes("secrets.NPM_TOKEN"));
assert.ok(!releaseWorkflow.includes("merge-multiple: true"));
const wasm = publisher.steps.find(step => step.name === "Require same-tag WebAssembly product acceptance");
assert.match(wasm.run, /require-wasm-release\.cjs[\s\S]*--sha "\$GITHUB_SHA" --tag "\$GITHUB_REF_NAME"/);
assert.match(publisher.steps[ordered[0]].run, /--rebuilt-gate[\s\S]*--public-npm-root release\/npm\/sagejs\.tgz/);

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
  "prepared_request:",
  "prepare-browser-deployment.cjs prepare",
  "prepare-browser-deployment.cjs recheck",
]) {
  assert.ok(
    browserDeployWorkflow.includes(required),
    `browser deployment must authenticate numerical qualification: ${required}`,
  );
}
const browserPreparation = require("./release/prepare-publication.cjs");
assert.ok(browserPreparation.browserKeys.includes("native/numerical-release-gate"));
assert.ok(browserPreparation.browserKeys.includes("native/numerical-release-evidence"));
const commands = browserPreparation.verificationStages(root, "a".repeat(40), `sha256:${"b".repeat(64)}`).flatMap(stage => stage.commands);
assert.ok(commands.some(command => command.includes("scripts/numerical-computing/qualification/assemble-release-gate.cjs") && command.includes("--candidate")));
assert.ok(commands.some(command => command.includes("scripts/numerical-computing/qualification/authenticate-release-gate.cjs") && command.includes("--rebuilt-gate") && command.includes("--browser-distribution")));
assert.match(numericalGateAuthenticator, /RELEASE_GATE_SCHEMA/);
assert.match(numericalGateAuthenticator, /validateMatrixInventory/);
assert.match(numericalGateAuthenticator, /validateSupplementalInventory/);
assert.match(numericalGateAuthenticator, /validateScipyCoherence/);
assert.match(numericalGateAuthenticator, /authenticatePublicNpmRoot/);
assert.match(numericalGateAuthenticator, /authenticateRebuiltGate/);
assert.match(
  commands.map(command => command.join(" ")).join("\n"),
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

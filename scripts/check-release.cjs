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
const publisher = ci.jobs["publish-prepared"];
assert.equal(ci.jobs["publish-release"], undefined, "legacy by-name publisher must stay retired");
assert.equal(ci.jobs["recover-publish"], undefined, "recovery must consume the same frozen request");
assert.equal(ci.on.push.tags, undefined, "tag creation must not launch a second producer build");
assert.equal(publisher.permissions["id-token"], "write");
assert.equal(publisher.environment, "sagejs-release");
assert.equal(publisher.needs, undefined, "prepared publication does not schedule producers");
assert.equal(publisher.concurrency.group, "sagejs-production-publication");
assert.ok(!releaseWorkflow.includes("secrets.NPM_TOKEN"));
assert.ok(!releaseWorkflow.includes("merge-multiple: true"));
const publisherCommands = publisher.steps.map(step => step.run ?? "").join("\n");
assert.match(publisherCommands, /publish-prepared\.cjs admit/);
assert.match(publisherCommands, /publish-prepared\.cjs "\$GITHUB_WORKSPACE\/candidate"/);
assert.doesNotMatch(publisherCommands, /pnpm (?:build|test)|gh run rerun/);
assert.match(validatedPublishWorkflow, /node scripts\/release\/request-prepared-publication\.cjs/);
assert.ok(
  !validatedPublishWorkflow.includes("secrets.NPM_TOKEN") &&
    !validatedPublishWorkflow.includes("id-token: write") &&
    !validatedPublishWorkflow.includes("npm publish") &&
    !validatedPublishWorkflow.includes("pnpm publish"),
  "manual recovery must have dispatch authority only",
);

const numericalGateJob = releaseWorkflow.slice(
  releaseWorkflow.indexOf("numerical-release-gate:"),
  releaseWorkflow.indexOf("verify-prepared:"),
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

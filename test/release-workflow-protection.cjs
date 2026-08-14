"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const workflow = readFileSync(
  resolve(__dirname, "../.github/workflows/ci.yml"),
  "utf8",
);

function job(name) {
  const marker = `  ${name}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow job ${name}`);
  const remainder = workflow.slice(start + marker.length);
  const nextJob = remainder.match(/\n  [A-Za-z0-9_-]+:\n/);
  const next = nextJob ? start + marker.length + nextJob.index : -1;
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

test("every release builder and consumer uses exact Node 26.7.0", () => {
  const versions = [...workflow.matchAll(/node-version:\s+([^\s]+)/g)].map((match) => match[1]);
  assert.ok(versions.length >= 6);
  assert.deepEqual(new Set(versions), new Set(["26.7.0"]));
});

test("stable and release-candidate tags have distinct irreversible authority", () => {
  const policy = job("release-tag-policy");
  const macosSign = job("sign-macos-arm64");
  const publish = job("publish-release");
  assert.match(policy, /-rc\\\.\(\[1-9\]\[0-9\]\*\)/);
  assert.match(policy, /candidate=true/);
  assert.match(policy, /publish=true/);
  assert.match(macosSign, /needs\.release-tag-policy\.outputs\.candidate == 'true'/);
  assert.match(publish, /needs\.release-tag-policy\.outputs\.publish == 'true'/);
  assert.match(publish, /environment: sagejs-release/);
  assert.doesNotMatch(macosSign, /needs\.release-tag-policy\.outputs\.publish/);
});

test("platform builders never receive signing or publication credentials", () => {
  for (const name of ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"]) {
    const source = job(name);
    assert.doesNotMatch(source, /environment:\s+sagejs-(?:signing|release)/);
    assert.doesNotMatch(source, /\bsecrets\./);
  }
});

test("Linux release artifacts come only from the receipted glibc-floor authority", () => {
  for (const [name, output] of [
    ["linux-x64", "build/linux-baseline"],
    ["linux-arm64", "build/linux-baseline-linux-arm64"],
  ]) {
    const source = job(name);
    assert.match(source, /fetch-depth: 0/);
    assert.match(source, /release-inputs\.cjs/);
    assert.match(source, new RegExp(`--platform ${name}`));
    assert.match(source, /--all-inputs/);
    assert.match(source, /--source-ref "\$GITHUB_SHA"/);
    assert.match(source, new RegExp(`--output ${output.replaceAll("/", "\\/")}`));
    assert.match(source, /release-candidate-linux\.cjs/);
    assert.match(source, /linux-baseline-receipt\.json/);
    assert.match(source, /sagejs-build-manifest\.json/);
    assert.match(source, /sagepython-build-manifest\.json/);
    assert.match(source, new RegExp(`sagejs-${name}\\.report\\.json`));
    assert.match(source, new RegExp(`sagejs-${name}\\.release\\.json`));
    assert.doesNotMatch(source, /cp build\/sea\/sagejs/);
    assert.doesNotMatch(source, /tar -C build\/release/);
  }
});

test("Windows is deliberately unsigned and bypasses the signing environment", () => {
  const windows = job("windows-x64");
  assert.equal(workflow.includes("  sign-windows-x64:\n"), false);
  assert.match(windows, /Get-AuthenticodeSignature/);
  assert.match(windows, /Status -ne "NotSigned"/);
  assert.match(windows, /UNSIGNED-WINDOWS\.txt/);
  assert.match(windows, /sagejs\.windows-release-manifest-v1/);
  assert.match(windows, /scheme = "authenticode"; status = "unsigned"/);
  assert.match(windows, /version = \$version/);
  assert.match(windows, /sourceCommit = \$sourceCommit/);
  assert.match(windows, /sourceCommit -ne \$env:GITHUB_SHA/);
  assert.match(windows, /sagejs-windows-x64-unsigned\.zip/);
  assert.match(windows, /id: upload-release/);
  assert.doesNotMatch(workflow, /SAGEJS_WINDOWS_CERTIFICATE|artifact-signing-action|azure\/login/);
});

test("macOS signs the exact immutable tested input and notarizes it", () => {
  const macosBuild = job("macos-arm64");
  const macosSign = job("sign-macos-arm64");
  assert.match(macosBuild, /pnpm run build:zeromq:darwin/);
  assert.match(macosBuild, /pnpm test:sea/);
  assert.match(macosBuild, /id: upload-signing-input/);
  assert.match(macosBuild, /signing-input-artifact-id:/);
  assert.match(macosSign, /environment: sagejs-signing/);
  assert.match(
    macosSign,
    /artifact-ids: \$\{\{ needs\.macos-arm64\.outputs\.signing-input-artifact-id \}\}/,
  );
  assert.match(macosSign, /shasum -a 256 -c tested-sea\.tar\.sha256/);
  assert.match(macosSign, /\$'sagejs\\nsagepython'/);
  assert.match(macosSign, /Unexpected or duplicate tested SEA tar member/);
  assert.match(macosSign, /pnpm release:macos -- --skip-build/);
  assert.match(macosSign, /id: upload-release/);
  assert.match(macosSign, /release-artifact-digest:/);
  for (const secret of [
    "SAGEJS_APPLE_CERTIFICATE_P12_BASE64",
    "SAGEJS_APPLE_CERTIFICATE_PASSWORD",
    "SAGEJS_APPLE_NOTARY_KEY_BASE64",
    "SAGEJS_APPLE_NOTARY_KEY_ID",
    "SAGEJS_APPLE_NOTARY_ISSUER_ID",
  ]) {
    assert.equal(workflow.split(`secrets.${secret}`).length - 1, 1);
    assert.match(macosSign, new RegExp(`secrets\\.${secret}`));
  }
});

test("publication downloads only the four exact final artifact IDs", () => {
  const publish = job("publish-release");
  assert.match(publish, /- windows-x64/);
  assert.match(publish, /- sign-macos-arm64/);
  assert.doesNotMatch(publish, /sign-windows-x64/);
  assert.equal(publish.split("uses: actions/download-artifact@").length - 1, 4);
  for (const name of ["linux-x64", "linux-arm64", "windows-x64", "sign-macos-arm64"]) {
    assert.match(
      publish,
      new RegExp(`artifact-ids: \\$\\{\\{ needs\\.${name.replaceAll("-", "\\-")}\\.outputs\\.release-artifact-id \\}\\}`),
    );
    assert.match(
      publish,
      new RegExp(`needs\\.${name.replaceAll("-", "\\-")}\\.outputs\\.release-artifact-digest`),
    );
  }
  assert.doesNotMatch(publish, /name:\s+sagejs-/);
  assert.doesNotMatch(publish, /path:\s+release\s*$\n\s+merge-multiple:\s+true/m);
  assert.match(publish, /prepare-release-publication\.cjs/);
});

test("stable publication is GitHub-only, explicit, immutable, and fail-closed", () => {
  const publish = job("publish-release");
  assert.match(publish, /node scripts\/check-release\.cjs --tag/);
  assert.match(publish, /SHA256SUMS/);
  assert.match(publish, /release-provenance\.json/);
  assert.match(publish, /not Authenticode-signed/);
  assert.match(publish, /--draft/);
  assert.match(publish, /--verify-tag/);
  assert.match(publish, /refusing to replace immutable assets/);
  assert.doesNotMatch(publish, /--clobber|--generate-notes/);
  assert.match(publish, /--draft=false --latest/);
  assert.doesNotMatch(publish, /pnpm publish|npm publish|NPM_TOKEN|NODE_AUTH_TOKEN/);
});

test("every action that can influence release bytes is immutable", () => {
  for (const line of workflow.split("\n")) {
    if (!line.trimStart().startsWith("uses:")) continue;
    assert.match(line, /@[0-9a-f]{40}(?:\s+#\s+v[0-9.]+)?$/);
  }
});

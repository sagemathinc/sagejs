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

test("platform builders never receive signing credentials", () => {
  for (const name of ["windows-x64", "macos-arm64"]) {
    const source = job(name);
    assert.doesNotMatch(source, /environment:\s+sagejs-signing/);
    assert.doesNotMatch(source, /\bsecrets\./);
  }
});

test("protected jobs sign the exact checksum-bound tested SEA inputs", () => {
  const windowsBuild = job("windows-x64");
  const windowsSign = job("sign-windows-x64");
  assert.match(windowsBuild, /name: sagejs-windows-x64-tested-sea/);
  assert.match(windowsBuild, /tested-sea\.zip\.sha256/);
  assert.match(windowsSign, /if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(windowsSign, /needs: windows-x64/);
  assert.match(windowsSign, /environment: sagejs-signing/);
  assert.match(windowsSign, /name: sagejs-windows-x64-tested-sea/);
  assert.match(windowsSign, /Get-FileHash/);
  assert.match(windowsSign, /SAGEJS_WINDOWS_CERTIFICATE_PFX_BASE64/);

  const macosBuild = job("macos-arm64");
  const macosSign = job("sign-macos-arm64");
  assert.match(macosBuild, /name: sagejs-macos-arm64-tested-sea/);
  assert.match(macosBuild, /tested-sea\.tar\.sha256/);
  assert.match(macosSign, /if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(macosSign, /needs: macos-arm64/);
  assert.match(macosSign, /environment: sagejs-signing/);
  assert.match(macosSign, /name: sagejs-macos-arm64-tested-sea/);
  assert.match(macosSign, /shasum -a 256 -c tested-sea\.tar\.sha256/);
  assert.match(macosSign, /SAGEJS_APPLE_CERTIFICATE_P12_BASE64/);
  assert.match(macosSign, /pnpm release:macos -- --skip-build/);
});

test("signing and publication credentials stay in their protected jobs", () => {
  const windowsSign = job("sign-windows-x64");
  const macosSign = job("sign-macos-arm64");
  const publish = job("publish-release");

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
  for (const secret of [
    "SAGEJS_WINDOWS_CERTIFICATE_PFX_BASE64",
    "SAGEJS_WINDOWS_CERTIFICATE_PASSWORD",
  ]) {
    assert.equal(workflow.split(`secrets.${secret}`).length - 1, 1);
    assert.match(windowsSign, new RegExp(`secrets\\.${secret}`));
  }

  assert.match(publish, /environment: sagejs-release/);
  assert.match(publish, /sign-windows-x64/);
  assert.match(publish, /sign-macos-arm64/);
  assert.match(
    publish,
    /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/,
  );
  assert.equal(workflow.split("secrets.NPM_TOKEN").length - 1, 1);
});

test("protected and artifact-transport actions are immutable", () => {
  for (const name of [
    "sign-windows-x64",
    "sign-macos-arm64",
    "publish-release",
  ]) {
    for (const line of job(name).split("\n")) {
      if (!line.trimStart().startsWith("uses:")) continue;
      assert.match(line, /@[0-9a-f]{40}(?:\s+#\s+v\d+)?$/);
    }
  }
  for (const line of workflow.split("\n")) {
    if (!/uses: actions\/(?:upload|download)-artifact@/.test(line)) continue;
    assert.match(line, /@[0-9a-f]{40}\s+#\s+v\d+$/);
  }
});

"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");
const {
  classifyReleaseEvent,
} = require("../scripts/release-tag-policy.cjs");
const {
  platforms: publicationPlatforms,
} = require("../scripts/prepare-release-publication.cjs");

const workflow = readFileSync(
  resolve(__dirname, "../.github/workflows/ci.yml"),
  "utf8",
);
const readme = readFileSync(resolve(__dirname, "../README.md"), "utf8");

function job(name) {
  const marker = `  ${name}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow job ${name}`);
  const remainder = workflow.slice(start + marker.length);
  const nextJob = remainder.match(/\n  [A-Za-z0-9_-]+:\n/);
  const next = nextJob ? start + marker.length + nextJob.index : -1;
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

function releaseUploadFiles(name) {
  const source = job(name);
  const upload = source.match(
    /id: upload-release[\s\S]*?\n\s+path: \|\n((?:\s+build\/release\/[^\n]+\n)+)/,
  );
  assert.ok(upload, `missing release upload paths for ${name}`);
  return upload[1]
    .trim()
    .split("\n")
    .map((line) => line.trim().replace("build/release/", ""))
    .sort();
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
  assert.match(policy, /EVENT_NAME: \$\{\{ github\.event_name \}\}/);
  assert.match(policy, /node scripts\/release-tag-policy\.cjs >> "\$GITHUB_OUTPUT"/);
  assert.match(macosSign, /needs\.release-tag-policy\.outputs\.candidate == 'true'/);
  assert.match(publish, /needs\.release-tag-policy\.outputs\.publish == 'true'/);
  assert.match(publish, /environment: sagejs-release/);
  assert.doesNotMatch(macosSign, /needs\.release-tag-policy\.outputs\.publish/);
  assert.match(
    workflow,
    /group: sagejs-ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name \}\}-\$\{\{ github\.ref \}\}/,
  );
  assert.match(
    workflow,
    /cancel-in-progress: \$\{\{ github\.event_name != 'push' \|\| github\.ref_type != 'tag' \}\}/,
  );
});

test("manual dispatch can never acquire release authority, even from a version tag", () => {
  for (const refName of ["v0.2.0", "v0.2.0-rc.1"]) {
    assert.deepEqual(
      classifyReleaseEvent({
        eventName: "workflow_dispatch",
        refName,
        refType: "tag",
        releaseVersion: "0.2.0",
      }),
      { candidate: false, publish: false },
    );
  }
  assert.deepEqual(
    classifyReleaseEvent({
      eventName: "push",
      refName: "v0.2.0-rc.1",
      refType: "tag",
      releaseVersion: "0.2.0",
    }),
    { candidate: true, publish: false },
  );
  assert.deepEqual(
    classifyReleaseEvent({
      eventName: "push",
      refName: "v0.2.0",
      refType: "tag",
      releaseVersion: "0.2.0",
    }),
    { candidate: true, publish: true },
  );
  assert.deepEqual(
    classifyReleaseEvent({
      eventName: "push",
      refName: "main",
      refType: "branch",
      releaseVersion: "0.2.0",
    }),
    { candidate: false, publish: false },
  );
  assert.throws(
    () => classifyReleaseEvent({
      eventName: "push",
      refName: "v0.2.0-rc.0",
      refType: "tag",
      releaseVersion: "0.2.0",
    }),
    /unsupported Sage\.js tag/,
  );
  assert.throws(
    () => classifyReleaseEvent({
      eventName: "push",
      refName: "v0.2.1",
      refType: "tag",
      releaseVersion: "0.2.0",
    }),
    /unsupported Sage\.js tag/,
  );
});

test("platform builders never receive signing or publication credentials", () => {
  for (const name of ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"]) {
    const source = job(name);
    assert.doesNotMatch(source, /environment:\s+sagejs-(?:signing|release)/);
    assert.doesNotMatch(source, /\bsecrets\./);
  }
});

test("platform test builders check out complete release history", () => {
  for (const name of ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"]) {
    assert.match(job(name), /fetch-depth: 0/);
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

test("Linux final-host acceptance uploads exactly the publication allowlist", () => {
  for (const name of ["linux-x64", "linux-arm64"]) {
    const source = job(name);
    const prefix = `sagejs-${name}`;
    assert.match(source, /scripts\/release-artifact-acceptance\.cjs/);
    assert.match(source, new RegExp(`--target ${name}`));
    assert.match(source, new RegExp(`--archive build/release/${prefix}\\.tar\\.xz`));
    assert.match(
      source,
      new RegExp(`--checksum build/release/${prefix}\\.tar\\.xz\\.sha256`),
    );
    assert.match(
      source,
      new RegExp(`--output build/release/${prefix}-acceptance\\.json`),
    );
    assert.match(source, /version="\$\(node -p 'require\("\.\/package\.json"\)\.version'\)"/);
    assert.match(source, /commit="\$\(git rev-parse 'HEAD\^\{commit\}'\)"/);
    assert.match(source, /\[\[ "\$commit" == "\$GITHUB_SHA" \]\]/);
    assert.match(source, /--expected-version "\$version"/);
    assert.match(source, /--expected-commit "\$commit"/);
    assert.match(source, /--signature unsigned/);
    assert.match(source, /--maximum-glibc 2\.28/);
    assert.deepEqual(
      releaseUploadFiles(name),
      [...publicationPlatforms[name].files].sort(),
    );
  }
});

test("README keeps macOS publishing under the immutable protected workflow", () => {
  assert.match(readme, /pnpm release:macos\n/);
  assert.doesNotMatch(readme, /pnpm release:macos -- --/);
  assert.doesNotMatch(readme, /pnpm release:macos[^\n]*--publish/);
  assert.match(readme, /local reproduction path only/);
  assert.match(readme, /created exclusively by the protected tag-triggered workflow/);
  assert.match(readme, /immutable release assets cannot be replaced/);
});

test("Windows is deliberately unsigned and bypasses the signing environment", () => {
  const windows = job("windows-x64");
  assert.equal(workflow.includes("  sign-windows-x64:\n"), false);
  assert.match(windows, /Get-AuthenticodeSignature/);
  assert.match(windows, /Status -ne "NotSigned"/);
  assert.match(windows, /UNSIGNED-WINDOWS\.txt/);
  assert.match(windows, /sagejs\.windows-release-manifest-v1/);
  assert.match(windows, /scheme:'authenticode',status:'unsigned'/);
  assert.match(windows, /version:process\.argv\[2\]/);
  assert.match(windows, /sourceCommit:process\.argv\[3\]/);
  assert.match(windows, /sourceCommit -ne \$env:GITHUB_SHA/);
  assert.match(windows, /sagejs-windows-x64-unsigned\.zip/);
  assert.match(windows, /Authenticate the official Node 26\.7\.0 SEA builder/);
  assert.match(windows, /Invoke-WebRequest -Uri \$source -OutFile \$archive/);
  assert.match(windows, /Get-FileHash \$archive -Algorithm SHA256/);
  assert.match(windows, /SAGEJS_SEA_NODE=\$builder/);
  assert.match(windows, /SAGEJS_SEA_NODE_SOURCE_FILENAME: node-v26\.7\.0-win-x64\.zip/);
  assert.match(
    windows,
    /SAGEJS_SEA_NODE_SOURCE_SHA256: d3bd72755141ed32bbcd841228ee81897c8a98d50dfa7dae2179399a0a7c90f8/,
  );
  assert.match(
    windows,
    /SAGEJS_SEA_NODE_SOURCE_URL: https:\/\/nodejs\.org\/dist\/v26\.7\.0\/node-v26\.7\.0-win-x64\.zip/,
  );
  assert.match(windows, /SAGEJS_SEA_NODE_SOURCE_VERSION: 26\.7\.0/);
  assert.match(windows, /sagejs\.exe-build-manifest\.json/);
  assert.match(windows, /sagepython\.exe-build-manifest\.json/);
  assert.match(windows, /SHA256SUMS/);
  assert.match(
    windows,
    /node scripts\/create-windows-release-zip\.cjs \$release \$archive/,
  );
  assert.doesNotMatch(windows, /Compress-Archive/);
  assert.match(windows, /Expand-Archive -LiteralPath \$archive/);
  assert.match(windows, /release-artifact-acceptance\.cjs/);
  assert.match(windows, /--target windows-x64/);
  assert.match(windows, /--expected-commit \$env:GITHUB_SHA/);
  assert.match(windows, /--signature unsigned/);
  assert.match(windows, /sagejs-windows-x64-acceptance\.json/);
  assert.match(windows, /sagejs-windows-x64-acceptance\.json\.sha256/);
  assert.match(windows, /id: upload-release/);
  assert.doesNotMatch(workflow, /SAGEJS_WINDOWS_CERTIFICATE|artifact-signing-action|azure\/login/);
});

test("macOS builds trusted exact bytes before signing and notarization", () => {
  const macosBuild = job("macos-arm64");
  const rehearsal = job("macos-arm64-first-party-rehearsal");
  const macosSign = job("sign-macos-arm64");
  assert.match(macosBuild, /runs-on: blacksmith-6vcpu-macos-15/);
  assert.match(macosSign, /runs-on: macos-15/);
  assert.doesNotMatch(macosSign, /runs-on: blacksmith-/);
  assert.match(macosSign, /timeout-minutes: 180/);
  for (const tool of ["autoconf", "automake", "cmake", "libtool", "m4", "ninja", "xz"]) {
    assert.match(macosBuild, new RegExp(`brew install [^\\n]*\\b${tool}\\b`));
    assert.match(macosSign, new RegExp(`brew install [^\\n]*\\b${tool}\\b`));
  }
  for (const source of [macosBuild, rehearsal, macosSign]) {
    assert.match(source, /Materialize the exact official Node SEA authority/);
    assert.match(source, /filename=node-v26\.7\.0-darwin-arm64\.tar\.xz/);
    assert.match(source, /sha256=595d2f934e081b82961d1a5fd41c6dbd0c5a952d9e8be5b4566ab754426968d2/);
    assert.match(source, /url="https:\/\/nodejs\.org\/dist\/v26\.7\.0\/\$filename"/);
    assert.match(source, /curl --fail --location --proto '=https' --tlsv1\.2/);
    assert.match(source, /shasum -a 256 -c -/);
    assert.match(source, /sea_node="\$destination\/node-v26\.7\.0-darwin-arm64\/bin\/node"/);
    assert.match(source, /"\$\(uname -m\)" == arm64/);
    assert.match(source, /! -L "\$sea_node"/);
    assert.match(source, /lipo -archs "\$sea_node"/);
    assert.match(source, /otool -L "\$sea_node"/);
    assert.match(source, /echo "SAGEJS_SEA_NODE=\$sea_node"/);
    assert.match(source, /echo "SAGEJS_SEA_NODE_SOURCE_SHA256=\$sha256"/);
    assert.match(source, />> "\$GITHUB_ENV"/);
    assert.match(source, /pnpm run build:zeromq:darwin/);
    assert.match(source, /pnpm test:sea/);
    assert.ok(
      source.indexOf("Materialize the exact official Node SEA authority") <
        source.indexOf("pnpm test:sea"),
      "the verified official SEA Node must be selected before SEA assembly",
    );
  }
  assert.doesNotMatch(macosBuild, /upload-signing-input|tested-sea/);
  assert.match(macosSign, /environment: sagejs-signing/);
  assert.match(macosSign, /submodules: recursive/);
  assert.match(macosSign, /pnpm install --frozen-lockfile/);
  assert.match(macosSign, /Bind protected signing to the exact tag and package version/);
  assert.match(macosSign, /"\$GITHUB_REF_TYPE" == tag/);
  assert.match(macosSign, /tag_commit="\$\(git rev-parse "\$GITHUB_REF\^\{commit\}"\)"/);
  assert.match(macosSign, /"\$commit" == "\$GITHUB_SHA"/);
  assert.match(macosSign, /"\$tag_commit" == "\$GITHUB_SHA"/);
  assert.match(macosSign, /release_tag="\$\{TAG%-rc\.\*\}"/);
  assert.match(macosSign, /scripts\/check-release\.cjs --tag "\$release_tag"/);
  assert.match(macosSign, /Build and test the exact to-be-signed SEA bytes/);
  assert.match(macosSign, /Protected macOS build checkout differs/);
  assert.match(macosSign, /pnpm run build:zeromq:darwin/);
  assert.match(macosSign, /pnpm test:sea/);
  assert.doesNotMatch(macosSign, /download-artifact|tested-sea|signing-input/);
  assert.ok(
    macosSign.indexOf("Build and test the exact to-be-signed SEA bytes") <
      macosSign.indexOf("Import Apple release credentials"),
    "the trusted build must complete before any Apple secret is imported",
  );
  assert.match(macosSign, /pnpm release:macos --skip-build/);
  assert.doesNotMatch(macosSign, /pnpm release:macos -- --/);
  assert.match(macosSign, /scripts\/release-artifact-acceptance\.cjs/);
  assert.match(macosSign, /--target macos-arm64/);
  assert.match(macosSign, /--signature apple-developer-id/);
  assert.match(macosSign, /--maximum-macos 13\.5/);
  assert.match(macosSign, /sagejs-macos-arm64-acceptance\.json/);
  assert.match(macosSign, /sagejs-macos-arm64-acceptance\.json\.sha256/);
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
  assert.doesNotMatch(macosSign, /secrets\.SAGEJS_MACOS_(?:SIGN|INSTALLER)_ID/);
  assert.match(macosSign, /Developer ID Application: William STEIN \(BVF94G2MB4\)/);
  assert.match(macosSign, /Developer ID Installer: William STEIN \(BVF94G2MB4\)/);
  assert.match(macosSign, /security find-identity -v "\$keychain"/);
  assert.match(macosSign, /P12 does not contain the required Developer ID Application identity/);
  assert.match(macosSign, /P12 does not contain the required Developer ID Installer identity/);
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
  assert.match(publish, /X-GitHub-Api-Version: 2026-03-10/);
  assert.match(publish, /release\.immutable, true/);
  assert.match(publish, /repos\/\$GITHUB_REPOSITORY\/releases\/latest/);
  assert.match(publish, /latest\.tag_name, tag/);
  assert.match(publish, /asset\.digest, `sha256:\$\{digest\}`/);
  assert.match(publish, /remote\.map\(\(\{ name \}\) => name\), local/);
  assert.doesNotMatch(publish, /pnpm publish|npm publish|NPM_TOKEN|NODE_AUTH_TOKEN/);
  assert.match(
    publish,
    /\[\[ "\$TAG" =~ \^v\(0\|\[1-9\]\[0-9\]\*\)\\\./,
  );
  assert.match(
    publish,
    /printf '# Sage\.js %s\\n\\n' "\$TAG" > publication\/release-notes\.md/,
  );
  assert.match(
    publish,
    /cat >> publication\/release-notes\.md <<'EOF'/,
  );
  assert.doesNotMatch(publish, /release-notes\.md <<EOF/);
  assert.match(publish, /native-mathematics `sagejs`/);
  assert.match(publish, /adjacent `\.sha256` files/);
});

test("every action that can influence release bytes is immutable", () => {
  for (const line of workflow.split("\n")) {
    if (!line.trimStart().startsWith("uses:")) continue;
    assert.match(line, /@[0-9a-f]{40}(?:\s+#\s+v[0-9.]+)?$/);
  }
});

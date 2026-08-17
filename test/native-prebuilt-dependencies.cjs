"use strict";

const assert = require("node:assert/strict");
const {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const test = require("node:test");

const repositoryRoot = resolve(__dirname, "..");
const {
  assetName,
  bundleKey,
  createBundle,
  identityInputs,
  installBundleArchive,
  packageTargets,
  packages,
  parseDigest,
  prebuiltPackageIsCurrent,
  targetName,
} = require("../scripts/native-prebuilt-dependencies.cjs");
const {
  restoreNativeArtifact,
  snapshot,
} = require("../scripts/native-worktree-cache.cjs");

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-prebuilt-test-"));
  for (const input of identityInputs) {
    const source = join(repositoryRoot, input);
    const target = join(directory, input);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }
  const targets = packageTargets(directory);
  for (const packageId of packages) {
    mkdirSync(join(targets[packageId], "lib"), { recursive: true });
    writeFileSync(join(targets[packageId], "lib", `${packageId}.a`), `${packageId}\n`);
  }
  if (process.platform !== "win32") {
    symlinkSync("flint.a", join(targets.flint, "lib", "flint-current.a"));
  }
  return { directory, targets };
}

test("native dependency assets have stable platform and source identities", () => {
  assert.equal(targetName("linux", "x64"), "linux-x64");
  assert.equal(targetName("darwin", "arm64"), "macos-arm64");
  assert.equal(targetName("win32", "x64"), "windows-x64");
  assert.throws(() => targetName("freebsd", "x64"), /no prebuilt/);
  assert.match(
    assetName(repositoryRoot),
    new RegExp(`-${targetName()}-[a-f0-9]{64}\\.tar\\.gz$`),
  );
  assert.equal(
    parseDigest(`${"a".repeat(64)}  bundle.tar.gz\n`, "bundle.tar.gz"),
    "a".repeat(64),
  );
  assert.throws(
    () => parseDigest(`${"a".repeat(64)}  other.tar.gz\n`, "bundle.tar.gz"),
    /invalid/,
  );
});

test("verified native dependency bundles relocate all package prefixes", () => {
  const { directory, targets } = fixture();
  try {
    const output = join(directory, "output");
    const beforeKey = bundleKey(directory);
    const packed = createBundle(directory, output);
    assert.equal(packed.key, beforeKey);
    assert.match(
      readFileSync(`${packed.archive}.sha256`, "utf8"),
      new RegExp(`^${packed.digest}  ${packed.name}\\n$`),
    );
    for (const target of Object.values(targets)) {
      rmSync(target, { force: true, recursive: true });
    }
    assert.equal(
      installBundleArchive(directory, packed.archive, packed.digest).status,
      "installed",
    );
    for (const packageId of packages) {
      assert.equal(
        prebuiltPackageIsCurrent(
          directory,
          packageId,
          targets[packageId],
          [join(targets[packageId], "lib", `${packageId}.a`)],
        ),
        true,
      );
    }
    const inputPaths = [identityInputs[0]];
    const localCacheResult = restoreNativeArtifact(
      directory,
      join(directory, "empty-local-cache"),
      {
        cleanupRoots: [],
        id: "flint-dependencies",
        inputPaths,
        inputs: snapshot(directory, inputPaths),
        key: "f".repeat(64),
        materialization: "copy",
        outputRoots: [
          targets.flint.slice(directory.length + 1).replaceAll("\\", "/"),
        ],
        packageId: "flint",
        requiredOutputs: [
          join(targets.flint, "lib", "flint.a")
            .slice(directory.length + 1)
            .replaceAll("\\", "/"),
        ],
        stage: "dependencies",
      },
    );
    assert.equal(localCacheResult.status, "present");
    assert.equal(localCacheResult.prebuilt, true);
    if (process.platform !== "win32") {
      assert.equal(
        readFileSync(join(targets.flint, "lib", "flint-current.a"), "utf8"),
        "flint\n",
      );
    }
    assert.throws(
      () => installBundleArchive(directory, packed.archive, "0".repeat(64)),
      /SHA-256/,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

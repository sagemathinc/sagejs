#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const {
  mkdirSync,
  mkdtempSync,
  chmodSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const test = require("node:test");

const {
  createBuildManifest,
  createManifest,
  gitSourceIdentity,
  readManifest,
  serialize,
  validateManifest,
  verifyManifest,
} = require("../scripts/release-manifest.cjs");

const SCRIPT = resolve(__dirname, "../scripts/release-manifest.cjs");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const ARCHIVE_HASH = "a".repeat(64);

function git(root, arguments_) {
  return execFileSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function layout() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), "sagejs-release-manifest-"));
  const source = join(root, "source");
  const release = join(root, "release");
  mkdirSync(source);
  mkdirSync(release);
  writeFileSync(join(source, "package.json"), '{"version":"0.2.0"}\n');
  writeFileSync(join(source, "tracked.txt"), "tracked\n");
  git(source, ["init", "--quiet", "--initial-branch=main"]);
  git(source, ["add", "."]);
  git(source, ["-c", "user.name=Sage.js Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "initial"]);
  const executable = join(release, "sagejs-linux-x64");
  const archive = join(release, "sagejs-linux-x64.tgz");
  writeFileSync(executable, "executable bytes\n");
  writeFileSync(archive, "archive bytes\n");
  return { archive, cleanup: () => rmSync(root, { force: true, recursive: true }), executable, release, root, source };
}

function archiveSource() {
  return { commit: COMMIT, contentSha256: ARCHIVE_HASH, dirty: null, kind: "source-archive", tree: null };
}

function receipt(source = archiveSource(), overrides = {}) {
  return createBuildManifest({
    capabilities: {
      flint: true,
      graph: false,
      nativeKernels: {
        expected: 2,
        indexIdentitySha256: "c".repeat(64),
        logicalSources: [
          "sagejs.kernels.matrix.dense_integer_matrix",
          "sagejs.kernels.polynomial.exact_integer_polynomial",
        ],
      },
    },
    sagejsVersion: "0.2.0",
    source,
    target: {
      arch: "x64",
      endianness: "LE",
      libc: { family: "glibc", version: "2.39" },
      nodeAbi: "137",
      nodeNapi: "10",
      platform: "linux",
      wordBits: 64,
    },
    toolchain: {
      compiler: { id: "clang", version: "20.1.0" },
      nativeMathProfile: { fingerprint: "math-profile-receipt" },
      node: "v26.0.0",
    },
    ...overrides,
  });
}

function manifestOptions(workspace, buildManifest = receipt(), overrides = {}) {
  return {
    artifacts: [
      { file: workspace.archive, kind: "npm-package" },
      { file: workspace.executable, kind: "standalone-executable" },
    ],
    buildManifest,
    manifestDirectory: workspace.release,
    packagingHostObservation: null,
    ...overrides,
  };
}

test("build identity is pre-artifact and release identity binds artifact set", () => {
  const workspace = layout();
  try {
    const buildManifest = receipt();
    const first = createManifest(manifestOptions(workspace, buildManifest));
    const second = createManifest({
      ...manifestOptions(workspace, buildManifest),
      artifacts: [...manifestOptions(workspace, buildManifest).artifacts].reverse(),
    });
    assert.equal(serialize(first), serialize(second));
    assert.equal(first.schema, "sagejs.release-artifact-manifest-v2");
    assert.equal(first.buildManifest.identitySha256, buildManifest.identitySha256);
    assert.equal(serialize(buildManifest).includes("artifacts"), false);
    writeFileSync(workspace.archive, "changed archive bytes\n");
    const changed = createManifest(manifestOptions(workspace, buildManifest));
    assert.equal(changed.buildManifest.identitySha256, first.buildManifest.identitySha256);
    assert.notEqual(changed.integrity.releaseIdentitySha256, first.integrity.releaseIdentitySha256);
    assert.deepEqual(first.artifacts.map(({ path }) => path), ["sagejs-linux-x64", "sagejs-linux-x64.tgz"]);
  } finally {
    workspace.cleanup();
  }
});

test("packaging host observation is separate from release identity", () => {
  const workspace = layout();
  try {
    const first = createManifest(manifestOptions(workspace, receipt()));
    const observed = createManifest(manifestOptions(workspace, receipt(), {
      packagingHostObservation: { hostname: "builder-17", platform: "darwin" },
    }));
    assert.equal(first.integrity.releaseIdentitySha256, observed.integrity.releaseIdentitySha256);
    assert.notEqual(first.integrity.documentBodySha256, observed.integrity.documentBodySha256);
    assert.equal(observed.buildManifest.target.platform, "linux");
    assert.equal(observed.packagingHostObservation.platform, "darwin");
  } finally {
    workspace.cleanup();
  }
});

test("artifact and manifest tampering fail closed", () => {
  const workspace = layout();
  try {
    const manifest = createManifest(manifestOptions(workspace));
    writeFileSync(workspace.executable, "different bytes\n");
    assert.throws(() => verifyManifest(manifest, { manifestDirectory: workspace.release }), /size mismatch|SHA-256 mismatch/);
    const identity = structuredClone(manifest);
    identity.artifacts[0].size += 1;
    assert.throws(() => validateManifest(identity), /release identity checksum mismatch/);
    const document = structuredClone(manifest);
    document.packagingHostObservation = { platform: "unknown" };
    assert.throws(() => validateManifest(document), /document body checksum mismatch/);
    const build = structuredClone(manifest);
    build.buildManifest.toolchain.node = "tampered";
    assert.throws(() => validateManifest(build), /build manifest identity checksum mismatch/);
  } finally {
    workspace.cleanup();
  }
});

test("source archives require a content digest, not only commit and version", () => {
  assert.throws(
    () => createBuildManifest({
      ...receipt(),
      source: { commit: COMMIT, dirty: null, kind: "source-archive", tree: null },
    }),
    /missing contentSha256/,
  );
  const first = receipt(archiveSource());
  const second = receipt({ ...archiveSource(), contentSha256: "b".repeat(64) });
  assert.notEqual(first.identitySha256, second.identitySha256);
});

test("clean Git is default and dirty identity binds tracked and untracked content", () => {
  const workspace = layout();
  try {
    const clean = gitSourceIdentity(workspace.source);
    assert.equal(clean.kind, "git-clean");
    assert.equal(clean.dirty, false);
    writeFileSync(join(workspace.source, "tracked.txt"), "modified\n");
    writeFileSync(join(workspace.source, "untracked.txt"), "first\n");
    assert.throws(() => gitSourceIdentity(workspace.source), /source is dirty/);
    const first = gitSourceIdentity(workspace.source, { allowDirty: true });
    writeFileSync(join(workspace.source, "untracked.txt"), "second\n");
    const second = gitSourceIdentity(workspace.source, { allowDirty: true });
    assert.equal(first.kind, "git-dirty");
    assert.notEqual(first.contentSha256, second.contentSha256);
    writeFileSync(join(workspace.source, "untracked.txt"), "first\n");
    assert.deepEqual(gitSourceIdentity(workspace.source, { allowDirty: true }), first);
    if (process.platform !== "win32") {
      const modeBefore = gitSourceIdentity(workspace.source, { allowDirty: true });
      chmodSync(join(workspace.source, "untracked.txt"), 0o755);
      const modeAfter = gitSourceIdentity(workspace.source, { allowDirty: true });
      assert.notEqual(modeBefore.contentSha256, modeAfter.contentSha256);
    }
  } finally {
    workspace.cleanup();
  }
});

test("Git source identity requires repository top level", () => {
  const workspace = layout();
  try {
    const child = join(workspace.source, "child");
    mkdirSync(child);
    assert.throws(() => gitSourceIdentity(child), /repository top level/);
  } finally {
    workspace.cleanup();
  }
});

test("dirty tracked identity disables configured text conversion", () => {
  const workspace = layout();
  try {
    writeFileSync(join(workspace.source, ".gitattributes"), "tracked.txt diff=constant\n");
    git(workspace.source, ["add", ".gitattributes"]);
    git(workspace.source, ["-c", "user.name=Sage.js Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "attributes"]);
    git(workspace.source, ["config", "diff.constant.textconv", "printf constant"]);
    writeFileSync(join(workspace.source, "tracked.txt"), "first\n");
    const first = gitSourceIdentity(workspace.source, { allowDirty: true });
    writeFileSync(join(workspace.source, "tracked.txt"), "second\n");
    const second = gitSourceIdentity(workspace.source, { allowDirty: true });
    assert.notEqual(first.contentSha256, second.contentSha256);
  } finally {
    workspace.cleanup();
  }
});

test("malformed targets and noncanonical sidecars are rejected", () => {
  const workspace = layout();
  try {
    assert.throws(() => receipt(archiveSource(), {
      target: { arch: "x64", platform: "linux" },
    }), /missing endianness/);
    assert.throws(() => receipt(archiveSource(), {
      target: {
        ...receipt().target,
        endianness: "BE",
      },
    }), /requires LE endianness/);
    assert.throws(() => receipt(archiveSource(), {
      target: {
        ...receipt().target,
        arch: "arm64",
        platform: "win32",
      },
    }), /unsupported Sage.js release target/);
    assert.throws(
      () => receipt({ ...archiveSource(), contentSha256: ARCHIVE_HASH.toUpperCase() }),
      /must be SHA-256/,
    );
    const manifest = createManifest(manifestOptions(workspace));
    const filename = join(workspace.release, "manifest.json");
    writeFileSync(filename, JSON.stringify(manifest));
    assert.throws(() => readManifest(filename), /not in canonical generated form/);
    writeFileSync(filename, "{invalid\n");
    assert.throws(() => readManifest(filename), /cannot parse/);
    if (process.platform !== "win32") {
      rmSync(filename);
      const target = join(workspace.release, "target-manifest.json");
      writeFileSync(target, serialize(manifest));
      symlinkSync(target, filename);
      assert.throws(() => readManifest(filename), /without symlink or reparse parents/);
    }
  } finally {
    workspace.cleanup();
  }
});

test("CLI requires an explicit canonical build manifest", () => {
  const workspace = layout();
  try {
    const buildManifest = join(workspace.release, "build-manifest.json");
    const manifest = join(workspace.release, "manifest.json");
    writeFileSync(buildManifest, serialize(receipt()));
    const missing = spawnSync(process.execPath, [SCRIPT, "create", "--output", manifest, "--artifact", `standalone=${workspace.executable}`], { encoding: "utf8" });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /requires --output and --build-manifest/);
    const created = execFileSync(process.execPath, [
      SCRIPT, "create", "--output", manifest, "--build-manifest", buildManifest,
      "--artifact", `standalone=${workspace.executable}`,
      "--artifact", `npm-package=${workspace.archive}`,
    ], { encoding: "utf8" });
    assert.match(created, /release identity [0-9a-f]{64}/);
    const verified = execFileSync(process.execPath, [SCRIPT, "verify", "--manifest", manifest, "--build-manifest", buildManifest], { encoding: "utf8" });
    assert.match(verified, /Verified 2 artifact\(s\)/);
  } finally {
    workspace.cleanup();
  }
});

test("manifest output cannot self-reference or replace unsafe paths", () => {
  const workspace = layout();
  try {
    const buildManifest = join(workspace.release, "build-manifest.json");
    const manifest = join(workspace.release, "manifest.json");
    writeFileSync(buildManifest, serialize(receipt()));
    writeFileSync(manifest, "self artifact\n");
    let result = spawnSync(process.execPath, [SCRIPT, "create", "--output", manifest, "--build-manifest", buildManifest, "--artifact", `manifest=${manifest}`], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /output cannot be an artifact/);
    rmSync(manifest);
    if (process.platform === "win32") mkdirSync(manifest);
    else symlinkSync(workspace.executable, manifest);
    result = spawnSync(process.execPath, [SCRIPT, "create", "--output", manifest, "--build-manifest", buildManifest, "--artifact", `standalone=${workspace.executable}`], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not be a symlink, reparse point, or directory/);
    if (process.platform !== "win32") {
      assert.equal(readFileSync(workspace.executable, "utf8"), "executable bytes\n");
    }
  } finally {
    workspace.cleanup();
  }
});

test("CLI refuses to replace an existing ordinary manifest", () => {
  const workspace = layout();
  try {
    const buildManifest = join(workspace.release, "build-manifest.json");
    const manifest = join(workspace.release, "manifest.json");
    writeFileSync(buildManifest, serialize(receipt()));
    writeFileSync(manifest, "sentinel\n");
    const result = spawnSync(process.execPath, [
      SCRIPT, "create", "--output", manifest, "--build-manifest", buildManifest,
      "--artifact", `standalone=${workspace.executable}`,
    ], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing non-atomic replacement/);
    assert.equal(readFileSync(manifest, "utf8"), "sentinel\n");
  } finally {
    workspace.cleanup();
  }
});

test("artifact symlink and symlinked manifest parents fail closed", () => {
  const workspace = layout();
  try {
    if (process.platform !== "win32") {
      const linkedArtifact = join(workspace.release, "linked-artifact");
      symlinkSync(workspace.executable, linkedArtifact);
      assert.throws(
        () => createManifest(manifestOptions(workspace, receipt(), { artifacts: [{ file: linkedArtifact, kind: "linked" }] })),
        /regular non-symlink file/,
      );
    }
    const linkedRelease = join(workspace.root, "linked-release");
    symlinkSync(
      workspace.release,
      linkedRelease,
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.throws(
      () => createManifest(manifestOptions(workspace, receipt(), { manifestDirectory: linkedRelease })),
      /real directory, not a symlink/,
    );
  } finally {
    workspace.cleanup();
  }
});

test(
  "canonical root aliases are accepted but descendant symlink escapes are rejected",
  { skip: process.platform === "win32" },
  () => {
    const root = mkdtempSync(
      join(realpathSync.native(tmpdir()), "sagejs-release-root-alias-"),
    );
    try {
      const actual = join(root, "actual");
      const release = join(actual, "release");
      const alias = join(root, "alias");
      mkdirSync(release, { recursive: true });
      symlinkSync(actual, alias, "dir");
      const aliasedRelease = join(alias, "release");
      const artifact = join(aliasedRelease, "artifact.bin");
      writeFileSync(join(release, "artifact.bin"), "artifact\n");
      const manifest = createManifest({
        ...manifestOptions(
          { archive: artifact, executable: artifact, release: aliasedRelease },
          receipt(),
        ),
        artifacts: [{ file: artifact, kind: "standalone-executable" }],
      });
      assert.equal(manifest.artifacts[0].path, "artifact.bin");
      const manifestFilename = join(release, "manifest.json");
      writeFileSync(manifestFilename, serialize(manifest));
      assert.deepEqual(readManifest(join(aliasedRelease, "manifest.json")), manifest);

      const outside = join(root, "outside");
      mkdirSync(outside);
      writeFileSync(join(outside, "escaped.bin"), "escaped\n");
      symlinkSync(outside, join(release, "escape"), "dir");
      assert.throws(
        () => createManifest({
          ...manifestOptions(
            { archive: artifact, executable: artifact, release: aliasedRelease },
            receipt(),
          ),
          artifacts: [{
            file: join(aliasedRelease, "escape", "escaped.bin"),
            kind: "standalone-executable",
          }],
        }),
        /must be below manifest directory|escapes canonical root/,
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  },
);

test("external sidecar verification remains simple", () => {
  const workspace = layout();
  try {
    const buildManifest = receipt();
    const manifest = createManifest(manifestOptions(workspace, buildManifest));
    const result = verifyManifest(manifest, { buildManifest, manifestDirectory: workspace.release });
    assert.equal(result.artifacts, 2);
    assert.equal(result.releaseIdentitySha256, manifest.integrity.releaseIdentitySha256);
    assert.throws(
      () => verifyManifest(manifest, { buildManifest: receipt(archiveSource(), { capabilities: { flint: false } }), manifestDirectory: workspace.release }),
      /build manifest mismatch/,
    );
  } finally {
    workspace.cleanup();
  }
});

test("successful CLI publication is canonical and leaves no temporary directory", () => {
  const workspace = layout();
  try {
    const buildManifest = join(workspace.release, "build-manifest.json");
    const manifest = join(workspace.release, "manifest.json");
    writeFileSync(buildManifest, serialize(receipt()));
    execFileSync(process.execPath, [
      SCRIPT, "create", "--output", manifest, "--build-manifest", buildManifest,
      "--artifact", `standalone=${workspace.executable}`,
    ]);
    const parsed = readManifest(manifest);
    assert.equal(readFileSync(manifest, "utf8"), serialize(parsed));
    assert.deepEqual(
      readdirSync(workspace.release)
        .filter((name) => name.startsWith(".sagejs-manifest-")),
      [],
    );
  } finally {
    workspace.cleanup();
  }
});

test("build manifest is an immutable pre-artifact SEA input", () => {
  const workspace = layout();
  try {
    const filename = join(workspace.release, "build-manifest.json");
    const buildManifest = receipt();
    writeFileSync(filename, serialize(buildManifest));
    const parsed = require("../scripts/release-manifest.cjs").readBuildManifest(filename);
    assert.deepEqual(parsed, buildManifest);
    assert.equal(serialize(parsed).includes("artifacts"), false);
    assert.equal(parsed.schema, "sagejs.release-build-manifest-v1");
    assert.match(parsed.identitySha256, /^[0-9a-f]{64}$/);
  } finally {
    workspace.cleanup();
  }
});

#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const {
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

const {
  createManifest,
  readManifest,
  serializeManifest,
  sourceIdentity,
  validateManifest,
  verifyManifest,
} = require("../scripts/release-manifest.cjs");

const REPOSITORY = resolve(__dirname, "..");
const SCRIPT = join(REPOSITORY, "scripts", "release-manifest.cjs");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const OTHER_COMMIT = "89abcdef0123456789abcdef0123456789abcdef";
const FIXED_BUILD = {
  nativeMathProfile: {
    effectiveProfile: "portable",
    fingerprint: "fixed-profile",
  },
  node: { modules: "137", napi: "10", version: "v26.0.0" },
};
const FIXED_TARGET = {
  arch: "x64",
  endianness: "LE",
  libc: { family: "glibc", version: "2.39" },
  nodeAbi: "137",
  nodeNapi: "10",
  platform: "linux",
  wordBits: 64,
};

function git(root, arguments_, options = {}) {
  return execFileSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function layout() {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-release-manifest-"));
  const source = join(directory, "source");
  const release = join(directory, "release");
  mkdirSync(source);
  mkdirSync(release);
  writeFileSync(join(source, "package.json"), '{"version":"0.2.0"}\n');
  writeFileSync(join(source, "README.md"), "release source\n");
  git(source, ["init", "--quiet", "--initial-branch=main"]);
  git(source, ["add", "package.json", "README.md"]);
  git(source, [
    "-c",
    "user.name=Sage.js Test",
    "-c",
    "user.email=sagejs@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "initial",
  ]);
  const artifacts = {
    executable: join(release, "sagejs-linux-x64"),
    package: join(release, "sagejs-linux-x64.tgz"),
  };
  writeFileSync(artifacts.executable, "native executable bytes\n");
  writeFileSync(artifacts.package, "package archive bytes\n");
  return {
    artifacts,
    cleanup: () => rmSync(directory, { force: true, recursive: true }),
    directory,
    release,
    source,
  };
}

function options(workspace, overrides = {}) {
  return {
    artifacts: [
      { file: workspace.artifacts.package, kind: "npm-package" },
      { file: workspace.artifacts.executable, kind: "standalone-executable" },
    ],
    build: FIXED_BUILD,
    capabilities: {
      graph: { available: false, reason: "not-built" },
      mathematics: ["flint", "m4ri"],
    },
    environment: {},
    manifestDirectory: workspace.release,
    root: workspace.source,
    target: FIXED_TARGET,
    ...overrides,
  };
}

test("manifest identity and output are stable across multiple artifacts", async () => {
  const workspace = layout();
  try {
    const first = await createManifest(options(workspace));
    const second = await createManifest(options(workspace, {
      artifacts: [...options(workspace).artifacts].reverse(),
    }));
    assert.equal(serializeManifest(first), serializeManifest(second));
    assert.equal(first.schema, "sagejs.release-artifact-manifest-v1");
    assert.equal(first.identity.sagejsVersion, "0.2.0");
    assert.equal(first.identity.source.kind, "git");
    assert.equal(first.identity.source.dirty, false);
    assert.match(first.identity.source.commit, /^[0-9a-f]{40}$/);
    assert.deepEqual(
      first.identity.artifacts.map(({ kind, path }) => ({ kind, path })),
      [
        { kind: "standalone-executable", path: "sagejs-linux-x64" },
        { kind: "npm-package", path: "sagejs-linux-x64.tgz" },
      ],
    );
    assert.equal(first.provenance.createdAt, undefined);
    assert.equal(JSON.stringify(first).includes(workspace.directory), false);
    const result = await verifyManifest(first, {
      capabilities: options(workspace).capabilities,
      manifestDirectory: workspace.release,
      sourceRoot: workspace.source,
    });
    assert.equal(result.artifacts, 2);
    assert.equal(result.identitySha256, first.integrity.identitySha256);
  } finally {
    workspace.cleanup();
  }
});

test("SOURCE_DATE_EPOCH adds reproducible creation provenance outside identity", async () => {
  const workspace = layout();
  try {
    const withoutTime = await createManifest(options(workspace));
    const withTime = await createManifest(options(workspace, {
      sourceDateEpoch: 1_700_000_000,
    }));
    assert.equal(
      withoutTime.integrity.identitySha256,
      withTime.integrity.identitySha256,
    );
    assert.notEqual(
      withoutTime.integrity.manifestSha256,
      withTime.integrity.manifestSha256,
    );
    assert.equal(withTime.provenance.sourceDateEpoch, 1_700_000_000);
    assert.equal(withTime.provenance.createdAt, "2023-11-14T22:13:20.000Z");
    assert.equal(
      serializeManifest(withTime),
      serializeManifest(await createManifest(options(workspace, {
        sourceDateEpoch: 1_700_000_000,
      }))),
    );
  } finally {
    workspace.cleanup();
  }
});

test("toolchain provenance normalizes compiler installation paths", async () => {
  const workspace = layout();
  try {
    const base = options(workspace);
    delete base.build;
    const first = await createManifest({
      ...base,
      environment: { CC: "/private/first/sagejs-test-cc" },
    });
    const second = await createManifest({
      ...base,
      environment: { CC: "/different/root/sagejs-test-cc" },
    });
    assert.deepEqual(first.provenance, second.provenance);
    assert.equal(serializeManifest(first).includes("/private/first"), false);
    assert.equal(serializeManifest(second).includes("/different/root"), false);
    assert.equal(
      first.provenance.build.nativeMathProfile.compilers.c.command,
      "sagejs-test-cc",
    );
  } finally {
    workspace.cleanup();
  }
});

test("verification fails closed for artifact and manifest tampering", async () => {
  const workspace = layout();
  try {
    const manifest = await createManifest(options(workspace));
    writeFileSync(workspace.artifacts.executable, "changed executable bytes\n");
    await assert.rejects(
      verifyManifest(manifest, { manifestDirectory: workspace.release }),
      /artifact size mismatch/,
    );
    writeFileSync(workspace.artifacts.executable, "native executable byteX\n");
    await assert.rejects(
      verifyManifest(manifest, { manifestDirectory: workspace.release }),
      /artifact SHA-256 mismatch/,
    );
    const changedIdentity = structuredClone(manifest);
    changedIdentity.identity.capabilities.mathematics.push("unexpected");
    assert.throws(() => validateManifest(changedIdentity), /identity checksum mismatch/);
    const changedProvenance = structuredClone(manifest);
    changedProvenance.provenance.build.node.version = "v99.0.0";
    assert.throws(() => validateManifest(changedProvenance), /manifest checksum mismatch/);
  } finally {
    workspace.cleanup();
  }
});

test("verification rejects non-regular substitution and capability mismatch", async () => {
  const workspace = layout();
  try {
    const manifest = await createManifest(options(workspace));
    rmSync(workspace.artifacts.package);
    if (process.platform === "win32") {
      mkdirSync(workspace.artifacts.package);
    } else {
      symlinkSync(workspace.artifacts.executable, workspace.artifacts.package);
    }
    await assert.rejects(
      verifyManifest(manifest, { manifestDirectory: workspace.release }),
      /not a regular non-symlink file/,
    );
    rmSync(workspace.artifacts.package, { recursive: true });
    writeFileSync(workspace.artifacts.package, "package archive bytes\n");
    await assert.rejects(
      verifyManifest(manifest, {
        capabilities: { mathematics: [] },
        manifestDirectory: workspace.release,
      }),
      /capability mismatch/,
    );
  } finally {
    workspace.cleanup();
  }
});

test("malformed and noncanonical manifests are rejected before artifact access", async () => {
  const workspace = layout();
  try {
    const manifest = await createManifest(options(workspace));
    for (const mutate of [
      (value) => { value.unexpected = true; },
      (value) => { value.identity.artifacts[0].path = "../escape"; },
      (value) => { value.identity.artifacts[0].sha256 = "not-a-hash"; },
      (value) => { value.identity.source.commit = "short"; },
      (value) => { value.identity.source.dirty = null; },
      (value) => { value.provenance.createdAt = "now"; },
    ]) {
      const malformed = structuredClone(manifest);
      mutate(malformed);
      assert.throws(() => validateManifest(malformed));
    }
    const filename = join(workspace.release, "invalid.json");
    writeFileSync(filename, "{ definitely not JSON\n");
    assert.throws(() => readManifest(filename), /cannot parse release manifest/);
    writeFileSync(filename, JSON.stringify(manifest));
    assert.throws(() => readManifest(filename), /not in canonical generated form/);
  } finally {
    workspace.cleanup();
  }
});

test("Git dirty state is exact and can be required clean", async () => {
  const workspace = layout();
  try {
    const cleanManifest = await createManifest(options(workspace));
    writeFileSync(join(workspace.source, "untracked.txt"), "dirty\n");
    assert.equal(sourceIdentity(workspace.source).dirty, true);
    assert.throws(
      () => sourceIdentity(workspace.source, { requireClean: true }),
      /release source is dirty/,
    );
    const dirtyManifest = await createManifest(options(workspace));
    assert.equal(dirtyManifest.identity.source.dirty, true);
    await assert.rejects(
      verifyManifest(cleanManifest, {
        manifestDirectory: workspace.release,
        sourceRoot: workspace.source,
      }),
      /source identity mismatch/,
    );
  } finally {
    workspace.cleanup();
  }
});

test("source archives require explicit commits and never claim a clean tree", async () => {
  const workspace = layout();
  try {
    const archiveOptions = options(workspace, {
      source: { sourceArchive: true, sourceCommit: COMMIT },
    });
    const manifest = await createManifest(archiveOptions);
    assert.deepEqual(manifest.identity.source, {
      commit: COMMIT,
      dirty: null,
      kind: "source-archive",
      tree: null,
    });
    await assert.rejects(
      verifyManifest(manifest, {
        manifestDirectory: workspace.release,
        sourceRoot: workspace.source,
      }),
      /independently supplied source commit/,
    );
    await verifyManifest(manifest, {
      manifestDirectory: workspace.release,
      sourceCommit: COMMIT,
      sourceRoot: workspace.source,
    });
    await assert.rejects(
      verifyManifest(manifest, {
        manifestDirectory: workspace.release,
        sourceCommit: OTHER_COMMIT,
        sourceRoot: workspace.source,
      }),
      /source identity mismatch/,
    );
    await assert.rejects(
      createManifest(options(workspace, { source: { sourceArchive: true } })),
      /source commit must be a nonempty string/,
    );
    await assert.rejects(
      createManifest(options(workspace, {
        source: {
          requireClean: true,
          sourceArchive: true,
          sourceCommit: COMMIT,
        },
      })),
      /unknown dirty state and cannot require a clean tree/,
    );
    writeFileSync(join(workspace.source, "package.json"), '{"version":"9.9.9"}\n');
    await assert.rejects(
      verifyManifest(manifest, {
        manifestDirectory: workspace.release,
        sourceCommit: COMMIT,
        sourceRoot: workspace.source,
      }),
      /source archive version mismatch/,
    );
  } finally {
    workspace.cleanup();
  }
});

test("CLI creates and verifies a portable manifest", () => {
  const workspace = layout();
  try {
    const capabilities = join(workspace.release, "capabilities.json");
    const manifest = join(workspace.release, "manifest.json");
    writeFileSync(capabilities, '{"flint":true,"m4ri":false}\n');
    const environment = { ...process.env, SOURCE_DATE_EPOCH: "1700000000" };
    const created = execFileSync(
      process.execPath,
      [
        SCRIPT,
        "create",
        "--output",
        manifest,
        "--source-root",
        workspace.source,
        "--require-clean",
        "--capabilities",
        capabilities,
        "--artifact",
        `standalone-executable=${workspace.artifacts.executable}`,
        "--artifact",
        `npm-package=${workspace.artifacts.package}`,
      ],
      { encoding: "utf8", env: environment },
    );
    assert.match(created, /Created .* for 2 artifact\(s\); identity [0-9a-f]{64}/);
    const parsed = JSON.parse(readFileSync(manifest, "utf8"));
    assert.equal(parsed.provenance.sourceDateEpoch, 1_700_000_000);
    const verified = execFileSync(
      process.execPath,
      [
        SCRIPT,
        "verify",
        "--manifest",
        manifest,
        "--source-root",
        workspace.source,
        "--capabilities",
        capabilities,
      ],
      { encoding: "utf8" },
    );
    assert.match(verified, /Verified 2 artifact\(s\); identity [0-9a-f]{64}/);
  } finally {
    workspace.cleanup();
  }
});

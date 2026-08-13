"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const test = require("node:test");

const {
  createSeaBuildManifest,
  maximumGlibcVersion,
  productionKernelReceipt,
  SEA_ASSEMBLY_POLICY,
  stageSeaInputs,
  targetFromSeaBuilder,
} = require("../scripts/build-sea.cjs");
const {
  serialize,
  validateBuildManifest,
} = require("../scripts/release-manifest.cjs");

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const TREE = "89abcdef0123456789abcdef0123456789abcdef";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function write(filename, contents) {
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, contents);
  return filename;
}

function git(root, arguments_) {
  return execFileSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function mathProfile() {
  const identity = stable({
    abi: {
      arch: "x64",
      endianness: "LE",
      platform: "linux",
      wordBits: 64,
    },
    buildOptions: { flint: { cflags: ["-O3", "-fPIC"] } },
    compilers: { c: { command: "cc", version: "fixture" } },
    cpu: null,
    dependencies: { flint: "3.6.0", gmp: "6.3.0" },
    effectiveProfile: "portable",
    fallbackReason: null,
    requestedProfile: "portable",
    schema: "sagejs.native-math-profile-v1",
  });
  return {
    ...identity,
    fingerprint: sha256(JSON.stringify(identity)),
  };
}

function builderObservation() {
  return {
    arch: "x64",
    endianness: "LE",
    platform: "linux",
    versions: { modules: "137", napi: "10", node: "26.7.0" },
  };
}

function fixedSource() {
  return {
    commit: COMMIT,
    contentSha256: "a".repeat(64),
    dirty: false,
    kind: "git-clean",
    tree: TREE,
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sagejs-sea-manifest-"));
  write(join(root, "package.json"), '{"version":"0.2.0"}\n');
  const sources = [
    "sagejs/kernels/matrix/first.py",
    "sagejs/kernels/polynomial/second.py",
  ];
  write(
    join(root, "architecture", "native-kernels.json"),
    `${JSON.stringify({
      kernels: sources.map((source, index) => ({
        id: `fixture-${index}-production`,
        source: `src/lib/${source}`,
      })),
    })}\n`,
  );
  const logicalSources = Object.fromEntries(sources.map((source, index) => {
    const contents = `# fixture kernel ${index}\n`;
    write(join(root, "src", "lib", ...source.split("/")), contents);
    return [source, {
      cacheKey: String(index + 1).repeat(64),
      foreignDeclarations: [],
      nativeAbi: 21,
      sourceHash: sha256(contents),
    }];
  }));
  const assets = {
    "native/zeromq.node": write(join(root, "assets", "zeromq.node"), "zero"),
    "native/sagejs_flint_ffi.node": write(
      join(root, "assets", "sagejs_flint_ffi.node"),
      "flint ffi",
    ),
    "native/sagejs_m4ri_ffi.node": write(
      join(root, "assets", "sagejs_m4ri_ffi.node"),
      "m4ri ffi",
    ),
    "native-kernels/index.json": write(
      join(root, "assets", "index.json"),
      `${JSON.stringify({
        logicalSources,
        schema: "sagejs.native-cache/v3",
        sources: {},
      })}\n`,
    ),
  };
  for (const record of Object.values(logicalSources)) {
    for (const [suffix, contents] of [
      ["index.cjs", "wrapper"],
      ["build/Release/sagejs_native_kernel.node", "addon"],
    ]) {
      const asset = `native-kernels/${record.cacheKey}/${suffix}`;
      assets[asset] = write(join(root, "assets", ...asset.split("/")), contents);
    }
  }
  const seaNode = write(join(root, "node-template"), "node template bytes");
  const mainBundle = write(join(root, "sea-entry.cjs"), "main bundle bytes");
  return {
    assets,
    cleanup: () => rmSync(root, { force: true, recursive: true }),
    mainBundle,
    root,
    seaNode,
    sources,
  };
}

function options(item, overrides = {}) {
  return {
    assets: item.assets,
    builderObservation: builderObservation(),
    glibcVersion: "2.28",
    mainBundle: item.mainBundle,
    nativeMathProfile: mathProfile(),
    root: item.root,
    seaNode: item.seaNode,
    sourceIdentity: fixedSource(),
    withFlint: true,
    ...overrides,
  };
}

function profileWith(overrides) {
  const identity = stable({ ...mathProfile(), ...overrides });
  delete identity.fingerprint;
  return { ...identity, fingerprint: sha256(JSON.stringify(identity)) };
}

test("GLIBC target is derived from the Node executable requirement", () => {
  assert.equal(
    maximumGlibcVersion(
      "GLIBC_2.2.5 GLIBCXX_3.4.30 GLIBC_2.17 GLIBC_2.28 GLIBC_2.3",
    ),
    "2.28",
  );
  const item = fixture();
  try {
    assert.deepEqual(
      targetFromSeaBuilder(item.seaNode, options(item)),
      {
        arch: "x64",
        endianness: "LE",
        libc: { family: "glibc", version: "2.28" },
        nodeAbi: "137",
        nodeNapi: "10",
        platform: "linux",
        wordBits: 64,
      },
    );
  } finally {
    item.cleanup();
  }
});

test("Linux compatibility covers every embedded native addon", () => {
  const item = fixture();
  try {
    const requirements = new Map([
      [item.seaNode, "GLIBC_2.28"],
      [item.assets["native/sagejs_m4ri_ffi.node"], "GLIBC_2.29"],
      [item.assets["native/sagejs_flint_ffi.node"], "GLIBC_2.38"],
    ]);
    const spawn = (command, arguments_) => ({
      status: 0,
      stdout: requirements.get(arguments_.at(-1)) ?? "GLIBC_2.17",
    });
    assert.equal(
      targetFromSeaBuilder(
        item.seaNode,
        options(item, {
          glibcVersion: undefined,
          nativeExecutables: [
            item.assets["native/sagejs_m4ri_ffi.node"],
            item.assets["native/sagejs_flint_ffi.node"],
          ],
          spawn,
        }),
      ).libc.version,
      "2.38",
    );
  } finally {
    item.cleanup();
  }
});

test("mathematics SEA receipt binds authority, index, sources, and every native byte", () => {
  const item = fixture();
  try {
    const first = createSeaBuildManifest(options(item));
    const second = createSeaBuildManifest(options(item));
    validateBuildManifest(first);
    assert.equal(serialize(first), serialize(second));
    assert.equal(first.schema, "sagejs.release-build-manifest-v1");
    assert.deepEqual(first.capabilities.artifact, {
      kind: "single-executable",
      nativeMathematics: true,
    });
    assert.deepEqual(
      first.capabilities.nativeKernels.logicalSources,
      item.sources,
    );
    assert.equal(
      first.capabilities.nativeKernels.authoritySha256,
      sha256(readFileSync(join(item.root, "architecture", "native-kernels.json"))),
    );
    assert.equal(
      first.capabilities.nativeKernels.indexSha256,
      sha256(readFileSync(item.assets["native-kernels/index.json"])),
    );
    assert.equal(
      first.capabilities.nativeKernels.schema,
      "sagejs.native-kernel-receipt/v1",
    );
    assert.equal(
      first.capabilities.nativeKernels.expected,
      item.sources.length,
    );
    assert.deepEqual(
      Object.keys(first.capabilities.embeddedAssets.assets),
      Object.keys(item.assets).sort(),
    );
    assert.equal(
      first.capabilities.embeddedAssets.schema,
      "sagejs.embedded-assets/v1",
    );
    assert.equal(
      first.toolchain.nativeMathProfile.fingerprint,
      mathProfile().fingerprint,
    );
    assert.match(first.toolchain.seaNode.executableSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(first.toolchain.seaMain, {
      sha256: sha256(readFileSync(item.mainBundle)),
      size: readFileSync(item.mainBundle).length,
    });
    assert.deepEqual(first.toolchain.seaAssembly, SEA_ASSEMBLY_POLICY);
  } finally {
    item.cleanup();
  }
});

test("Python-only SEA has a distinct receipt with no mathematical assets", () => {
  const item = fixture();
  try {
    const pythonAssets = {
      "native/zeromq.node": item.assets["native/zeromq.node"],
    };
    const manifest = createSeaBuildManifest(options(item, {
      assets: pythonAssets,
      withFlint: false,
    }));
    assert.deepEqual(manifest.capabilities.artifact, {
      kind: "single-executable",
      nativeMathematics: false,
    });
    assert.equal(manifest.capabilities.nativeKernels, null);
    assert.deepEqual(
      Object.keys(manifest.capabilities.embeddedAssets.assets),
      ["native/zeromq.node"],
    );
    assert.equal(manifest.toolchain.nativeMathProfile, null);
  } finally {
    item.cleanup();
  }
});

test("kernel receipt fails closed on authority, index, or asset drift", () => {
  const item = fixture();
  try {
    const incomplete = { ...item.assets };
    delete incomplete[Object.keys(incomplete).find((asset) =>
      asset.endsWith("sagejs_native_kernel.node"),
    )];
    assert.throws(
      () => productionKernelReceipt(item.root, incomplete),
      /omitted/,
    );
    const index = JSON.parse(
      readFileSync(item.assets["native-kernels/index.json"], "utf8"),
    );
    delete index.logicalSources[item.sources[0]];
    writeFileSync(
      item.assets["native-kernels/index.json"],
      `${JSON.stringify(index)}\n`,
    );
    assert.throws(
      () => productionKernelReceipt(item.root, item.assets),
      /does not exactly match/,
    );
  } finally {
    item.cleanup();
  }
});

test("build identity binds ordinary runtime assets and the SEA main bundle", () => {
  const item = fixture();
  try {
    const first = createSeaBuildManifest(options(item));
    writeFileSync(item.assets["native/zeromq.node"], "different zeromq bytes");
    const changedAsset = createSeaBuildManifest(options(item));
    assert.notEqual(first.identitySha256, changedAsset.identitySha256);

    writeFileSync(item.mainBundle, "different main bundle bytes");
    const changedMain = createSeaBuildManifest(options(item));
    assert.notEqual(changedAsset.identitySha256, changedMain.identitySha256);

    const changedPolicy = createSeaBuildManifest(options(item, {
      seaAssemblyPolicy: { ...SEA_ASSEMBLY_POLICY, useCodeCache: false },
    }));
    assert.notEqual(changedMain.identitySha256, changedPolicy.identitySha256);

    item.assets["release/build-manifest.json"] = write(
      join(item.root, "self.json"),
      "self reference excluded",
    );
    assert.equal(
      createSeaBuildManifest(options(item)).identitySha256,
      changedMain.identitySha256,
    );
  } finally {
    item.cleanup();
  }
});

test("SEA inputs are copied into an immutable logical staging layout", () => {
  const item = fixture();
  try {
    const stagingRoot = join(item.root, "staging");
    const staged = stageSeaInputs(
      "sagejs",
      item.seaNode,
      item.mainBundle,
      item.assets,
      { outputDirectory: stagingRoot },
    );
    assert.equal(readFileSync(staged.mainBundle, "utf8"), "main bundle bytes");
    assert.equal(readFileSync(staged.seaNode, "utf8"), "node template bytes");
    for (const [asset, filename] of Object.entries(staged.assets)) {
      assert.equal(
        readFileSync(filename, "utf8"),
        readFileSync(item.assets[asset], "utf8"),
      );
      assert.equal(
        filename,
        join(staged.directory, "assets", ...asset.split("/")),
      );
    }
    writeFileSync(item.mainBundle, "source changed after staging");
    assert.equal(readFileSync(staged.mainBundle, "utf8"), "main bundle bytes");
  } finally {
    item.cleanup();
  }
});

test("production kernel receipt rejects a stale compiled source", () => {
  const item = fixture();
  try {
    writeFileSync(
      join(item.root, "src", "lib", ...item.sources[0].split("/")),
      "# changed after native compilation\n",
    );
    assert.throws(
      () => productionKernelReceipt(item.root, item.assets),
      /is stale/,
    );
  } finally {
    item.cleanup();
  }
});

test("ordinary SEA builds record an exact dirty source identity", () => {
  const item = fixture();
  try {
    write(join(item.root, "tracked.txt"), "tracked\n");
    git(item.root, ["init", "--quiet", "--initial-branch=main"]);
    git(item.root, ["add", "."]);
    git(item.root, [
      "-c",
      "user.name=Sage.js Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "initial",
    ]);
    writeFileSync(join(item.root, "tracked.txt"), "first dirty contents\n");
    const first = createSeaBuildManifest(options(item, {
      sourceIdentity: undefined,
    }));
    writeFileSync(join(item.root, "tracked.txt"), "second dirty contents\n");
    const second = createSeaBuildManifest(options(item, {
      sourceIdentity: undefined,
    }));
    assert.equal(first.source.kind, "git-dirty");
    assert.equal(first.source.dirty, true);
    assert.notEqual(first.source.contentSha256, second.source.contentSha256);
  } finally {
    item.cleanup();
  }
});

test("mathematics profile must exactly match the builder target", () => {
  const item = fixture();
  try {
    assert.throws(
      () => createSeaBuildManifest(options(item, {
        nativeMathProfile: profileWith({
          abi: { ...mathProfile().abi, arch: "arm64" },
        }),
      })),
      /does not match/,
    );
    assert.throws(
      () =>
        createSeaBuildManifest(
          options(item, {
            nativeMathProfile: {
              ...mathProfile(),
              fingerprint: "f".repeat(64),
            },
          }),
        ),
      /fingerprint is invalid/,
    );
  } finally {
    item.cleanup();
  }
});

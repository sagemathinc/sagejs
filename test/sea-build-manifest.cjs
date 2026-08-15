"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const test = require("node:test");

const {
  createSeaBuildManifest,
  EMBEDDED_ADDON_ROLE,
  NODE_TEMPLATE_LABEL,
  NODE_TEMPLATE_ROLE,
  nativeBinaryPolicy,
  nativeDependencyReceiptSource,
  productionKernelReceipt,
  seaBuildPlan,
  seaNodeSourceFromEnvironment,
  seaNodeRustToolchainFromEnvironment,
  SEA_ASSEMBLY_POLICY,
  stageSeaInputs,
  targetFromSeaBuilder,
  validateNativeDependencyReceiptSources,
  withSeaBuildLock,
} = require("../scripts/build-sea.cjs");
const {
  serialize,
  validateBuildManifest,
} = require("../scripts/release-manifest.cjs");
const {
  createNativeDependencyReceipt,
} = require("../scripts/native-dependency-receipt.cjs");

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const TREE = "89abcdef0123456789abcdef0123456789abcdef";

test("SEA build helpers are import-safe under unrelated release arguments", () => {
  const script = [
    'process.argv.push("--target", "windows-x64", "--archive", "candidate.zip");',
    'const sea = require("./scripts/build-sea.cjs");',
    "process.stdout.write(JSON.stringify({",
    "  addon: sea.EMBEDDED_ADDON_ROLE,",
    "  label: sea.NODE_TEMPLATE_LABEL,",
    "  template: sea.NODE_TEMPLATE_ROLE,",
    "}));",
  ].join("\n");
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: join(__dirname, ".."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    addon: "embedded-node-addon",
    label: "sea/node-template",
    template: "executable-template",
  });
});

test("SEA direct build planning preserves CLI modes and validation", () => {
  assert.deepEqual(seaBuildPlan([], "26.7.0"), {
    buildMath: false,
    buildPython: true,
  });
  assert.deepEqual(seaBuildPlan(["--python"], "26.7.0"), {
    buildMath: false,
    buildPython: true,
  });
  assert.deepEqual(seaBuildPlan(["--with-flint"], "26.7.0"), {
    buildMath: true,
    buildPython: false,
  });
  assert.deepEqual(seaBuildPlan(["--all"], "26.7.0"), {
    buildMath: true,
    buildPython: true,
  });
  assert.throws(
    () => seaBuildPlan(["--target", "windows-x64"], "26.7.0"),
    /usage: node scripts\/build-sea\.cjs/,
  );
  assert.throws(
    () => seaBuildPlan(["--all"], "25.4.0"),
    /requires Node\.js 25\.5 or newer/,
  );

  const direct = spawnSync(
    process.execPath,
    [join(__dirname, "..", "scripts", "build-sea.cjs"), "--not-a-mode"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  assert.equal(direct.status, 1);
  assert.match(direct.stderr, /usage: node scripts\/build-sea\.cjs/);
});

test("SEA Node source provenance is canonical and fail-closed", () => {
  const source = {
    SAGEJS_SEA_NODE_SOURCE_FILENAME: "node-v26.7.0.tar.xz",
    SAGEJS_SEA_NODE_SOURCE_SHA256: "a".repeat(64),
    SAGEJS_SEA_NODE_SOURCE_URL:
      "https://nodejs.org/dist/v26.7.0/node-v26.7.0.tar.xz",
    SAGEJS_SEA_NODE_SOURCE_VERSION: "26.7.0",
  };
  assert.deepEqual(seaNodeSourceFromEnvironment(source), {
    filename: source.SAGEJS_SEA_NODE_SOURCE_FILENAME,
    sha256: source.SAGEJS_SEA_NODE_SOURCE_SHA256,
    url: source.SAGEJS_SEA_NODE_SOURCE_URL,
    version: source.SAGEJS_SEA_NODE_SOURCE_VERSION,
  });
  const distribution = {
    ...source,
    SAGEJS_SEA_NODE_SOURCE_FILENAME: "node-v26.7.0-darwin-arm64.tar.xz",
    SAGEJS_SEA_NODE_SOURCE_URL:
      "https://nodejs.org/dist/v26.7.0/node-v26.7.0-darwin-arm64.tar.xz",
  };
  assert.deepEqual(seaNodeSourceFromEnvironment(distribution), {
    filename: distribution.SAGEJS_SEA_NODE_SOURCE_FILENAME,
    sha256: distribution.SAGEJS_SEA_NODE_SOURCE_SHA256,
    url: distribution.SAGEJS_SEA_NODE_SOURCE_URL,
    version: distribution.SAGEJS_SEA_NODE_SOURCE_VERSION,
  });
  assert.equal(seaNodeSourceFromEnvironment({}), null);
  assert.throws(
    () => seaNodeSourceFromEnvironment({
      SAGEJS_SEA_NODE_SOURCE_VERSION: "26.7.0",
    }),
    /incomplete/,
  );
  assert.throws(
    () => seaNodeSourceFromEnvironment({
      ...source,
      SAGEJS_SEA_NODE_SOURCE_URL: "https://example.invalid/node.tar.xz",
    }),
    /Expected values to be strictly equal/,
  );
  assert.throws(
    () => seaNodeSourceFromEnvironment({
      ...source,
      SAGEJS_SEA_NODE_SOURCE_FILENAME: "../node-v26.7.0.tar.xz",
      SAGEJS_SEA_NODE_SOURCE_URL:
        "https://nodejs.org/dist/v26.7.0/../node-v26.7.0.tar.xz",
    }),
    /not an official source or distribution archive/,
  );
  const windows = {
    SAGEJS_SEA_NODE_SOURCE_FILENAME: "node-v26.7.0-win-x64.zip",
    SAGEJS_SEA_NODE_SOURCE_SHA256: "d3bd72755141ed32bbcd841228ee81897c8a98d50dfa7dae2179399a0a7c90f8",
    SAGEJS_SEA_NODE_SOURCE_URL:
      "https://nodejs.org/dist/v26.7.0/node-v26.7.0-win-x64.zip",
    SAGEJS_SEA_NODE_SOURCE_VERSION: "26.7.0",
  };
  assert.deepEqual(seaNodeSourceFromEnvironment(windows), {
    filename: windows.SAGEJS_SEA_NODE_SOURCE_FILENAME,
    sha256: windows.SAGEJS_SEA_NODE_SOURCE_SHA256,
    url: windows.SAGEJS_SEA_NODE_SOURCE_URL,
    version: windows.SAGEJS_SEA_NODE_SOURCE_VERSION,
  });
  assert.throws(
    () => seaNodeSourceFromEnvironment({
      ...windows,
      SAGEJS_SEA_NODE_SOURCE_FILENAME: "node-v26.7.0-win-x64.7z",
      SAGEJS_SEA_NODE_SOURCE_URL:
        "https://nodejs.org/dist/v26.7.0/node-v26.7.0-win-x64.7z",
    }),
    /not an official source or distribution archive/,
  );
});

test("SEA Node Rust toolchain provenance is canonical and fail-closed", () => {
  const source = {
    SAGEJS_SEA_NODE_RUST_FILENAME:
      "rust-1.86.0-x86_64-unknown-linux-gnu.tar.xz",
    SAGEJS_SEA_NODE_RUST_SHA256: "b".repeat(64),
    SAGEJS_SEA_NODE_RUST_TARGET: "x86_64-unknown-linux-gnu",
    SAGEJS_SEA_NODE_RUST_URL:
      "https://static.rust-lang.org/dist/2025-04-03/" +
      "rust-1.86.0-x86_64-unknown-linux-gnu.tar.xz",
    SAGEJS_SEA_NODE_RUST_VERSION: "1.86.0",
  };
  assert.deepEqual(seaNodeRustToolchainFromEnvironment(source), {
    filename: source.SAGEJS_SEA_NODE_RUST_FILENAME,
    sha256: source.SAGEJS_SEA_NODE_RUST_SHA256,
    target: source.SAGEJS_SEA_NODE_RUST_TARGET,
    url: source.SAGEJS_SEA_NODE_RUST_URL,
    version: source.SAGEJS_SEA_NODE_RUST_VERSION,
  });
  assert.equal(seaNodeRustToolchainFromEnvironment({}), null);
  assert.throws(
    () => seaNodeRustToolchainFromEnvironment({
      SAGEJS_SEA_NODE_RUST_VERSION: "1.86.0",
    }),
    /incomplete/,
  );
  assert.throws(
    () => seaNodeRustToolchainFromEnvironment({
      ...source,
      SAGEJS_SEA_NODE_RUST_URL: "https://example.invalid/rust.tar.xz",
    }),
    /did not match/,
  );
  assert.throws(
    () => seaNodeRustToolchainFromEnvironment({
      ...source,
      SAGEJS_SEA_NODE_RUST_FILENAME: "rust-substitute.tar.xz",
    }),
    /Expected values to be strictly equal/,
  );
});

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

function dependencyReceipt(root, id, options = {}) {
  const prefix = options.prefix || join(root, "dependency-prefixes", id);
  const stamp = options.stamp || join(prefix, `.sagejs-${id}-receipt.json`);
  const header = id === "igraph" ? "igraph_ffi.h" : "m4ri_matrix_ffi.h";
  const headerContents = readFileSync(join(
    __dirname,
    "..",
    "packages",
    id === "igraph" ? "graph" : "m4ri",
    "include",
    "sagejs",
    header,
  ));
  write(join(prefix, "include", "sagejs", header), headerContents);
  write(
    join(prefix, "lib", id === "igraph" ? "libigraph.a" : "libm4ri.a"),
    `${id} archive\n`,
  );
  const receipt = createNativeDependencyReceipt(
    {
      build: { configuration: "fixture" },
      dependency: {
        name: id,
        sha256: id === "igraph"
          ? "969f2d7d22f67e788d8638c9a8c96615f50d7819c08978b3ef4a787bb6daa96c"
          : "7e033ca1fd36be8861e2f67d9d124c398fc0d830209bb0226462485876346404",
        version: id === "igraph" ? "1.0.1" : "20260122",
      },
      deployment: null,
      interface: {
        header: `include/sagejs/${header}`,
        sha256: sha256(headerContents),
      },
      mathProfile: mathProfile(),
      package: id,
      toolchain: { compiler: "fixture" },
    },
    prefix,
    stamp,
  );
  write(stamp, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function cachedDependencyGeneration(root, cacheRoot, id, key) {
  const packageId = id === "igraph" ? "graph" : id;
  const relativePrefix = join("packages", packageId, ".native", "prefix");
  const entry = join(cacheRoot, `${packageId}-dependencies`, key);
  const prefix = join(entry, "payload", relativePrefix);
  const stampName = id === "igraph"
    ? ".sagejs-igraph-1.0.1"
    : ".sagejs-m4ri-dependencies.json";
  const stamp = join(prefix, stampName);
  const receipt = dependencyReceipt(root, id, { prefix, stamp });
  write(join(entry, "manifest.json"), "{}\n");
  chmodSync(stamp, 0o444);
  for (const directory of [
    prefix,
    dirname(prefix),
    dirname(dirname(prefix)),
    dirname(dirname(dirname(prefix))),
    join(entry, "payload"),
  ]) chmodSync(directory, 0o555);
  chmodSync(entry, 0o700);
  return { entry, prefix, receipt, stamp, stampName };
}

function nativeBinaryReport(item, glibc = "2.28") {
  const entries = [
    {
      label: NODE_TEMPLATE_LABEL,
      path: item.seaNode,
      role: NODE_TEMPLATE_ROLE,
    },
    ...Object.entries(item.assets)
      .filter(([name]) => name.endsWith(".node"))
      .map(([label, path]) => ({ label, path, role: EMBEDDED_ADDON_ROLE })),
  ].sort((left, right) => left.label.localeCompare(right.label));
  const files = entries.map(({ label, path, role }) => ({
    architecture: "x64",
    dependencies: ["libc.so.6"],
    endianness: "little",
    format: "elf",
    glibcVersions: [glibc],
    interpreter: label === NODE_TEMPLATE_LABEL ? "/lib64/ld-linux-x86-64.so.2" : null,
    label,
    machine: 62,
    maximumGlibc: glibc,
    osAbi: 0,
    requiredSymbolVersions: [`GLIBC_${glibc}`],
    role,
    rpaths: [],
    sha256: sha256(readFileSync(path)),
    size: readFileSync(path).length,
    symbolVersionFamilies: {
      GLIBC: { maximum: glibc, versions: [glibc] },
    },
    wordSize: 64,
  }));
  return {
    aggregate: {
      architectures: ["x64"],
      dependencies: ["libc.so.6"],
      formats: ["elf"],
      maximumGlibc: glibc,
      maximumMinimumMacos: null,
      maximumSymbolVersions: { GLIBC: glibc },
    },
    files,
    inputSetSha256: sha256(JSON.stringify(files.map(
      ({ label, role, sha256, size }) => ({ label, role, sha256, size }),
    ))),
    ok: true,
    policy: {
      architectures: ["x64"],
      exactArchitectures: true,
      format: "elf",
      requiredLabels: files.map(({ label }) => label),
    },
    schema: "sagejs.native-binary-inspection-v1",
    violations: [],
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
    "native/sagejs_m4ri_ffi_manifest.json": write(
      join(root, "assets", "sagejs_m4ri_ffi_manifest.json"),
      "{}\n",
    ),
    "native/sagejs_graph.node": write(
      join(root, "assets", "sagejs_graph.node"),
      "graph base",
    ),
    "native/sagejs_igraph_ffi.node": write(
      join(root, "assets", "sagejs_igraph_ffi.node"),
      "igraph ffi",
    ),
    "native/sagejs_igraph_ffi_manifest.json": write(
      join(root, "assets", "sagejs_igraph_ffi_manifest.json"),
      "{}\n",
    ),
    "native/dependencies/igraph-receipt.json": write(
      join(root, "assets", "dependencies", "igraph-receipt.json"),
      `${JSON.stringify(dependencyReceipt(root, "igraph"), null, 2)}\n`,
    ),
    "native/dependencies/m4ri-receipt.json": write(
      join(root, "assets", "dependencies", "m4ri-receipt.json"),
      `${JSON.stringify(dependencyReceipt(root, "m4ri"), null, 2)}\n`,
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
    nativeDependencySources: Object.fromEntries(["igraph", "m4ri"].map((id) => {
      const prefix = join(root, "dependency-prefixes", id);
      const stamp = join(prefix, `.sagejs-${id}-receipt.json`);
      return [id, {
        identitySha256: JSON.parse(readFileSync(stamp, "utf8")).identitySha256,
        prefix,
        prefixLink: prefix,
        stamp,
      }];
    })),
    root,
    seaNode,
    sources,
  };
}

function options(item, overrides = {}) {
  return {
    assets: item.assets,
    builderObservation: builderObservation(),
    mainBundle: item.mainBundle,
    nativeBinaryReport: nativeBinaryReport(item),
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

test("GLIBC target is derived from the exact native binary inspection", () => {
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
    assert.equal(
      targetFromSeaBuilder(
        item.seaNode,
        options(item, {
          nativeBinaryReport: nativeBinaryReport(item, "2.38"),
        }),
      ).libc.version,
      "2.38",
    );
  } finally {
    item.cleanup();
  }
});

test("Darwin SEA policy records the declared release floor", () => {
  const labels = ["native/zeromq.node", "sea/node-template"];
  assert.deepEqual(
    nativeBinaryPolicy(
      { arch: "arm64", platform: "darwin" },
      labels,
      { SAGEJS_MACOS_RELEASE_MINIMUM: "13.5" },
    ),
    {
      architectures: ["arm64"],
      exactArchitectures: true,
      format: "macho",
      maximumMinimumMacos: "13.5",
      requiredLabels: [...labels].sort(),
    },
  );
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
      Object.keys(first.capabilities.nativeDependencies.bindings),
      ["igraph", "m4ri"],
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
    assert.equal(
      first.toolchain.nativeBinaries.report.aggregate.maximumGlibc,
      "2.28",
    );
    assert.match(first.toolchain.nativeBinaries.reportSha256, /^[0-9a-f]{64}$/);
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
    assert.equal(manifest.capabilities.nativeDependencies, null);
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

test("build identity binds the exact Rust toolchain used for Linux Node", () => {
  const item = fixture();
  try {
    const rustToolchain = {
      filename: "rust-1.86.0-x86_64-unknown-linux-gnu.tar.xz",
      sha256: "b".repeat(64),
      target: "x86_64-unknown-linux-gnu",
      url:
        "https://static.rust-lang.org/dist/2025-04-03/" +
        "rust-1.86.0-x86_64-unknown-linux-gnu.tar.xz",
      version: "1.86.0",
    };
    const first = createSeaBuildManifest(options(item, {
      seaNodeRustToolchain: rustToolchain,
    }));
    assert.deepEqual(first.toolchain.seaNode.rustToolchain, rustToolchain);

    const substituted = createSeaBuildManifest(options(item, {
      seaNodeRustToolchain: {
        ...rustToolchain,
        sha256: "c".repeat(64),
      },
    }));
    assert.notEqual(first.identitySha256, substituted.identitySha256);
  } finally {
    item.cleanup();
  }
});

test("SEA code caching is generated under deterministic V8 policy", () => {
  assert.equal(SEA_ASSEMBLY_POLICY.useCodeCache, true);
  assert.ok(SEA_ASSEMBLY_POLICY.builderArguments.includes("--predictable"));
  assert.deepEqual(
    SEA_ASSEMBLY_POLICY.builderArguments.slice(-2),
    ["--build-sea", "sea-config.json"],
  );
});

test("SEA inputs are copied into an immutable logical staging layout", () => {
  const item = fixture();
  try {
    const stagingRoot = join(item.root, "staging");
    const staged = stageSeaInputs(
      "sagejs",
      item.seaNode,
      item.mainBundle,
      Object.fromEntries(Object.entries(item.assets).reverse()),
      { outputDirectory: stagingRoot },
    );
    const concurrent = stageSeaInputs(
      "sagejs",
      item.seaNode,
      item.mainBundle,
      item.assets,
      { outputDirectory: stagingRoot },
    );
    assert.notEqual(staged.directory, concurrent.directory);
    assert.deepEqual(
      Object.keys(staged.assets),
      Object.keys(item.assets).sort((left, right) => left.localeCompare(right)),
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

test(
  "dependency receipts stage through only exact immutable native-cache links",
  { skip: process.platform === "win32" },
  () => {
    const root = mkdtempSync(join(tmpdir(), "sagejs-sea-cache-receipt-"));
    const cacheRoot = join(root, "native-cache");
    const installedPrefix = join(
      root,
      "packages",
      "m4ri",
      ".native",
      "prefix",
    );
    mkdirSync(dirname(installedPrefix), { recursive: true });
    mkdirSync(cacheRoot, { recursive: true });
    const first = cachedDependencyGeneration(
      root,
      cacheRoot,
      "m4ri",
      "1".repeat(64),
    );
    const second = cachedDependencyGeneration(
      root,
      cacheRoot,
      "m4ri",
      "2".repeat(64),
    );
    symlinkSync(first.prefix, installedPrefix, "dir");
    try {
      const source = nativeDependencyReceiptSource(
        root,
        "m4ri",
        installedPrefix,
        first.stampName,
        { cacheRoot },
      );
      assert.equal(source.prefix, first.prefix);
      assert.equal(source.stamp, first.stamp);
      const staged = stageSeaInputs(
        "sagejs",
        write(join(root, "node-template"), "node"),
        write(join(root, "main.cjs"), "main"),
        { "native/dependencies/m4ri-receipt.json": source.stamp },
        { outputDirectory: join(root, "stage") },
      );
      assert.deepEqual(
        readFileSync(staged.assets["native/dependencies/m4ri-receipt.json"]),
        readFileSync(first.stamp),
      );
      const sources = {
        m4ri: { identitySha256: first.receipt.identitySha256, ...source },
      };
      assert.deepEqual(validateNativeDependencyReceiptSources(sources), {
        m4ri: first.receipt.identitySha256,
      });

      unlinkSync(installedPrefix);
      symlinkSync(second.prefix, installedPrefix, "dir");
      assert.throws(
        () => validateNativeDependencyReceiptSources(sources),
        /prefix changed during SEA assembly/,
      );

      unlinkSync(installedPrefix);
      const escaped = join(root, "outside", "prefix");
      dependencyReceipt(root, "m4ri", {
        prefix: escaped,
        stamp: join(escaped, first.stampName),
      });
      symlinkSync(escaped, installedPrefix, "dir");
      assert.throws(
        () => nativeDependencyReceiptSource(
          root,
          "m4ri",
          installedPrefix,
          first.stampName,
          { cacheRoot },
        ),
        /not an exact content-addressed cache link/,
      );

      unlinkSync(installedPrefix);
      const externalRoot = mkdtempSync(join(tmpdir(), "sagejs-external-prefix-"));
      const ordinaryExternalPrefix = join(externalRoot, "ordinary");
      const ordinaryExternalStamp = join(
        ordinaryExternalPrefix,
        first.stampName,
      );
      const ordinaryExternalReceipt = dependencyReceipt(root, "m4ri", {
        prefix: ordinaryExternalPrefix,
        stamp: ordinaryExternalStamp,
      });
      const ordinarySource = nativeDependencyReceiptSource(
        root,
        "m4ri",
        ordinaryExternalPrefix,
        first.stampName,
        { cacheRoot },
      );
      assert.equal(ordinarySource.prefix, ordinaryExternalPrefix);
      assert.deepEqual(validateNativeDependencyReceiptSources({
        m4ri: {
          identitySha256: ordinaryExternalReceipt.identitySha256,
          ...ordinarySource,
        },
      }), { m4ri: ordinaryExternalReceipt.identitySha256 });

      const outsidePrefix = join(externalRoot, "linked");
      const outsideRelative = join("outside-workspace", "prefix");
      const outsideCachedPrefix = join(
        cacheRoot,
        "m4ri-dependencies",
        "3".repeat(64),
        outsideRelative,
      );
      const outsideStamp = join(outsideCachedPrefix, first.stampName);
      dependencyReceipt(root, "m4ri", {
        prefix: outsideCachedPrefix,
        stamp: outsideStamp,
      });
      chmodSync(outsideStamp, 0o444);
      for (const directory of [
        outsideCachedPrefix,
        dirname(outsideCachedPrefix),
        dirname(dirname(outsideCachedPrefix)),
      ]) chmodSync(directory, 0o555);
      mkdirSync(dirname(outsidePrefix), { recursive: true });
      symlinkSync(outsideCachedPrefix, outsidePrefix, "dir");
      try {
        assert.throws(
          () => nativeDependencyReceiptSource(
            root,
            "m4ri",
            outsidePrefix,
            first.stampName,
            { cacheRoot },
          ),
          /must be strictly inside the workspace/,
        );
      } finally {
        unlinkSync(outsidePrefix);
        rmSync(externalRoot, { force: true, recursive: true });
      }

      const ancestorRoot = mkdtempSync(join(tmpdir(), "sagejs-sea-ancestor-"));
      const ancestorPrefix = join(
        root,
        "ancestor-workspace",
        "packages",
        "m4ri",
        ".native",
        "prefix",
      );
      mkdirSync(dirname(dirname(ancestorPrefix)), { recursive: true });
      symlinkSync(ancestorRoot, dirname(ancestorPrefix), "dir");
      symlinkSync(first.prefix, join(ancestorRoot, "prefix"), "dir");
      try {
        assert.throws(
          () => nativeDependencyReceiptSource(
            root,
            "m4ri",
            ancestorPrefix,
            first.stampName,
            { cacheRoot },
          ),
          /symlinked or non-directory ancestor/,
        );
      } finally {
        rmSync(ancestorRoot, { force: true, recursive: true });
      }

      symlinkSync(first.prefix, installedPrefix, "dir");
      chmodSync(first.stamp, 0o644);
      assert.throws(
        () => nativeDependencyReceiptSource(
          root,
          "m4ri",
          installedPrefix,
          first.stampName,
          { cacheRoot },
        ),
        /cache receipt is not immutable/,
      );
    } finally {
      execFileSync("chmod", ["-R", "u+w", root]);
      rmSync(root, { force: true, recursive: true });
    }
  },
);

test(
  "dependency receipt roots permit only an aliased ancestor",
  { skip: process.platform === "win32" },
  () => {
    const parent = mkdtempSync(
      join(realpathSync.native(tmpdir()), "sagejs-sea-cache-root-alias-"),
    );
    const actualParent = join(parent, "actual");
    const aliasParent = join(parent, "alias");
    const actualRoot = join(actualParent, "workspace");
    const root = join(aliasParent, "workspace");
    mkdirSync(actualRoot, { recursive: true });
    symlinkSync(actualParent, aliasParent, "dir");
    try {
      const cacheRoot = join(root, "native-cache");
      const installedPrefix = join(
        root,
        "packages",
        "m4ri",
        ".native",
        "prefix",
      );
      mkdirSync(dirname(installedPrefix), { recursive: true });
      mkdirSync(cacheRoot);
      const cached = cachedDependencyGeneration(
        root,
        cacheRoot,
        "m4ri",
        "3".repeat(64),
      );
      symlinkSync(cached.prefix, installedPrefix, "dir");
      const source = nativeDependencyReceiptSource(
        root,
        "m4ri",
        installedPrefix,
        cached.stampName,
        { cacheRoot },
      );
      assert.equal(source.prefix, cached.prefix);
      assert.deepEqual(
        validateNativeDependencyReceiptSources({
          m4ri: {
            identitySha256: cached.receipt.identitySha256,
            ...source,
          },
        }),
        { m4ri: cached.receipt.identitySha256 },
      );
    } finally {
      execFileSync("chmod", ["-R", "u+w", actualRoot]);
      rmSync(parent, { force: true, recursive: true });
    }
  },
);

test("one checkout cannot assemble overlapping SEA outputs", () => {
  const root = mkdtempSync(join(tmpdir(), "sagejs-sea-build-lock-"));
  const lock = join(root, ".sea-build.lock");
  try {
    assert.equal(
      withSeaBuildLock(lock, () => {
        assert.equal(existsSync(lock), true);
        assert.throws(
          () => withSeaBuildLock(lock, () => undefined),
          /another SEA build owns/,
        );
        return "built";
      }),
      "built",
    );
    assert.equal(existsSync(lock), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
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

test("mathematics SEA requires target-matched igraph and M4RI dependency receipts", () => {
  const item = fixture();
  try {
    const missing = { ...item.assets };
    delete missing["native/dependencies/igraph-receipt.json"];
    assert.throws(
      () => createSeaBuildManifest(options(item, { assets: missing })),
      /omitted native\/dependencies\/igraph-receipt\.json/,
    );

    const mismatched = JSON.parse(readFileSync(
      item.assets["native/dependencies/m4ri-receipt.json"],
      "utf8",
    ));
    mismatched.mathProfile = profileWith({ effectiveProfile: "cpu-native" });
    const identity = { ...mismatched };
    delete identity.identitySha256;
    mismatched.identitySha256 = sha256(JSON.stringify(stable(identity)));
    writeFileSync(
      item.assets["native/dependencies/m4ri-receipt.json"],
      `${JSON.stringify(mismatched, null, 2)}\n`,
    );
    assert.throws(
      () => createSeaBuildManifest(options(item)),
      /m4ri SEA dependency receipt is invalid/,
    );
  } finally {
    item.cleanup();
  }
});

test("staged dependency receipts remain identical to validated source prefixes", () => {
  const item = fixture();
  try {
    assert.doesNotThrow(() => createSeaBuildManifest(options(item, {
      nativeDependencySources: item.nativeDependencySources,
    })));
    const receiptAsset = item.assets["native/dependencies/m4ri-receipt.json"];
    const replaced = JSON.parse(readFileSync(receiptAsset, "utf8"));
    replaced.build = { substituted: true };
    const identity = { ...replaced };
    delete identity.identitySha256;
    replaced.identitySha256 = sha256(JSON.stringify(stable(identity)));
    writeFileSync(receiptAsset, `${JSON.stringify(replaced, null, 2)}\n`);
    assert.throws(
      () => createSeaBuildManifest(options(item, {
        nativeDependencySources: item.nativeDependencySources,
      })),
      /staged dependency receipt changed after prefix validation/,
    );
  } finally {
    item.cleanup();
  }
});

"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { spawnSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const test = require("node:test");

const {
  BUILD_MANIFEST_ASSET,
  EMBEDDED_ASSET_SCHEMA,
  SCHEMA,
  collectReleaseCapabilities,
  formatReleaseCapabilities,
  nativeBinaryReceiptContract,
} = require("../scripts/release-capabilities.cjs");
const {
  canonicalJson,
  createBuildManifest,
} = require("../scripts/release-manifest.cjs");
const {
  createNativeDependencyReceipt,
} = require("../scripts/native-dependency-receipt.cjs");

const repositoryRoot = resolve(__dirname, "..");
const script = join(repositoryRoot, "scripts", "release-capabilities.cjs");
const commit = "0123456789abcdef0123456789abcdef01234567";
const treeHash = "89abcdef0123456789abcdef0123456789abcdef";
const productionSources = [
  "sagejs/kernels/first.py",
  "sagejs/kernels/second.py",
];

function write(filename, contents = "") {
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, contents);
}

function fixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-release-capabilities-"));
  const root = join(directory, "checkout");
  const home = join(directory, "home", "private-user");
  mkdirSync(root, { recursive: true });
  mkdirSync(home, { recursive: true });
  write(
    join(root, "package.json"),
    `${JSON.stringify({ name: "@sagemath/sagejs", version: "9.8.7" })}\n`,
  );
  write(
    join(root, "architecture", "native-kernels.json"),
    `${JSON.stringify({
      kernels: productionSources.map((source, index) => ({
        id: `fixture-${index}-production`,
        source: `src/lib/${source}`,
      })),
    })}\n`,
  );
  if (options.git !== false) mkdirSync(join(root, ".git"));
  if (options.runtime !== false) {
    write(join(root, "dist", "tools", "kernel.js"));
    write(join(root, "dist", "compiler", "compiler.js"));
  }
  return { directory, home, root };
}

function bytes(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function digestBytes(value) {
  return createHash("sha256").update(bytes(value)).digest("hex");
}

function digest(filename) {
  return digestBytes(readFileSync(filename));
}

function installAdapter(root, packageName, addonName) {
  const directory = join(root, "packages", packageName, "build", "generated-ffi");
  const addon = join(directory, addonName);
  const source = join(root, "packages", packageName, "generated", "ffi_host.py");
  write(addon, "native addon witness");
  write(source, "# generated adapter witness\n");
  write(
    join(directory, "manifest.json"),
    `${JSON.stringify({
      addon: addonName,
      addon_hash: digest(addon),
      schema: "sagejs.ffi/generated-host-adapter-v1",
      source_hash: digest(source),
    })}\n`,
  );
  if (packageName === "flint") {
    write(join(root, "packages", packageName, "build", "Release", "sagejs_flint.node"));
  }
  if (packageName === "graph") {
    write(join(root, "packages", packageName, "build", "Release", "sagejs_graph.node"));
  }
}

function kernelIndex() {
  const logicalSources = {};
  for (const [index, source] of productionSources.entries()) {
    logicalSources[source] = {
      cacheKey: String(index + 1).repeat(64),
      foreignDeclarations: [],
      nativeAbi: 21,
      sourceHash: String(index + 3).repeat(64),
    };
  }
  return { logicalSources, schema: "sagejs.native-cache/v3", sources: {} };
}

function installNativeKernels(root, complete = true) {
  const index = kernelIndex();
  write(
    join(root, "dist", "native-kernels", "index.json"),
    `${JSON.stringify(index)}\n`,
  );
  for (const [recordIndex, record] of Object.values(index.logicalSources).entries()) {
    write(join(root, "dist", "native-kernels", record.cacheKey, "index.cjs"));
    if (complete || recordIndex !== 1) {
      write(
        join(
          root,
          "dist",
          "native-kernels",
          record.cacheKey,
          "build",
          "Release",
          "sagejs_native_kernel.node",
        ),
      );
    }
  }
  return index;
}

function mathProfile(profile = "portable") {
  const identity = {
    abi: {
      arch: "x64",
      endianness: "LE",
      platform: "linux",
      wordBits: 64,
    },
    effectiveProfile: profile,
    requestedProfile: profile,
    schema: "sagejs.native-math-profile-v1",
  };
  return {
    ...identity,
    fingerprint: digestBytes(canonicalJson(identity)),
  };
}

function installMathProfile(root, profile = "portable") {
  const prefix = join(root, "packages", "flint", ".native", "prefix");
  write(
    join(prefix, ".sagejs-flint-dependencies.json"),
    `${JSON.stringify({
      build: {
        mathBuildProfile: mathProfile(profile),
      },
    })}\n`,
  );
}

function buildManifest(overrides = {}) {
  return createBuildManifest({
    capabilities: {},
    sagejsVersion: "9.8.7",
    source: {
      commit,
      contentSha256: "a".repeat(64),
      dirty: false,
      kind: "git-clean",
      tree: treeHash,
    },
    target: {
      arch: "x64",
      endianness: "LE",
      libc: { family: "glibc", version: "2.39" },
      nodeAbi: "127",
      nodeNapi: "10",
      platform: "linux",
      wordBits: 64,
    },
    toolchain: {
      compiler: { id: "clang", version: "20.1.0" },
      nativeMathProfile: mathProfile(),
      node: "v22.22.2",
    },
    ...overrides,
  });
}

function embedAdapter(assets, id) {
  const definitions = {
    flint: {
      addon: "sagejs_flint_ffi.node",
      manifest: "native/sagejs_flint_ffi_manifest.json",
      required: "native/sagejs_flint.node",
    },
    fflas: {
      addon: "sagejs_fflas_ffi.node",
      manifest: "native/sagejs_fflas_ffi_manifest.json",
    },
    igraph: {
      addon: "sagejs_igraph_ffi.node",
      manifest: "native/sagejs_igraph_ffi_manifest.json",
      required: "native/sagejs_graph.node",
    },
    m4ri: {
      addon: "sagejs_m4ri_ffi.node",
      manifest: "native/sagejs_m4ri_ffi_manifest.json",
    },
  };
  const definition = definitions[id];
  const addonAsset = `native/${definition.addon}`;
  const addon = Buffer.from(`${id} embedded addon`);
  assets[addonAsset] = addon;
  assets[definition.manifest] = JSON.stringify({
    addon: definition.addon,
    addon_hash: digestBytes(addon),
    schema: "sagejs.ffi/generated-host-adapter-v1",
  });
  if (definition.required) assets[definition.required] = `${id} base addon`;
}

function embedNativeDependencyReceipts(assets, target, profile = mathProfile()) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-sea-dependency-"));
  const bindings = {};
  try {
    for (const id of ["igraph", "m4ri"]) {
      const prefix = join(directory, id);
      const stamp = join(prefix, `.sagejs-${id}.json`);
      write(join(prefix, "lib", `lib${id}.a`), `${id} archive`);
      const receipt = createNativeDependencyReceipt(
        {
          build: { configuration: "fixture" },
          dependency: {
            name: id,
            sha256: id === "igraph" ? "a".repeat(64) : "b".repeat(64),
            version: "1.0",
          },
          deployment: null,
          interface: null,
          mathProfile: profile,
          package: id,
          toolchain: { compiler: "fixture" },
        },
        prefix,
        stamp,
      );
      const receiptAsset = `native/dependencies/${id}-receipt.json`;
      assets[receiptAsset] = JSON.stringify(receipt);
      bindings[id] = {
        assets: id === "igraph"
          ? [
              "native/sagejs_graph.node",
              "native/sagejs_igraph_ffi.node",
              "native/sagejs_igraph_ffi_manifest.json",
            ]
          : [
              "native/sagejs_m4ri_ffi.node",
              "native/sagejs_m4ri_ffi_manifest.json",
            ],
        package: id,
        receiptAsset,
        receiptIdentitySha256: receipt.identitySha256,
      };
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return {
    bindings,
    schema: "sagejs.sea-native-dependency-bindings-v1",
  };
}

function addKernelAssets(assets, index) {
  assets["native-kernels/index.json"] = JSON.stringify(index);
  for (const record of Object.values(index.logicalSources)) {
    assets[`native-kernels/${record.cacheKey}/index.cjs`] = "wrapper";
    assets[
      `native-kernels/${record.cacheKey}/build/Release/` +
        "sagejs_native_kernel.node"
    ] = "addon";
  }
}

function embeddedAssetDeclaration(assets) {
  return {
    assets: Object.fromEntries(
      Object.entries(assets)
        .filter(([name]) => name !== BUILD_MANIFEST_ASSET)
        .map(([name, value]) => [
          name,
          { sha256: digestBytes(value), size: bytes(value).length },
        ]),
    ),
    schema: EMBEDDED_ASSET_SCHEMA,
  };
}

function nativeBinaryReceipt(assets, target) {
  const format = { darwin: "macho", linux: "elf", win32: "pe" }[
    target.platform
  ];
  const entries = [
    {
      bytes: Buffer.from("fixture node template"),
      label: "sea/node-template",
      role: "executable-template",
    },
    ...Object.entries(assets)
      .filter(([name]) => name.endsWith(".node"))
      .map(([label, value]) => ({
        bytes: bytes(value),
        label,
        role: "embedded-node-addon",
      })),
  ].sort((left, right) => left.label.localeCompare(right.label));
  const files = entries.map((entry) => {
    const common = {
      dependencies: target.platform === "linux" ? ["libc.so.6"] : [],
      format,
      label: entry.label,
      role: entry.role,
      sha256: digestBytes(entry.bytes),
      size: entry.bytes.length,
      wordSize: 64,
    };
    if (format === "elf") {
      return {
        ...common,
        architecture: target.arch,
        endianness: "little",
        glibcVersions: [target.libc.version],
        interpreter: entry.label === "sea/node-template"
          ? "/lib64/ld-linux-x86-64.so.2"
          : null,
        machine: target.arch === "arm64" ? 183 : 62,
        maximumGlibc: target.libc.version,
        osAbi: 0,
        requiredSymbolVersions: [`GLIBC_${target.libc.version}`],
        rpaths: [],
        symbolVersionFamilies: {
          GLIBC: {
            maximum: target.libc.version,
            versions: [target.libc.version],
          },
        },
      };
    }
    if (format === "macho") {
      return {
        ...common,
        architectures: [target.arch],
        maximumMinimumMacos: "13.5.0",
        rpaths: [],
        universal: false,
        slices: [{
          architecture: target.arch,
          declaredMinimumMacos: ["13.5.0"],
          dependencies: [],
          endianness: "little",
          machine: 0x0100000c,
          minimumMacos: "13.5.0",
          rpaths: [],
          wordSize: 64,
        }],
      };
    }
    return {
      ...common,
      architecture: target.arch,
      delayDependencies: [],
      machine: 0x8664,
      subsystem: 3,
    };
  });
  const aggregate = {
    architectures: [target.arch],
    dependencies: target.platform === "linux" ? ["libc.so.6"] : [],
    formats: [format],
    maximumGlibc: target.platform === "linux" ? target.libc.version : null,
    maximumMinimumMacos: target.platform === "darwin" ? "13.5.0" : null,
    maximumSymbolVersions: target.platform === "linux"
      ? { GLIBC: target.libc.version }
      : {},
  };
  const report = {
    aggregate,
    files,
    inputSetSha256: digestBytes(JSON.stringify(files.map(
      ({ label, role, sha256, size }) => ({ label, role, sha256, size }),
    ))),
    ok: true,
    policy: {
      architectures: [target.arch],
      exactArchitectures: true,
      format,
      requiredLabels: files.map(({ label }) => label),
    },
    schema: "sagejs.native-binary-inspection-v1",
    violations: [],
  };
  return {
    nodeTemplateSha256: files.find(
      ({ label }) => label === "sea/node-template",
    ).sha256,
    receipt: {
      report,
      reportSha256: digestBytes(canonicalJson(report)),
      schema: "sagejs.native-binary-receipt/v1",
    },
  };
}

function refreshNativeBinaryReceipt(receipt) {
  const files = [...receipt.report.files].sort((left, right) =>
    left.label.localeCompare(right.label));
  receipt.report.files = files;
  receipt.report.inputSetSha256 = digestBytes(JSON.stringify(files.map(
    ({ label, role, sha256, size }) => ({ label, role, sha256, size }),
  )));
  receipt.reportSha256 = digestBytes(canonicalJson(receipt.report));
}

function embedBuildManifest(assets, index, overrides = {}) {
  const nativeKernels = {
    authorityPath: "architecture/native-kernels.json",
    authoritySha256: "a".repeat(64),
    expected: Object.keys(index.logicalSources).length,
    indexIdentitySha256: digestBytes(canonicalJson(index)),
    indexPath: "native-kernels/index.json",
    indexSha256: digestBytes(assets["native-kernels/index.json"]),
    logicalSources: Object.keys(index.logicalSources).sort(),
    schema: "sagejs.native-kernel-receipt/v1",
    ...overrides.nativeKernels,
  };
  const target = overrides.manifest?.target || buildManifest().target;
  const profile = overrides.manifest?.toolchain?.nativeMathProfile || mathProfile();
  const nativeDependencies = overrides.nativeDependencies ||
    embedNativeDependencyReceipts(assets, target, profile);
  const nativeBinaries = nativeBinaryReceipt(assets, target);
  overrides.mutateNativeBinaries?.(nativeBinaries.receipt);
  const manifestToolchain = {
    compiler: { id: "clang", version: "20.1.0" },
    nativeMathProfile: profile,
    node: "v22.22.2",
    ...(overrides.manifest?.toolchain || {}),
    nativeBinaries: nativeBinaries.receipt,
    seaNode: {
      executableSha256: nativeBinaries.nodeTemplateSha256,
      version: "22.22.2",
    },
  };
  const manifest = buildManifest({
    capabilities: {
      artifact: {
        kind: "single-executable",
        nativeMathematics: true,
      },
      embeddedAssets: embeddedAssetDeclaration(assets),
      nativeDependencies,
      nativeKernels,
      ...overrides.capabilities,
    },
    ...overrides.manifest,
    toolchain: manifestToolchain,
  });
  assets[BUILD_MANIFEST_ASSET] = JSON.stringify(manifest);
  return manifest;
}

function fixedOptions(item, overrides = {}) {
  return {
    arch: "x64",
    environment: {},
    git: {
      commit,
      commonDirectory: join(item.root, ".git"),
      dirty: false,
      present: true,
    },
    home: item.home,
    hostRelease: "test-release",
    libc: "glibc",
    platform: "linux",
    root: item.root,
    versions: { modules: "127", napi: "10", node: "22.22.2" },
    ...overrides,
  };
}

function capability(report, id) {
  return report.capabilities.find((entry) => entry.id === id);
}

function tree(directory, prefix = "") {
  const result = [];
  for (const name of readdirSync(directory).sort()) {
    const filename = join(directory, name);
    const logical = prefix ? `${prefix}/${name}` : name;
    const type = statSync(filename);
    result.push(`${type.isDirectory() ? "d" : "f"}:${logical}`);
    if (type.isDirectory()) result.push(...tree(filename, logical));
  }
  return result;
}

test("source report describes candidates and declared fallbacks conservatively", () => {
  const item = fixture();
  try {
    installAdapter(item.root, "flint", "sagejs_flint_ffi.node");
    installAdapter(item.root, "fflas", "sagejs_fflas_ffi.node");
    installAdapter(item.root, "graph", "sagejs_igraph_ffi.node");
    installAdapter(item.root, "m4ri", "sagejs_m4ri_ffi.node");
    installNativeKernels(item.root);
    installMathProfile(item.root);

    const report = collectReleaseCapabilities(fixedOptions(item));
    assert.equal(report.schema, SCHEMA);
    assert.equal(report.buildReceipt.availability, "unavailable");
    assert.equal(report.runtimeObservation.package.version, "9.8.7");
    for (const id of ["flint", "fflas-ffpack", "igraph", "m4ri"]) {
      const adapter = capability(report, id);
      assert.equal(adapter.candidate, "compiled");
      assert.equal(adapter.manifestIntegrity, "verified");
      assert.equal(adapter.loadability, "not-probed");
      assert.equal(adapter.selection, "not-probed");
      assert.equal(adapter.fallback.declaration, "declared");
      assert.equal(adapter.fallback.availability, "not-probed");
    }
    const kernels = capability(report, "typed-python-native-kernels");
    assert.equal(kernels.candidate, "compiled");
    assert.equal(kernels.integrity, "complete");
    assert.equal(kernels.fallback.declaration, "declared");
    assert.equal(kernels.fallback.availability, "not-probed");
    assert.equal(
      report.nativeMathProfile.compatibility,
      "effective-build-request-match",
    );
    assert.equal(
      report.nativeMathProfile.observedBuild.source,
      "installed-profile-stamp",
    );
    assert.ok(!Object.hasOwn(report.nativeMathProfile, "runtimeSelection"));
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("@native environment policy matches auto, native, dynamic, javascript, and invalid modes", () => {
  const item = fixture();
  try {
    installAdapter(item.root, "flint", "sagejs_flint_ffi.node");
    const disabled = collectReleaseCapabilities(fixedOptions(item, {
      environment: { SAGEJS_NATIVE_DISABLE: "1" },
    }));
    assert.equal(disabled.nativePolicy.addonLoading.effective, "disabled-by-disable");
    assert.equal(disabled.nativePolicy.cacheDiscovery.effective, "enabled");
    assert.equal(capability(disabled, "flint").candidate, "compiled");

    const native = collectReleaseCapabilities(fixedOptions(item, {
      environment: {
        SAGEJS_NATIVE_AUTOLOAD: "0",
        SAGEJS_NATIVE_DISABLE: "1",
        SAGEJS_NATIVE_MODE: "native",
      },
    }));
    assert.equal(native.nativePolicy.addonLoading.effective, "enabled");
    assert.equal(native.nativePolicy.cacheDiscovery.effective, "enabled");
    assert.equal(native.nativePolicy.required.effective, true);
    assert.equal(native.nativePolicy.fallback.effective, "required");

    const dynamic = collectReleaseCapabilities(fixedOptions(item, {
      environment: {
        SAGEJS_NATIVE_MODE: "dynamic",
        SAGEJS_NATIVE_WARN_FALLBACK: "1",
      },
    }));
    assert.equal(dynamic.nativePolicy.cacheDiscovery.effective, "disabled-by-mode");
    assert.equal(dynamic.nativePolicy.addonLoading.effective, "disabled-by-mode");
    assert.equal(dynamic.nativePolicy.fallback.effective, "warn");

    const javascript = collectReleaseCapabilities(fixedOptions(item, {
      environment: { SAGEJS_NATIVE_MODE: "javascript" },
    }));
    assert.equal(javascript.nativePolicy.cacheDiscovery.effective, "enabled");
    assert.equal(javascript.nativePolicy.addonLoading.effective, "disabled-by-mode");

    const invalid = collectReleaseCapabilities(fixedOptions(item, {
      environment: { SAGEJS_NATIVE_MODE: "surprise" },
    }));
    assert.equal(invalid.nativePolicy.mode.valid, false);
    assert.equal(invalid.nativePolicy.cacheDiscovery.effective, "invalid");
    assert.equal(invalid.nativePolicy.addonLoading.effective, "invalid");
    assert.equal(invalid.nativePolicy.required.effective, "invalid");
    assert.equal(invalid.nativePolicy.fallback.effective, "invalid");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("SAGEJS_NATIVE_MATH_PROFILE is reported only as a build request", () => {
  const item = fixture();
  try {
    const report = collectReleaseCapabilities(fixedOptions(item, {
      environment: { SAGEJS_NATIVE_MATH_PROFILE: "cpu-native" },
    }));
    assert.equal(report.nativeMathProfile.buildRequest.requested, "cpu-native");
    assert.equal(report.nativeMathProfile.buildRequest.effective, "cpu-native");
    assert.equal(report.nativeMathProfile.buildRequest.buildProbe, "not-run");
    assert.ok(!JSON.stringify(report.nativeMathProfile).includes("runtimeSelection"));
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("missing or incomplete production kernels make no fallback availability claim", () => {
  const item = fixture();
  try {
    const missing = capability(
      collectReleaseCapabilities(fixedOptions(item)),
      "typed-python-native-kernels",
    );
    assert.equal(missing.candidate, "unavailable");
    assert.equal(missing.integrity, "not-installed");
    assert.deepEqual(missing.fallback.availability, "not-probed");
    assert.ok(!JSON.stringify(missing).includes("compile-on-first-use"));

    installNativeKernels(item.root, false);
    const incomplete = capability(
      collectReleaseCapabilities(fixedOptions(item)),
      "typed-python-native-kernels",
    );
    assert.equal(incomplete.candidate, "unavailable");
    assert.equal(incomplete.integrity, "incomplete");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("adapter hash mismatch fails candidate validation without loading it", () => {
  const item = fixture();
  try {
    installAdapter(item.root, "flint", "sagejs_flint_ffi.node");
    write(
      join(
        item.root,
        "packages",
        "flint",
        "build",
        "generated-ffi",
        "sagejs_flint_ffi.node",
      ),
      "tampered addon",
    );
    const flint = capability(collectReleaseCapabilities(fixedOptions(item)), "flint");
    assert.equal(flint.candidate, "unavailable");
    assert.equal(flint.manifestIntegrity, "mismatch");
    assert.equal(flint.loadability, "not-probed");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("SEA identity, FFI, and native kernels require canonical receipts for exact bytes", () => {
  const item = fixture({ git: false, runtime: false });
  try {
    installMathProfile(item.root, "cpu-native");
    const index = kernelIndex();
    const embeddedAssets = { "compiler/compiler.js": "compiler" };
    embedAdapter(embeddedAssets, "flint");
    embedAdapter(embeddedAssets, "fflas");
    embedAdapter(embeddedAssets, "igraph");
    embedAdapter(embeddedAssets, "m4ri");
    addKernelAssets(embeddedAssets, index);
    const embeddedManifest = embedBuildManifest(embeddedAssets, index);
    assert.equal(nativeBinaryReceiptContract(embeddedManifest, {
      assets: new Set(Object.keys(embeddedAssets)),
      bytes: (name) => Object.hasOwn(embeddedAssets, name)
        ? bytes(embeddedAssets[name])
        : null,
    }), true);

    // A contradictory nearby architecture declaration is not SEA authority.
    write(
      join(item.root, "architecture", "native-kernels.json"),
      JSON.stringify({ kernels: [{ id: "wrong-production", source: "src/lib/wrong.py" }] }),
    );
    const report = collectReleaseCapabilities(fixedOptions(item, {
      artifactKind: "single-executable",
      embeddedAssets,
      git: { commit: null, dirty: null, present: false },
    }));
    assert.equal(report.buildReceipt.availability, "available");
    assert.equal(report.buildReceipt.manifest.sagejsVersion, "9.8.7");
    assert.equal(report.buildReceipt.manifest.source.commit, commit);
    assert.equal(
      report.buildReceipt.manifest.toolchain.nativeMathProfile.fingerprint,
      mathProfile().fingerprint,
    );
    assert.equal(report.nativeMathProfile.observedBuild.source, "build-manifest");
    assert.equal(report.nativeMathProfile.installedPrefix, null);
    assert.equal(capability(report, "flint").candidate, "bundled");
    assert.equal(capability(report, "typed-python-native-kernels").candidate, "bundled");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("SEA base addons, wrappers, and kernel addons fail closed after byte tampering", () => {
  const targets = [
    "native/sagejs_flint.node",
    `native-kernels/${"1".repeat(64)}/index.cjs`,
    `native-kernels/${"2".repeat(64)}/build/Release/sagejs_native_kernel.node`,
  ];
  for (const target of targets) {
    const item = fixture({ git: false, runtime: false });
    try {
      const index = kernelIndex();
      const embeddedAssets = { "compiler/compiler.js": "compiler" };
      embedAdapter(embeddedAssets, "flint");
      addKernelAssets(embeddedAssets, index);
      embedBuildManifest(embeddedAssets, index);
      embeddedAssets[target] = "tampered after receipt";
      const report = collectReleaseCapabilities(fixedOptions(item, {
        embeddedAssets,
        git: { commit: null, dirty: null, present: false },
      }));
      if (target === "native/sagejs_flint.node") {
        assert.equal(capability(report, "flint").candidate, "unavailable");
        assert.equal(
          capability(report, "flint").manifestIntegrity,
          "embedded-receipt-mismatch",
        );
      } else {
        assert.equal(
          capability(report, "typed-python-native-kernels").candidate,
          "unavailable",
        );
        assert.equal(
          capability(report, "typed-python-native-kernels").integrity,
          "incomplete",
        );
      }
    } finally {
      rmSync(item.directory, { recursive: true, force: true });
    }
  }
});

test("SEA native-kernel declaration and embedded asset receipt are both required", () => {
  const item = fixture({ git: false, runtime: false });
  try {
    const index = kernelIndex();
    const embeddedAssets = { "compiler/compiler.js": "compiler" };
    addKernelAssets(embeddedAssets, index);
    embedBuildManifest(embeddedAssets, index, {
      nativeKernels: { logicalSources: [productionSources[0]] },
    });
    const mismatch = capability(
      collectReleaseCapabilities(fixedOptions(item, {
        embeddedAssets,
        git: { commit: null, dirty: null, present: false },
      })),
      "typed-python-native-kernels",
    );
    assert.equal(mismatch.candidate, "unavailable");

    const noReceiptAssets = {
      "native-kernels/index.json": JSON.stringify(index),
    };
    noReceiptAssets[BUILD_MANIFEST_ASSET] = JSON.stringify(buildManifest({
      capabilities: {
        nativeKernels: {
          expected: 2,
          indexIdentitySha256: digestBytes(canonicalJson(index)),
          logicalSources: productionSources,
        },
      },
    }));
    const noReceipt = capability(
      collectReleaseCapabilities(fixedOptions(item, {
        embeddedAssets: noReceiptAssets,
        git: { commit: null, dirty: null, present: false },
      })),
      "typed-python-native-kernels",
    );
    assert.equal(noReceipt.candidate, "unavailable");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("invalid build manifests expose no arbitrary identity data", () => {
  const item = fixture({ git: false, runtime: false });
  try {
    const tampered = buildManifest();
    tampered.sagejsVersion = "attacker-controlled";
    for (const buildManifestValue of [
      tampered,
      { commit, schema: "sagejs.release-build-manifest-v1", version: "legacy" },
    ]) {
      const report = collectReleaseCapabilities(fixedOptions(item, {
        buildManifest: buildManifestValue,
        git: { commit: null, dirty: null, present: false },
      }));
      assert.equal(report.buildReceipt.availability, "unavailable");
      assert.ok(!Object.hasOwn(report.buildReceipt, "manifest"));
      assert.ok(!JSON.stringify(report.buildReceipt).includes("attacker-controlled"));
    }
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("SEA observations never borrow capabilities from a neighboring checkout", () => {
  const item = fixture();
  try {
    installAdapter(item.root, "flint", "sagejs_flint_ffi.node");
    installNativeKernels(item.root);
    const report = collectReleaseCapabilities(fixedOptions(item, {
      artifactKind: "single-executable",
      embeddedAssets: {},
    }));
    assert.equal(capability(report, "python-sage-compiler").candidate, "unavailable");
    assert.equal(capability(report, "flint").candidate, "unavailable");
    assert.equal(
      capability(report, "typed-python-native-kernels").candidate,
      "unavailable",
    );
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("SEA receipt contract, target, compiler bytes, and source names fail closed", () => {
  const cases = [
    (assets, index) => {
      embedBuildManifest(assets, index, {
        capabilities: {
          artifact: { kind: "single-executable", nativeMathematics: false },
          nativeKernels: null,
        },
        manifest: { toolchain: { nativeMathProfile: null } },
      });
    },
    (assets, index) => {
      embedBuildManifest(assets, index);
      assets["compiler/compiler.js"] = "tampered compiler";
    },
    (assets, index) => {
      embedBuildManifest(assets, index, {
        manifest: {
          target: {
            arch: "arm64",
            endianness: "LE",
            libc: null,
            nodeAbi: "127",
            nodeNapi: "10",
            platform: "darwin",
            wordBits: 64,
          },
        },
      });
    },
  ];
  for (const mutate of cases) {
    const item = fixture({ git: false, runtime: false });
    try {
      const index = kernelIndex();
      const assets = { "compiler/compiler.js": "compiler" };
      for (const id of ["flint", "fflas", "igraph", "m4ri"]) {
        embedAdapter(assets, id);
      }
      addKernelAssets(assets, index);
      mutate(assets, index);
      const report = collectReleaseCapabilities(fixedOptions(item, {
        artifactKind: "single-executable",
        embeddedAssets: assets,
      }));
      assert.equal(report.buildReceipt.availability, "unavailable");
      assert.equal(capability(report, "python-sage-compiler").candidate, "unavailable");
      assert.equal(capability(report, "flint").candidate, "unavailable");
    } finally {
      rmSync(item.directory, { recursive: true, force: true });
    }
  }

  const item = fixture({ git: false, runtime: false });
  try {
    const index = kernelIndex();
    index.logicalSources["../evil.py"] = index.logicalSources[productionSources[0]];
    delete index.logicalSources[productionSources[0]];
    const assets = { "compiler/compiler.js": "compiler" };
    for (const id of ["flint", "fflas", "igraph", "m4ri"]) embedAdapter(assets, id);
    addKernelAssets(assets, index);
    embedBuildManifest(assets, index);
    const report = collectReleaseCapabilities(fixedOptions(item, {
      embeddedAssets: assets,
    }));
    assert.equal(report.buildReceipt.availability, "unavailable");
    assert.equal(capability(report, "typed-python-native-kernels").candidate, "unavailable");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("SEA native binary evidence rejects omitted, extra, tampered, and wrong-target reports", () => {
  const mutations = [
    (receipt) => {
      receipt.report.files = receipt.report.files.filter(
        ({ label }) => label !== "native/sagejs_flint_ffi.node",
      );
      receipt.report.policy.requiredLabels =
        receipt.report.policy.requiredLabels.filter(
          (label) => label !== "native/sagejs_flint_ffi.node",
        );
      refreshNativeBinaryReceipt(receipt);
    },
    (receipt) => {
      const extra = structuredClone(receipt.report.files.find(
        ({ label }) => label !== "sea/node-template",
      ));
      extra.label = "native/unaccounted.node";
      receipt.report.files.push(extra);
      receipt.report.policy.requiredLabels.push(extra.label);
      receipt.report.policy.requiredLabels.sort((left, right) =>
        left.localeCompare(right));
      refreshNativeBinaryReceipt(receipt);
    },
    (receipt) => {
      receipt.report.files[0].dependencies.push("libtampered.so");
      // Deliberately retain the original report hash.
    },
    (receipt) => {
      receipt.report.policy.architectures = ["arm64"];
      receipt.report.aggregate.architectures = ["arm64"];
      for (const file of receipt.report.files) file.architecture = "arm64";
      refreshNativeBinaryReceipt(receipt);
    },
  ];
  for (const mutateNativeBinaries of mutations) {
    const item = fixture({ git: false, runtime: false });
    try {
      const index = kernelIndex();
      const assets = { "compiler/compiler.js": "compiler" };
      for (const id of ["flint", "fflas", "igraph", "m4ri"]) {
        embedAdapter(assets, id);
      }
      addKernelAssets(assets, index);
      embedBuildManifest(assets, index, { mutateNativeBinaries });
      const report = collectReleaseCapabilities(fixedOptions(item, {
        artifactKind: "single-executable",
        embeddedAssets: assets,
        git: { commit: null, dirty: null, present: false },
      }));
      assert.equal(report.buildReceipt.availability, "unavailable");
      assert.equal(capability(report, "flint").candidate, "unavailable");
    } finally {
      rmSync(item.directory, { recursive: true, force: true });
    }
  }
});

test("SEA dependency bindings reject receipt tampering, omission, and profile drift", () => {
  const cases = [
    (assets, target) => {
      const declaration = embedNativeDependencyReceipts(assets, target);
      const asset = "native/dependencies/m4ri-receipt.json";
      const receipt = JSON.parse(assets[asset]);
      receipt.build.configuration = "tampered";
      assets[asset] = JSON.stringify(receipt);
      return declaration;
    },
    (assets, target) => {
      const declaration = embedNativeDependencyReceipts(assets, target);
      delete declaration.bindings.igraph;
      return declaration;
    },
    (assets, target) => {
      const declaration = embedNativeDependencyReceipts(assets, target);
      delete assets["native/dependencies/igraph-receipt.json"];
      return declaration;
    },
    (assets, target) => embedNativeDependencyReceipts(
      assets,
      target,
      mathProfile("cpu-native"),
    ),
  ];
  for (const dependencyMutation of cases) {
    const item = fixture({ git: false, runtime: false });
    try {
      const index = kernelIndex();
      const assets = { "compiler/compiler.js": "compiler" };
      for (const id of ["flint", "fflas", "igraph", "m4ri"]) {
        embedAdapter(assets, id);
      }
      addKernelAssets(assets, index);
      const target = buildManifest().target;
      const nativeDependencies = dependencyMutation(assets, target);
      embedBuildManifest(assets, index, { nativeDependencies });
      const report = collectReleaseCapabilities(fixedOptions(item, {
        artifactKind: "single-executable",
        embeddedAssets: assets,
        git: { commit: null, dirty: null, present: false },
      }));
      assert.equal(report.buildReceipt.availability, "unavailable");
      assert.equal(capability(report, "igraph").candidate, "unavailable");
      assert.equal(capability(report, "m4ri").candidate, "unavailable");
    } finally {
      rmSync(item.directory, { recursive: true, force: true });
    }
  }
});

test("forged installed and embedded mathematics profiles are ignored", () => {
  const item = fixture();
  try {
    installMathProfile(item.root);
    const stamp = join(
      item.root,
      "packages",
      "flint",
      ".native",
      "prefix",
      ".sagejs-flint-dependencies.json",
    );
    const forged = mathProfile();
    forged.effectiveProfile = "cpu-native";
    write(stamp, JSON.stringify({ build: { mathBuildProfile: forged } }));
    const source = collectReleaseCapabilities(fixedOptions(item));
    assert.equal(source.nativeMathProfile.observedBuild, null);
    assert.equal(source.nativeMathProfile.compatibility, "not-observed");

    const manifest = buildManifest({
      toolchain: { nativeMathProfile: forged },
    });
    const embedded = collectReleaseCapabilities(fixedOptions(item, {
      buildManifest: manifest,
      embeddedAssets: {},
    }));
    assert.equal(embedded.nativeMathProfile.observedBuild, null);

    const wrongAbiIdentity = {
      ...mathProfile(),
      abi: {
        arch: "arm64",
        endianness: "LE",
        platform: "darwin",
        wordBits: 64,
      },
    };
    delete wrongAbiIdentity.fingerprint;
    const wrongAbi = {
      ...wrongAbiIdentity,
      fingerprint: digestBytes(canonicalJson(wrongAbiIdentity)),
    };
    write(stamp, JSON.stringify({ build: { mathBuildProfile: wrongAbi } }));
    const wrongInstalled = collectReleaseCapabilities(fixedOptions(item));
    assert.equal(wrongInstalled.nativeMathProfile.observedBuild, null);

    const wrongEmbedded = collectReleaseCapabilities(fixedOptions(item, {
      buildManifest: buildManifest({
        toolchain: { nativeMathProfile: wrongAbi },
      }),
      embeddedAssets: {},
    }));
    assert.equal(wrongEmbedded.nativeMathProfile.observedBuild, null);
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("an explicit canonical build manifest supplies package artifact identity", () => {
  const item = fixture({ git: false });
  try {
    const report = collectReleaseCapabilities(fixedOptions(item, {
      artifactKind: "npm-package",
      buildManifest: buildManifest(),
      git: { commit: null, dirty: null, present: false },
    }));
    assert.equal(report.buildReceipt.availability, "available");
    assert.equal(report.buildReceipt.source, "explicit");
    assert.equal(report.buildReceipt.manifest.sagejsVersion, "9.8.7");
    assert.equal(report.buildReceipt.manifest.source.commit, commit);
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("Windows M4RI is unavailable independently of @native policy", () => {
  const item = fixture();
  try {
    installAdapter(item.root, "m4ri", "sagejs_m4ri_ffi.node");
    const report = collectReleaseCapabilities(fixedOptions(item, {
      environment: { SAGEJS_NATIVE_DISABLE: "1" },
      libc: "msvc",
      platform: "win32",
    }));
    const m4ri = capability(report, "m4ri");
    assert.equal(m4ri.candidate, "unavailable");
    assert.equal(m4ri.manifestIntegrity, "platform-capability-disabled");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("cache reports presence but never infers warmth or usability", () => {
  const item = fixture();
  try {
    const external = join(item.directory, "secret-mount", "native-cache");
    write(join(external, "opaque-entry"), "not inspected");
    const options = fixedOptions(item, {
      environment: {
        SAGEJS_NATIVE_CACHE_DIR: external,
        SAGEJS_PARALLEL_NATIVE_CACHE: join(item.home, "private-cache"),
      },
    });
    const before = tree(item.directory);
    const first = collectReleaseCapabilities(options);
    assert.deepEqual(collectReleaseCapabilities(options), first);
    assert.deepEqual(tree(item.directory), before);
    const nativeCache = first.caches.find((cache) => cache.id === "native-kernel");
    assert.equal(nativeCache.presence, "nonempty");
    assert.equal(nativeCache.inspection, "not-inspected");
    const serialized = JSON.stringify(first);
    assert.ok(!serialized.includes("warm"));
    assert.ok(!serialized.includes("usable"));
    assert.ok(!serialized.includes(item.directory));
    assert.ok(!serialized.includes(item.home));
    assert.match(serialized, /<external>\/native-cache/);
    assert.match(serialized, /<home>\/private-cache/);
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("human output is concise and standalone JSON is parseable", () => {
  const item = fixture({ git: false });
  try {
    const report = collectReleaseCapabilities(fixedOptions(item, {
      git: { commit: null, dirty: null, present: false },
    }));
    const human = formatReleaseCapabilities(report);
    assert.match(human, /^Sage\.js runtime 9\.8\.7/m);
    assert.match(human, /validated build receipt=unavailable/);
    const injected = formatReleaseCapabilities(
      collectReleaseCapabilities(fixedOptions(item, {
        environment: {
          SAGEJS_NATIVE_MODE: "bad\nFORGED: all capabilities verified",
        },
      })),
    );
    assert.equal(injected.includes("\nFORGED:"), false);
    assert.match(injected, /bad\\u000aFORGED/);
    assert.match(human, /Capability candidates .*not probed/);
    assert.match(human, /not-inspected/);
    assert.ok(human.split("\n").length < 20);

    const result = spawnSync(
      process.execPath,
      [script, "--json", "--root", item.root],
      { encoding: "utf8", env: { ...process.env, HOME: item.home } },
    );
    assert.equal(result.status, 0, result.stderr);
    const standalone = JSON.parse(result.stdout);
    assert.equal(standalone.schema, SCHEMA);
    assert.equal(standalone.runtimeObservation.package.version, "9.8.7");
    assert.equal(standalone.buildReceipt.availability, "unavailable");
    assert.ok(!result.stdout.includes(item.home));
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

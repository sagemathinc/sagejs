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
  BUILD_MANIFEST_SCHEMA,
  SCHEMA,
  collectReleaseCapabilities,
  formatReleaseCapabilities,
} = require("../scripts/release-capabilities.cjs");

const repositoryRoot = resolve(__dirname, "..");
const script = join(repositoryRoot, "scripts", "release-capabilities.cjs");
const commit = "0123456789abcdef0123456789abcdef01234567";
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

function digest(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
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

function installMathProfile(root, profile = "portable") {
  const prefix = join(root, "packages", "flint", ".native", "prefix");
  write(
    join(prefix, ".sagejs-flint-dependencies.json"),
    `${JSON.stringify({
      build: {
        mathBuildProfile: {
          effectiveProfile: profile,
          fingerprint: `${profile}-fingerprint`,
          requestedProfile: profile,
        },
      },
    })}\n`,
  );
}

function buildManifest(overrides = {}) {
  return {
    commit,
    nativeMathProfile: {
      effective: "portable",
      fingerprint: "release-profile-fingerprint",
      requested: "portable",
    },
    schema: BUILD_MANIFEST_SCHEMA,
    target: { arch: "x64", platform: "linux" },
    version: "9.8.7",
    ...overrides,
  };
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
  };
  const definition = definitions[id];
  const addonAsset = `native/${definition.addon}`;
  const addon = Buffer.from(`${id} embedded addon`);
  assets[addonAsset] = addon;
  assets[definition.manifest] = JSON.stringify({
    addon: definition.addon,
    addon_hash: createHash("sha256").update(addon).digest("hex"),
    schema: "sagejs.ffi/generated-host-adapter-v1",
  });
  if (definition.required) assets[definition.required] = `${id} base addon`;
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

test("source report describes FFI candidates without claiming loadability or selection", () => {
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
    assert.deepEqual(report.observation, {
      claim: "stable-runtime-observation",
      observational: true,
    });
    assert.equal(report.artifactIdentity.availability, "unavailable");
    assert.equal(report.runtimeObservation.package.version, "9.8.7");
    assert.equal(report.runtimeObservation.checkout.commit, commit);
    for (const id of ["flint", "fflas-ffpack", "igraph", "m4ri"]) {
      const adapter = capability(report, id);
      assert.equal(adapter.candidate, "compiled");
      assert.equal(adapter.manifestIntegrity, "verified");
      assert.equal(adapter.loadability, "not-probed");
      assert.equal(adapter.selection, "not-probed");
    }
    assert.equal(
      capability(report, "python-sage-compiler").loadability,
      "not-probed",
    );
    const kernels = capability(report, "typed-python-native-kernels");
    assert.equal(kernels.candidate, "compiled");
    assert.equal(kernels.integrity, "complete");
    assert.equal(kernels.loadability, "not-probed");
    assert.equal(kernels.selection, "not-probed");
    assert.equal(report.nativeMathProfile.compatibility, "effective-profile-match");
    assert.equal(report.nativeMathProfile.observedBuild.source, "installed-prefix");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("SAGEJS_NATIVE_DISABLE changes @native policy but never FFI candidate status", () => {
  const item = fixture();
  try {
    installAdapter(item.root, "flint", "sagejs_flint_ffi.node");
    const baseline = collectReleaseCapabilities(fixedOptions(item));
    const disabled = collectReleaseCapabilities(fixedOptions(item, {
      environment: { SAGEJS_NATIVE_DISABLE: "1" },
    }));
    assert.equal(capability(baseline, "flint").candidate, "compiled");
    assert.deepEqual(capability(disabled, "flint"), capability(baseline, "flint"));
    assert.equal(disabled.nativePolicy.disable.requested, true);
    assert.equal(disabled.nativePolicy.disable.effective, true);
    assert.match(disabled.nativePolicy.disable.scope, /not generated FFI/);

    const explicitNative = collectReleaseCapabilities(fixedOptions(item, {
      environment: {
        SAGEJS_NATIVE_AUTOLOAD: "0",
        SAGEJS_NATIVE_DISABLE: "1",
        SAGEJS_NATIVE_MODE: "native",
        SAGEJS_NATIVE_REQUIRED: "0",
        SAGEJS_NATIVE_WARN_FALLBACK: "1",
      },
    }));
    assert.equal(explicitNative.nativePolicy.mode.requested, "native");
    assert.equal(
      explicitNative.nativePolicy.mode.effectiveCandidatePolicy,
      "native-required",
    );
    assert.equal(explicitNative.nativePolicy.disable.effective, false);
    assert.equal(explicitNative.nativePolicy.autoload.effective, "enabled");
    assert.equal(explicitNative.nativePolicy.required.effective, true);
    assert.equal(explicitNative.nativePolicy.fallback.effective, "required");

    const dynamic = collectReleaseCapabilities(fixedOptions(item, {
      environment: {
        SAGEJS_NATIVE_AUTOLOAD: "0",
        SAGEJS_NATIVE_MODE: "dynamic",
        SAGEJS_NATIVE_WARN_FALLBACK: "1",
      },
    }));
    assert.equal(dynamic.nativePolicy.autoload.effective, "enabled");
    assert.equal(dynamic.nativePolicy.required.effective, false);
    assert.equal(dynamic.nativePolicy.fallback.effective, "warn");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("missing or incomplete production kernels are fallback candidates, never first-use claims", () => {
  const item = fixture();
  try {
    const missing = collectReleaseCapabilities(fixedOptions(item));
    const missingKernels = capability(missing, "typed-python-native-kernels");
    assert.equal(missingKernels.candidate, "unavailable");
    assert.equal(missingKernels.integrity, "not-installed");
    assert.equal(missingKernels.fallbackCandidate, "available");
    assert.equal(missingKernels.selection, "not-probed");
    assert.ok(!JSON.stringify(missingKernels).includes("compile-on-first-use"));

    installNativeKernels(item.root, false);
    const incomplete = capability(
      collectReleaseCapabilities(fixedOptions(item)),
      "typed-python-native-kernels",
    );
    assert.equal(incomplete.candidate, "unavailable");
    assert.equal(incomplete.integrity, "incomplete");
    assert.equal(incomplete.loadability, "not-probed");
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
    assert.equal(flint.selection, "not-probed");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("embedded build manifest is the immutable SEA identity and profile authority", () => {
  const item = fixture({ git: false, runtime: false });
  try {
    // This nearby prefix must not be mistaken for the SEA's build profile.
    installMathProfile(item.root, "cpu-native");
    const index = kernelIndex();
    const embeddedAssets = {
      [BUILD_MANIFEST_ASSET]: JSON.stringify(buildManifest()),
      "native-kernels/index.json": JSON.stringify(index),
      "compiler/compiler.js": "compiler",
    };
    embedAdapter(embeddedAssets, "flint");
    embedAdapter(embeddedAssets, "fflas");
    embedAdapter(embeddedAssets, "igraph");
    for (const record of Object.values(index.logicalSources)) {
      embeddedAssets[`native-kernels/${record.cacheKey}/index.cjs`] = "wrapper";
      embeddedAssets[
        `native-kernels/${record.cacheKey}/build/Release/` +
          "sagejs_native_kernel.node"
      ] = "addon";
    }
    const report = collectReleaseCapabilities(fixedOptions(item, {
      artifactKind: "single-executable",
      embeddedAssets,
      git: { commit: null, dirty: null, present: false },
    }));
    assert.equal(report.artifactIdentity.availability, "available");
    assert.equal(report.artifactIdentity.source, "embedded");
    assert.equal(report.artifactIdentity.manifest.commit, commit);
    assert.equal(report.nativeMathProfile.observedBuild.source, "build-manifest");
    assert.equal(report.nativeMathProfile.observedBuild.effective, "portable");
    assert.equal(report.nativeMathProfile.installedPrefix, null);
    assert.equal(capability(report, "flint").candidate, "bundled");
    assert.equal(
      capability(report, "flint").manifestIntegrity,
      "verified-embedded",
    );
    assert.equal(
      capability(report, "typed-python-native-kernels").candidate,
      "bundled",
    );
    assert.equal(capability(report, "m4ri").candidate, "unavailable");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("SEA without a valid build manifest has no inferred artifact identity", () => {
  const item = fixture({ git: false, runtime: false });
  try {
    installMathProfile(item.root, "cpu-native");
    for (const embeddedAssets of [
      {},
      { [BUILD_MANIFEST_ASSET]: "{not json" },
    ]) {
      const report = collectReleaseCapabilities(fixedOptions(item, {
        embeddedAssets,
        git: { commit: null, dirty: null, present: false },
        seaAssets: ["compiler/compiler.js"],
      }));
      assert.equal(report.artifactIdentity.availability, "unavailable");
      assert.equal(report.nativeMathProfile.observedBuild, null);
      assert.equal(report.nativeMathProfile.installedPrefix, null);
      assert.equal(report.runtimeObservation.checkout.commit, null);
    }
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("an explicit valid build manifest supplies package artifact identity", () => {
  const item = fixture({ git: false });
  try {
    const report = collectReleaseCapabilities(fixedOptions(item, {
      artifactKind: "npm-package",
      buildManifest: buildManifest(),
      git: { commit: null, dirty: null, present: false },
    }));
    assert.equal(report.artifactIdentity.availability, "available");
    assert.equal(report.artifactIdentity.source, "explicit");
    assert.equal(report.artifactIdentity.manifest.version, "9.8.7");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("Windows M4RI is an unavailable candidate independent of @native policy", () => {
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
    assert.equal(m4ri.selection, "not-probed");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("observation is read-only, stable, and path-redacted by default", () => {
  const item = fixture();
  try {
    const external = join(item.directory, "secret-mount", "native-cache");
    const options = fixedOptions(item, {
      environment: {
        SAGEJS_NATIVE_CACHE_DIR: external,
        SAGEJS_PARALLEL_NATIVE_CACHE: join(item.home, "private-cache"),
      },
    });
    const before = tree(item.directory);
    const first = collectReleaseCapabilities(options);
    const second = collectReleaseCapabilities(options);
    assert.deepEqual(second, first);
    assert.deepEqual(tree(item.directory), before);
    const serialized = JSON.stringify(first);
    assert.ok(!serialized.includes(item.directory));
    assert.ok(!serialized.includes(item.home));
    assert.match(serialized, /<external>\/native-cache/);
    assert.match(serialized, /<home>\/private-cache/);
    assert.ok(JSON.stringify(
      collectReleaseCapabilities({ ...options, includePaths: true }),
    ).includes(external));
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
    assert.match(human, /immutable identity=unavailable/);
    assert.match(human, /Capability candidates .*not probed/);
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
    assert.equal(standalone.artifactIdentity.availability, "unavailable");
    assert.ok(!result.stdout.includes(item.home));
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

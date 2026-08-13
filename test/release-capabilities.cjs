"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { spawnSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const test = require("node:test");

const {
  SCHEMA,
  collectReleaseCapabilities,
  formatReleaseCapabilities,
} = require("../scripts/release-capabilities.cjs");

const repositoryRoot = resolve(__dirname, "..");
const script = join(repositoryRoot, "scripts", "release-capabilities.cjs");
const commit = "0123456789abcdef0123456789abcdef01234567";

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
  if (options.git !== false) mkdirSync(join(root, ".git"));
  if (options.runtime !== false) {
    write(join(root, "dist", "tools", "kernel.js"));
    write(join(root, "dist", "compiler", "compiler.js"));
  }
  return { directory, home, root };
}

function installAdapter(root, packageName, addonName) {
  const directory = join(root, "packages", packageName, "build", "generated-ffi");
  const addon = join(directory, addonName);
  const source = join(root, "packages", packageName, "generated", "ffi_host.py");
  write(addon, "native addon witness");
  write(source, "# generated adapter witness\n");
  const digest = (filename) => createHash("sha256")
    .update(readFileSync(filename))
    .digest("hex");
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

function installNativeKernels(root) {
  const cacheKey = "a".repeat(64);
  write(
    join(root, "dist", "native-kernels", "index.json"),
    `${JSON.stringify({
      logicalSources: {
        "sagejs/kernels/dense_integer.py": { cacheKey },
      },
      schema: "sagejs.native-cache/v3",
    })}\n`,
  );
  write(join(root, "dist", "native-kernels", cacheKey, "index.cjs"));
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
    const type = require("node:fs").statSync(filename);
    result.push(`${type.isDirectory() ? "d" : "f"}:${logical}`);
    if (type.isDirectory()) result.push(...tree(filename, logical));
  }
  return result;
}

test("source report separates compiled installation, selection, and cache warmth", () => {
  const item = fixture();
  try {
    installAdapter(item.root, "flint", "sagejs_flint_ffi.node");
    installAdapter(item.root, "fflas", "sagejs_fflas_ffi.node");
    installAdapter(item.root, "graph", "sagejs_igraph_ffi.node");
    installAdapter(item.root, "m4ri", "sagejs_m4ri_ffi.node");
    installNativeKernels(item.root);
    installMathProfile(item.root);
    write(join(item.home, ".cache", "sagejs", "modules", "v1", "one.json"));

    const report = collectReleaseCapabilities(fixedOptions(item));
    assert.equal(report.schema, SCHEMA);
    assert.equal(report.observational, true);
    assert.deepEqual(report.identity, {
      commit,
      dirty: false,
      name: "@sagemath/sagejs",
      version: "9.8.7",
    });
    assert.equal(report.artifact.kind, "source-checkout");
    assert.equal(capability(report, "python-sage-compiler").state, "compiled");
    assert.equal(capability(report, "flint").installed, "compiled");
    assert.equal(capability(report, "flint").integrity, "verified");
    assert.equal(capability(report, "flint").selected, "native");
    assert.equal(capability(report, "flint").state, "compiled");
    assert.equal(capability(report, "typed-python-native-kernels").state, "compiled");
    assert.equal(capability(report, "typed-python-native-kernels").readiness, "warm");
    assert.equal(
      report.nativeMathProfile.compatibility,
      "effective-profile-match",
    );
    assert.equal(report.nativeMathProfile.selected.selectionProbe, "not-run");
    assert.equal(report.caches.find(({ id }) => id === "module").readiness, "warm");
    assert.deepEqual(
      report.capabilities.map(({ id }) => id),
      [...report.capabilities.map(({ id }) => id)].sort(),
    );
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("inspection is read-only and reports cold source compilation honestly", () => {
  const item = fixture();
  try {
    const before = tree(item.directory);
    const report = collectReleaseCapabilities(fixedOptions(item));
    const after = tree(item.directory);
    assert.deepEqual(after, before);
    const kernels = capability(report, "typed-python-native-kernels");
    assert.equal(kernels.installed, "unavailable");
    assert.equal(kernels.selected, "compile-on-first-use");
    assert.equal(kernels.state, "cold");
    assert.equal(kernels.readiness, "cold");
    assert.equal(capability(report, "flint").selected, "fallback");
    assert.equal(capability(report, "flint").state, "fallback");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("native disable selects fallbacks without hiding installed adapters", () => {
  const item = fixture();
  try {
    installAdapter(item.root, "flint", "sagejs_flint_ffi.node");
    const report = collectReleaseCapabilities(fixedOptions(item, {
      environment: { SAGEJS_NATIVE_DISABLE: "1" },
    }));
    const flint = capability(report, "flint");
    assert.equal(report.nativeSelectionDisabled, true);
    assert.equal(flint.installed, "compiled");
    assert.equal(flint.fallback, "available");
    assert.equal(flint.selected, "fallback");
    assert.equal(flint.state, "fallback");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("a mismatched adapter hash fails closed without loading the addon", () => {
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
    const report = collectReleaseCapabilities(fixedOptions(item));
    const flint = capability(report, "flint");
    assert.equal(flint.integrity, "mismatch");
    assert.equal(flint.installed, "unavailable");
    assert.equal(flint.selected, "fallback");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("simulated mathematical SEA reports bundled assets and absent M4RI fallback", () => {
  const item = fixture({ git: false, runtime: false });
  try {
    const key = "b".repeat(64);
    const seaAssets = [
      "compiler/compiler.js",
      "native/sagejs_flint.node",
      "native/sagejs_flint_ffi.node",
      "native/sagejs_flint_ffi_manifest.json",
      "native/sagejs_fflas_ffi.node",
      "native/sagejs_fflas_ffi_manifest.json",
      "native/sagejs_graph.node",
      "native/sagejs_igraph_ffi.node",
      "native/sagejs_igraph_ffi_manifest.json",
      "native-kernels/index.json",
      `native-kernels/${key}/index.cjs`,
    ];
    const report = collectReleaseCapabilities(fixedOptions(item, {
      artifactKind: "single-executable",
      git: { commit: null, dirty: null, present: false },
      seaAssets,
    }));
    assert.equal(report.artifact.nativeAssetsEmbedded, true);
    assert.equal(capability(report, "python-sage-compiler").state, "bundled");
    assert.equal(capability(report, "flint").state, "bundled");
    assert.equal(capability(report, "fflas-ffpack").state, "bundled");
    assert.equal(capability(report, "igraph").state, "bundled");
    assert.equal(capability(report, "m4ri").installed, "unavailable");
    assert.equal(capability(report, "m4ri").state, "fallback");
    assert.equal(capability(report, "typed-python-native-kernels").state, "bundled");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("Windows keeps M4RI unavailable even if a capability stub is compiled", () => {
  const item = fixture();
  try {
    installAdapter(item.root, "m4ri", "sagejs_m4ri_ffi.node");
    const report = collectReleaseCapabilities(fixedOptions(item, {
      arch: "x64",
      libc: "msvc",
      platform: "win32",
    }));
    const m4ri = capability(report, "m4ri");
    assert.equal(report.host.libc, "msvc");
    assert.equal(m4ri.installed, "unavailable");
    assert.equal(m4ri.selected, "fallback");
    assert.equal(m4ri.state, "fallback");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("profile report is observational and diagnoses selection mismatches", () => {
  const item = fixture();
  try {
    installMathProfile(item.root, "portable");
    const report = collectReleaseCapabilities(fixedOptions(item, {
      arch: "arm64",
      environment: {
        CC: "/definitely/not/a/compiler",
        CXX: "/definitely/not/a/compiler",
        SAGEJS_NATIVE_MATH_PROFILE: "cpu-native",
      },
      platform: "darwin",
    }));
    assert.equal(report.nativeMathProfile.selected.requested, "cpu-native");
    assert.equal(report.nativeMathProfile.selected.effective, "cpu-native");
    assert.equal(report.nativeMathProfile.selected.selectionProbe, "not-run");
    assert.equal(report.nativeMathProfile.installed.effective, "portable");
    assert.equal(report.nativeMathProfile.compatibility, "profile-mismatch");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("deterministic output redacts absolute paths unless explicitly requested", () => {
  const item = fixture();
  try {
    const external = join(item.directory, "secret-mount", "native-cache");
    const hiddenHome = item.home;
    const options = fixedOptions(item, {
      environment: {
        SAGEJS_NATIVE_CACHE_DIR: external,
        SAGEJS_PARALLEL_NATIVE_CACHE: join(hiddenHome, "private-cache"),
      },
    });
    const first = collectReleaseCapabilities(options);
    const second = collectReleaseCapabilities(options);
    assert.deepEqual(second, first);
    const serialized = JSON.stringify(first);
    assert.ok(!serialized.includes(item.directory));
    assert.ok(!serialized.includes(hiddenHome));
    assert.match(serialized, /<external>\/native-cache/);
    assert.match(serialized, /<home>\/private-cache/);

    const explicit = collectReleaseCapabilities({ ...options, includePaths: true });
    assert.ok(JSON.stringify(explicit).includes(external));
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
    assert.match(human, /^Sage\.js 9\.8\.7/m);
    assert.match(human, /^Artifact: npm-package for linux-x64$/m);
    assert.match(human, /^Capabilities:$/m);
    assert.match(human, /^Caches:$/m);
    assert.ok(human.split("\n").length < 20);

    const result = spawnSync(
      process.execPath,
      [script, "--json", "--root", item.root],
      { encoding: "utf8", env: { ...process.env, HOME: item.home } },
    );
    assert.equal(result.status, 0, result.stderr);
    const standalone = JSON.parse(result.stdout);
    assert.equal(standalone.schema, SCHEMA);
    assert.equal(standalone.identity.version, "9.8.7");
    assert.ok(!result.stdout.includes(item.home));

    const bad = spawnSync(process.execPath, [script, "--surprise"], {
      encoding: "utf8",
    });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /usage:/);
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

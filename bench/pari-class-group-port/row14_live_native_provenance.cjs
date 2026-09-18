"use strict";

// Evidence collector for the native code which is already resident at the
// row-14 prepared boundary.  This module does not compile or execute a
// mathematical kernel.  It authenticates the built objects after warmup,
// including the generated sources, linker inputs and the toolchain which can
// explain their content-addressed cache identities.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const SCHEMA =
  "sagejs.pari-class-group/row14-live-native-provenance-v1";
const BUILD_SCHEMA =
  "sagejs.pari-class-group/row14-native-built-object-provenance-v1";
const SHA256 = /^[0-9a-f]{64}$/;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function fileEvidence(filename, label = "file") {
  const absolute = path.resolve(filename);
  const bytes = fs.readFileSync(absolute);
  const stat = fs.statSync(absolute);
  assert(stat.isFile(), `${label} is not a regular file: ${absolute}`);
  return Object.freeze({ path: absolute, bytes: String(bytes.length),
    sha256: sha256(bytes) });
}

function executablePath(program) {
  if (path.isAbsolute(program) || program.includes(path.sep)) {
    assert(fs.existsSync(program), `missing toolchain executable ${program}`);
    return path.resolve(program);
  }
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, program);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return path.resolve(candidate);
    } catch (_error) {}
  }
  throw new Error(`cannot resolve toolchain executable ${program}`);
}

function commandVersion(executable) {
  const result = spawnSync(executable, ["--version"], {
    encoding: "utf8", timeout: 10_000,
  });
  assert.equal(result.status, 0,
    `cannot obtain toolchain version from ${executable}`);
  return `${result.stdout || ""}${result.stderr || ""}`.trim();
}

function compilerAuthority() {
  const requested = process.env.CC || "cc";
  const invokedPath = executablePath(requested);
  const realPath = fs.realpathSync(invokedPath);
  const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", {
    paths: [path.join(ROOT, "packages", "flint")],
  });
  const compilerSources = fs.readdirSync(path.join(ROOT, "tools", "native-kernel"))
    .filter(name => name.endsWith(".cjs")).sort()
    .map(name => fileEvidence(path.join(ROOT, "tools", "native-kernel", name),
      `native compiler source ${name}`));
  const declarationFiles = require("../../tools/ffi/declarations.cjs")
    .declarationFiles(ROOT)
    .map(filename => fileEvidence(filename, "FFI declaration authority"));
  const authority = {
    compiler: {
      requested, invoked: fileEvidence(invokedPath, "C compiler"),
      resolved: fileEvidence(realPath, "resolved C compiler"),
      version: commandVersion(invokedPath),
    },
    environment: {
      CFLAGS: process.env.CFLAGS || "", CXX: process.env.CXX || "",
      CXXFLAGS: process.env.CXXFLAGS || "", LDFLAGS: process.env.LDFLAGS || "",
    },
    node: { executable: fileEvidence(process.execPath, "Node executable"),
      version: process.version, modulesAbi: process.versions.modules },
    nodeGyp: fileEvidence(nodeGyp, "node-gyp entry point"),
    nativeHeader: fileEvidence(path.join(ROOT, "packages", "flint", "include",
      "sagejs", "native.h"), "native ABI header"),
    compilerSources, declarationFiles,
  };
  authority.sha256 = sha256(stableJson(authority));
  return Object.freeze(authority);
}

function generatedArtifactPaths(built) {
  const fixed = {
    addon: built.addonPath,
    manifest: built.manifestPath,
    index: built.modulePath,
    coreSource: built.coreSourcePath,
    coreHeader: built.coreHeaderPath,
    adapterSource: path.join(built.outputPath, "kernel.c"),
    binding: path.join(built.outputPath, "binding.gyp"),
  };
  if (built.shimSourcePath !== null && built.shimSourcePath !== undefined) {
    fixed.shimSource = built.shimSourcePath;
    fixed.shimHeader = built.shimHeaderPath;
  }
  return fixed;
}

function manifestDependencies(manifest) {
  const rows = [{ kind: "root-source", path: manifest.sourcePath,
    expectedSha256: manifest.sourceHash }];
  for (const dependency of manifest.ir?.nativeSourceDependencies || []) {
    rows.push({ kind: "native-source-dependency", path: dependency.path,
      expectedSha256: dependency.sha256 });
  }
  for (const foreign of manifest.foreignInputs || []) {
    for (const field of ["headers", "transitiveHeaders", "libraries"]) {
      for (const dependency of foreign[field] || []) {
        if (typeof dependency === "string") {
          rows.push({ kind: `foreign-${field}`, path: dependency });
        } else if (dependency?.path) {
          rows.push({ kind: `foreign-${field}`, path: dependency.path,
            expectedSha256: dependency.sha256 });
        }
      }
    }
  }
  return rows;
}

function linkedFileDependencies(binding) {
  const targets = Array.isArray(binding.targets) ? binding.targets : [];
  return targets.flatMap(target => target.libraries || [])
    .filter(filename => typeof filename === "string" && path.isAbsolute(filename))
    .map(filename => ({ kind: "link-input", path: filename }));
}

function authenticateDependencies(rows) {
  const unique = new Map();
  for (const row of rows) {
    const absolute = path.resolve(row.path);
    const evidence = fileEvidence(absolute, row.kind);
    if (row.expectedSha256 !== undefined) {
      assert.match(row.expectedSha256, SHA256);
      assert.equal(evidence.sha256, row.expectedSha256,
        `${row.kind} changed after native warmup: ${absolute}`);
    }
    const previous = unique.get(absolute);
    if (previous) {
      assert.equal(previous.sha256, evidence.sha256);
      previous.kinds = [...new Set([...previous.kinds, row.kind])].sort();
    } else {
      unique.set(absolute, { ...evidence, kinds: [row.kind] });
    }
  }
  return [...unique.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function runtimeDependencies(addonPath) {
  if (process.platform !== "linux") return [];
  const result = spawnSync("ldd", [addonPath], {
    encoding: "utf8", timeout: 10_000,
  });
  assert.equal(result.status, 0, `ldd failed for ${addonPath}`);
  const paths = [];
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/(?:=>\s+)?(\/[^\s(]+)\s*(?:\(|$)/);
    if (match && fs.existsSync(match[1])) paths.push(match[1]);
  }
  return authenticateDependencies(paths.map(filename =>
    ({ kind: "runtime-link-dependency", path: filename })));
}

function loaderAuthority(built) {
  const packPath = path.resolve(built.outputPath, "..", "pack",
    "sagejs_native_kernel_pack.node");
  if (!fs.existsSync(packPath)) {
    return Object.freeze({ route: "direct-addon", packPresent: false,
      loadedBinary: fileEvidence(built.addonPath, "direct native addon") });
  }
  // This is the same first-choice lookup made by every generated index.cjs.
  // Requiring an already-loaded pack is side-effect free; if it was not loaded,
  // Node loads only the host adapter and does not execute a math kernel.
  const pack = require(packPath);
  assert.equal(pack.__sagejsPackAbi, 1, "native pack ABI changed");
  assert(pack[built.cacheKey] && typeof pack[built.cacheKey] === "object",
    `native pack lacks row-14 namespace ${built.cacheKey}`);
  return Object.freeze({ route: "packed-addon", packPresent: true,
    loadedBinary: fileEvidence(packPath, "packed native addon") });
}

function collectBuiltObjectProvenance(label, kernel, options = {}) {
  const built = kernel?.built || kernel;
  assert(built && typeof built === "object", `${label} lacks a built object`);
  assert.match(built.cacheKey, SHA256, `${label} cache key`);
  assert(Number.isInteger(built.nativeAbi) && built.nativeAbi > 0,
    `${label} native ABI is absent`);
  const artifacts = Object.fromEntries(Object.entries(generatedArtifactPaths(built))
    .map(([name, filename]) => [name, fileEvidence(filename, `${label} ${name}`)]));
  const manifest = JSON.parse(fs.readFileSync(built.manifestPath, "utf8"));
  assert.equal(manifest.cacheKey, built.cacheKey, `${label} manifest cache key`);
  assert.equal(manifest.moduleIdentity, built.moduleIdentity,
    `${label} manifest module identity`);
  assert.equal(manifest.nativeAbi, built.nativeAbi, `${label} manifest ABI`);
  assert.match(manifest.sourceHash, SHA256, `${label} source hash`);
  assert.equal(artifacts.manifest.sha256,
    sha256(fs.readFileSync(built.manifestPath)), `${label} manifest hash drift`);
  assert.equal(manifest.hostIsolation?.isolated, true,
    `${label} is not an isolated native kernel`);
  assert.equal(manifest.hostIsolation?.hostCallbacks, 0,
    `${label} retains host callbacks`);
  const binding = JSON.parse(fs.readFileSync(
    path.join(built.outputPath, "binding.gyp"), "utf8"));
  const dependencies = authenticateDependencies([
    ...manifestDependencies(manifest), ...linkedFileDependencies(binding),
  ]);
  const result = {
    schema: BUILD_SCHEMA, label, cacheKey: built.cacheKey,
    moduleIdentity: built.moduleIdentity, nativeAbi: built.nativeAbi,
    sourcePath: path.resolve(manifest.sourcePath),
    sourceHash: manifest.sourceHash,
    hostIsolation: structuredClone(manifest.hostIsolation),
    loader: loaderAuthority(built),
    artifacts, dependencies,
    runtimeDependencies: options.inspectRuntimeDependencies === false
      ? [] : runtimeDependencies(built.addonPath),
  };
  result.sha256 = sha256(stableJson(result));
  return Object.freeze(result);
}

function row14BuiltObjects(resident) {
  assert(resident && typeof resident === "object", "missing row-14 resident");
  const candidates = [
    ["initial-root", resident.rootBuilt],
    ...Object.entries(resident.gateKernels || {}).map(([name, kernel]) =>
      [`gate.${name}`, kernel]),
    ["class-assembly", resident.classAssembly],
    ["post.prime-catalog", resident.postCatalog],
    ["post.terminal", resident.postTerminal],
    ...Object.entries(resident.units || {}).map(([name, kernel]) =>
      [`unit.${name}`, kernel]),
  ];
  const unique = new Map();
  for (const [label, kernel] of candidates) {
    const built = kernel?.built || kernel;
    assert(built?.cacheKey, `${label} lacks native built metadata`);
    const existing = unique.get(built.cacheKey);
    if (existing) existing.labels.push(label);
    else unique.set(built.cacheKey, { label, labels: [label], kernel });
  }
  return [...unique.values()];
}

function collectRow14LiveNativeProvenance(resident, options = {}) {
  const expectedBuildCount = options.expectedBuildCount ?? 13;
  const objects = row14BuiltObjects(resident);
  assert.equal(objects.length, expectedBuildCount,
    "row-14 native built-object closure changed");
  const builds = objects.map(({ label, labels, kernel }) => ({
    ...collectBuiltObjectProvenance(label, kernel, options), labels,
  }));
  const authority = options.collectToolchain === false ? null : compilerAuthority();
  const result = {
    schema: SCHEMA,
    collectionBoundary: "post-warmup-resident-built-objects-no-kernel-execution",
    buildCount: builds.length,
    builds,
    toolchain: authority,
  };
  result.sha256 = sha256(stableJson(result));
  return Object.freeze(result);
}

module.exports = {
  BUILD_SCHEMA, SCHEMA, collectBuiltObjectProvenance,
  collectRow14LiveNativeProvenance, compilerAuthority, fileEvidence,
  row14BuiltObjects, stableJson,
};

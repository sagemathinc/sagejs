"use strict";

const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { dirname, join, relative, resolve } = require("node:path");

const declarations = require("./declarations.cjs");
const {
  loadNativeExportPolicy,
  validateNativeExportPolicy,
} = require("./native-export-policy.cjs");

const repositoryRoot = resolve(__dirname, "..", "..");

function portablePath(path) {
  return path.replaceAll("\\", "/");
}

function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function trackedFiles(root) {
  return execFileSync("git", [
    "ls-files", "-z", "--cached", "--others", "--exclude-standard",
  ], {
    cwd: root,
    encoding: "utf8",
  }).split("\0").filter(Boolean).sort();
}

function packageName(root, filename) {
  let directory = dirname(join(root, filename));
  while (directory.startsWith(root)) {
    const manifest = join(directory, "package.json");
    try {
      const value = readJson(manifest).name;
      if (typeof value === "string" && value.length > 0) return value;
    } catch (_error) {
      // Continue toward the repository root.
    }
    if (directory === root) break;
    directory = dirname(directory);
  }
  return "sagejs";
}

function napiExports(root, files, declaredDynamic) {
  const result = [];
  const pattern = /\{\s*"([^"]+)"\s*,\s*NULL\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*NULL\s*,\s*NULL\s*,\s*NULL\s*,\s*napi_default\s*,\s*NULL\s*\}/g;
  for (const path of files.filter((value) => value.endsWith(".c"))) {
    const source = readFileSync(join(root, path), "utf8");
    if (!source.includes("NAPI_MODULE")) continue;
    const packageId = packageName(root, path);
    for (const match of source.matchAll(pattern)) {
      const exportName = match[1];
      const declaration = declaredDynamic.get(`${packageId}:${exportName}`);
      result.push({
        id: `napi:${packageId}:${exportName}`,
        kind: "napi-export",
        path,
        package: packageId,
        export: exportName,
        symbol: match[2],
        disposition: declaration === undefined
          ? "legacy-handwritten-dynamic"
          : "declared-ffi-dynamic",
        ...(declaration === undefined ? {} : { declaration }),
      });
    }
  }
  return result;
}

function wasmExports(root, files) {
  const result = [];
  const pattern = /__attribute__\(\(visibility\("default"\)\)\)\s*(?:[A-Za-z_][A-Za-z0-9_\s*]*?\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  for (const path of files.filter((value) => value.endsWith(".c"))) {
    const source = readFileSync(join(root, path), "utf8");
    if (!source.includes('__attribute__((visibility("default")))')) continue;
    if (path.includes("/tree_sitter/") || path.endsWith("/parser.c")) continue;
    const packageId = packageName(root, path);
    for (const match of source.matchAll(pattern)) {
      result.push({
        id: `wasm:${packageId}:${match[1]}`,
        kind: "wasm-export",
        path,
        package: packageId,
        export: match[1],
        symbol: match[1],
        disposition: "legacy-handwritten-wasm",
      });
    }
  }
  return result;
}

function runtimeIntrinsics(root) {
  const path = "tools/python/contract.ts";
  const source = readFileSync(join(root, path), "utf8");
  const start = source.indexOf("export const SAGEJS_RUNTIME_INTRINSICS");
  const end = source.indexOf("\n};", start);
  if (start < 0 || end < 0) throw new Error("cannot locate runtime intrinsic registry");
  const result = [];
  const pattern = /^\s{2}([A-Za-z_][A-Za-z0-9_]*):\s*("(?:\\.|[^"\\])*")/gm;
  for (const match of source.slice(start, end).matchAll(pattern)) {
    const symbol = JSON.parse(match[2]);
    result.push({
      id: `runtime:${match[1]}`,
      kind: "runtime-intrinsic",
      path,
      export: match[1],
      symbol,
      disposition: match[1] === "ffi_call"
        ? "declared-ffi-gateway"
        : match[1].startsWith("ffi_resource_")
          ? "declared-ffi-resource-gateway"
        : "runtime-primitive",
    });
  }
  if (result.length === 0) throw new Error("runtime intrinsic registry is empty");
  return result;
}

function declaredFunctions(registry) {
  return registry.libraries.flatMap((library) =>
    library.functions.map((fn) => ({
      id: `ffi:${library.library.id}:${fn.id}`,
      kind: "declared-ffi",
      path: portablePath(relative(registry.root, library.filename)),
      library: library.library.id,
      export: fn.python_name,
      dynamic_package: library.library.dynamic.package,
      dynamic_export: fn.dynamic.export,
      symbol: fn.native.symbol,
      disposition: "declared-safe-ffi",
    }))
  );
}

function declaredResources(registry) {
  return registry.libraries.flatMap((library) =>
    library.resources.map((resource) => ({
      id: `ffi-resource:${library.library.id}:${resource.id}`,
      kind: "declared-ffi-resource",
      path: portablePath(relative(registry.root, library.filename)),
      library: library.library.id,
      export: resource.python_name,
      abi_type: resource.abi_type,
      close_export: resource.dynamic.close_export,
      clear_symbol: resource.native.clear_symbol,
      ...(resource.native.size_symbol === undefined
        ? {} : { size_symbol: resource.native.size_symbol }),
      ...(resource.host_transfer === undefined
        ? {}
        : {
          host_transfer: {
            kind: resource.host_transfer.kind,
            dynamic_export: resource.host_transfer.dynamic.export,
            ...(resource.host_transfer.native.copy_symbol === undefined
              ? {
                  data_symbol: resource.host_transfer.native.data_symbol,
                  length_symbol: resource.host_transfer.native.length_symbol,
                }
              : {
                  copy_symbol: resource.host_transfer.native.copy_symbol,
                  clear_symbol: resource.host_transfer.native.clear_symbol,
                }),
            wasm: resource.host_transfer.targets.wasm,
          },
        }),
      ...(resource.host_ingress === undefined
        ? {}
        : {
          host_ingress: {
            kind: resource.host_ingress.kind,
            dynamic_export: resource.host_ingress.dynamic.export,
            init_symbol: resource.host_ingress.native.init_symbol,
            wasm: resource.host_ingress.targets.wasm,
          },
        }),
      disposition: "declared-owned-ffi-resource",
    }))
  );
}

function classifiedNativeFiles(root) {
  const manifest = readJson(join(root, "architecture", "native-code.json"));
  return manifest.files.map((entry) => ({
    id: `native-file:${entry.path}`,
    kind: "classified-native-file",
    path: entry.path,
    disposition: entry.category,
    review_status: entry.review_status,
    lane: entry.lane,
  }));
}

function createBoundarySnapshot(options = {}) {
  const root = resolve(options.root || repositoryRoot);
  const files = trackedFiles(root);
  const registry = declarations.loadRegistry({ root });
  const dynamic = new Map();
  for (const library of registry.libraries) {
    for (const fn of library.functions) {
      dynamic.set(
        `${library.library.dynamic.package}:${fn.dynamic.export}`,
        `${library.library.id}:${fn.id}`,
      );
    }
  }
  const nativeExports = validateNativeExportPolicy(
    loadNativeExportPolicy({ root }), napiExports(root, files, dynamic),
  ).map((item) => ({
    id: item.id,
    kind: item.kind,
    path: item.path,
    package: item.package,
    export: item.export,
    symbol: item.symbol,
    disposition: item.policy.decision,
    family: item.policy.family,
    ...(item.declaration === undefined ? {} : { declaration: item.declaration }),
  }));
  const boundaries = [
    ...classifiedNativeFiles(root),
    ...nativeExports,
    ...wasmExports(root, files),
    ...runtimeIntrinsics(root),
    ...declaredFunctions(registry),
    ...declaredResources(registry),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const duplicate = boundaries.find((item, index) =>
    index > 0 && item.id === boundaries[index - 1].id
  );
  if (duplicate !== undefined) throw new Error(`duplicate native boundary ${duplicate.id}`);
  const counts = Object.fromEntries(
    [...new Set(boundaries.map((item) => item.kind))].sort().map((kind) => [
      kind,
      boundaries.filter((item) => item.kind === kind).length,
    ]),
  );
  return {
    schema_version: 1,
    policy: {
      default: "reject-drift",
      scopes: [
        "classified-native-files",
        "declared-ffi-functions",
        "declared-ffi-resources",
        "napi-exports",
        "runtime-intrinsics",
        "wasm-exports",
      ],
      new_boundaries_require: "explicit-regeneration-and-review",
    },
    counts,
    boundaries,
  };
}

function snapshotPath(root = repositoryRoot) {
  return join(resolve(root), "architecture", "native-boundaries.json");
}

function validateBoundarySnapshot(snapshot, options = {}) {
  const expected = createBoundarySnapshot(options);
  const actualText = `${JSON.stringify(snapshot, null, 2)}\n`;
  const expectedText = `${JSON.stringify(expected, null, 2)}\n`;
  if (actualText !== expectedText) {
    const actualIds = new Set((snapshot.boundaries || []).map((item) => item.id));
    const expectedIds = new Set(expected.boundaries.map((item) => item.id));
    const added = [...expectedIds].filter((id) => !actualIds.has(id));
    const removed = [...actualIds].filter((id) => !expectedIds.has(id));
    const detail = [
      added.length ? `new: ${added.slice(0, 8).join(", ")}` : "",
      removed.length ? `removed: ${removed.slice(0, 8).join(", ")}` : "",
    ].filter(Boolean).join("; ");
    throw new Error(
      "native-boundary inventory has drifted; run sagejs ffi audit --write" +
      (detail ? ` (${detail})` : " (metadata changed)"),
    );
  }
  return expected;
}

module.exports = {
  createBoundarySnapshot,
  napiExports,
  portablePath,
  repositoryRoot,
  snapshotPath,
  trackedFiles,
  validateBoundarySnapshot,
};

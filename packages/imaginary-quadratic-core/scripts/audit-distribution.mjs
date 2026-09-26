#!/usr/bin/env node
// Read-only build-closure inventory for the development reactor. This is not
// an artifact-derived SBOM, a license decision, or permission to distribute.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(packageRoot, "../..");
const defaultArtifact = path.join(
  packageRoot,
  "target/wasm32-wasip1/release/sagejs_imaginary_quadratic_core.wasm",
);
if (process.argv.length > 3) {
  throw new Error("usage: node audit-distribution.mjs [DEVELOPMENT-ARTIFACT.wasm]");
}
const artifact = path.resolve(process.argv[2] ?? defaultArtifact);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (file) => fs.readFileSync(file);
const run = (command, args, options = {}) => {
  const output = execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  return typeof output === "string" ? output.trim() : output;
};
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const sorted = (items) => items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

const bytes = read(artifact);
const verified = JSON.parse(
  run("node", [path.join(root, "packages/class-groups/scripts/verify-wasm.mjs"), artifact]),
);
const wasm = new WebAssembly.Module(bytes);
const imports = sorted(WebAssembly.Module.imports(wasm).map(({ module, name, kind }) => ({
  module,
  name,
  kind,
})));
const expectedImports = sorted([
  "environ_get",
  "environ_sizes_get",
  "fd_write",
  "proc_exit",
].map((name) => ({ module: "wasi_snapshot_preview1", name, kind: "function" })));
if (JSON.stringify(imports) !== JSON.stringify(expectedImports)) {
  throw new Error(`unexpected development reactor imports: ${JSON.stringify(imports)}`);
}
const exports = sorted(WebAssembly.Module.exports(wasm).map(({ name, kind }) => ({
  name,
  kind,
})));
const expectedExports = sorted([
  { name: "memory", kind: "memory" },
  ...[
    "sagejs_class_group_abi_version",
    "sagejs_class_group_alloc",
    "sagejs_class_group_dealloc",
    "sagejs_class_group_run_json",
  ].map((name) => ({ name, kind: "function" })),
]);
if (JSON.stringify(exports) !== JSON.stringify(expectedExports)) {
  throw new Error(`unexpected development reactor exports: ${JSON.stringify(exports)}`);
}
if (verified.bytes !== bytes.length || verified.importedMemories !== 0) {
  throw new Error("independent Wasm verifier returned an inconsistent artifact summary");
}

const lock = read(path.join(packageRoot, "Cargo.lock")).toString();
const locked = new Map();
for (const block of lock.split("[[package]]").slice(1)) {
  const field = (key) => block.match(new RegExp(`^${key} = "([^"]+)"$`, "m"))?.[1];
  const name = field("name");
  const version = field("version");
  if (!name || !version) throw new Error("incomplete Cargo.lock package entry");
  locked.set(`${name}@${version}`, { source: field("source"), checksum: field("checksum") });
}
const metadata = JSON.parse(run("cargo", [
  "metadata", "--offline", "--locked", "--format-version", "1",
  "--filter-platform", "wasm32-wasip1", "--manifest-path",
  path.join(packageRoot, "Cargo.toml"),
]));
const packagesById = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
const keyOf = (id) => {
  const pkg = packagesById.get(id);
  if (!pkg) throw new Error(`resolved package is absent from metadata: ${id}`);
  return `${pkg.name}@${pkg.version}`;
};
const packages = metadata.packages.map((pkg) => {
  const key = keyOf(pkg.id);
  const lockedEntry = locked.get(key);
  if (!lockedEntry || (lockedEntry.source ?? null) !== pkg.source) {
    throw new Error(`Cargo.lock and metadata disagree on ${key}`);
  }
  if (!pkg.source) return { package: key, source: "first-party", license: pkg.license };
  if (!pkg.source.startsWith("registry+")) throw new Error(`unexpected package source: ${key}`);
  const sourceDirectory = path.dirname(pkg.manifest_path);
  const registrySourceRoot = path.dirname(sourceDirectory);
  const sourceParent = path.dirname(registrySourceRoot);
  const registryRoot = path.dirname(sourceParent);
  if (path.basename(sourceParent) !== "src" || path.basename(registryRoot) !== "registry") {
    throw new Error(`unexpected Cargo registry source layout for ${key}`);
  }
  const archive = path.join(
    registryRoot, "cache", path.basename(registrySourceRoot), `${key.replace("@", "-")}.crate`,
  );
  const archiveBytes = read(archive);
  const archiveHash = sha256(archiveBytes);
  if (!lockedEntry.checksum || archiveHash !== lockedEntry.checksum) {
    throw new Error(`registry archive differs from Cargo.lock for ${key}`);
  }
  const archiveRoot = `${key.replace("@", "-")}/`;
  const noticeNames = run("tar", ["-tf", archive]).split("\n").filter((entry) => {
    if (!entry.startsWith(archiveRoot)) return false;
    const name = entry.slice(archiveRoot.length);
    return !name.includes("/") && /^(?:LICENSE|LICENCE|COPYING|NOTICE)/i.test(name);
  }).sort();
  if (noticeNames.length === 0) throw new Error(`no root license/notice file in ${key}`);
  const notices = noticeNames.map((entry) => ({
    file: entry.slice(archiveRoot.length),
    sha256: sha256(run("tar", ["-xOf", archive, entry], { encoding: "buffer" })),
  }));
  return {
    package: key,
    source: pkg.source,
    declaredLicense: pkg.license,
    archiveSha256: archiveHash,
    notices,
  };
}).sort((a, b) => a.package.localeCompare(b.package));
if (packages.length !== locked.size) {
  throw new Error("Cargo.lock contains packages absent from the resolved target graph");
}
const edges = sorted(metadata.resolve.nodes.flatMap((node) => node.deps.flatMap((dep) =>
  dep.dep_kinds.map(({ kind, target }) => ({
    from: keyOf(node.id),
    to: keyOf(dep.pkg),
    kind: kind ?? "normal",
    target: target ?? "all",
  })),
)));

const inputNames = [
  "packages/imaginary-quadratic-core/Cargo.toml",
  "packages/imaginary-quadratic-core/Cargo.lock",
  "packages/imaginary-quadratic-core/src/lib.rs",
  "packages/imaginary-quadratic-core/src/service.rs",
  "packages/imaginary-quadratic-core/src/reactor.rs",
  "packages/imaginary-quadratic-core/scripts/build-wasm.sh",
  "packages/imaginary-quadratic-core/scripts/audit-distribution.mjs",
  "packages/class-groups/src/imaginary.rs",
  "packages/class-groups/scripts/verify-wasm.mjs",
  "packages/wasm-toolchain/lock.json",
  "packages/wasm-toolchain/scripts/toolchain.cjs",
];
const inputs = inputNames.map((name) => ({ file: name, sha256: sha256(read(path.join(root, name))) }));
const toolchainRoot = run("node", [path.join(root, "packages/wasm-toolchain/scripts/toolchain.cjs"), "path"]);
const linker = path.join(toolchainRoot, "sdk/bin/wasm-ld");
const result = {
  scope: "development-build-closure-inventory; not an artifact-derived SBOM or distribution approval",
  target: "wasm32-wasip1",
  artifact: { file: rel(artifact), bytes: bytes.length, sha256: sha256(bytes) },
  wasm: { imports, exports, memories: verified.memories },
  build: {
    rustc: run("rustc", ["-Vv"]),
    cargo: run("cargo", ["-V"]),
    linkerSha256: sha256(read(linker)),
    rustflags: "-C target-feature=+simd128 -C link-arg=--export-memory -C link-arg=--initial-memory=16777216 -C link-arg=--max-memory=268435456",
  },
  inputs,
  packages,
  resolvedEdges: edges,
};
console.log(JSON.stringify(result, null, 2));

"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} = require("node:fs");
const { execFileSync } = require("node:child_process");
const { join, relative, resolve } = require("node:path");
const {
  canonicalJson,
  toolchainReceiptIdentity,
} = require("./wasm-toolchain.cjs");
const {
  lazyModuleReceiptInputs,
} = require("../../../scripts/lazy-module-provenance.cjs");

const receiptSchema = "sagejs.wasm-build-receipt/v1";
const artifactSchema = "sagejs.wasm-production-artifact/v1";

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filename) {
  return sha256Bytes(readFileSync(filename));
}

function wasmMemories(filename) {
  const bytes = readFileSync(filename);
  if (bytes.length < 8 || bytes.subarray(0, 8).toString("hex") !== "0061736d01000000") {
    throw new Error(`not a WebAssembly 1 module: ${filename}`);
  }
  let offset = 8;
  function byte() {
    if (offset >= bytes.length) throw new Error(`truncated WebAssembly module: ${filename}`);
    return bytes[offset++];
  }
  function uleb() {
    let value = 0;
    let shift = 0;
    while (true) {
      const current = byte();
      value += (current & 0x7f) * 2 ** shift;
      if ((current & 0x80) === 0) return value;
      shift += 7;
      if (shift > 49) throw new Error(`oversized WebAssembly integer: ${filename}`);
    }
  }
  function name() {
    const length = uleb();
    offset += length;
    if (offset > bytes.length) throw new Error(`truncated WebAssembly name: ${filename}`);
  }
  function limits(imported) {
    const flags = uleb();
    const initialPages = uleb();
    const maximumPages = (flags & 1) !== 0 ? uleb() : null;
    return { imported, initialPages, maximumPages, shared: (flags & 2) !== 0 };
  }
  function skipTableType() { byte(); limits(true); }
  const memories = [];
  while (offset < bytes.length) {
    const section = byte();
    const length = uleb();
    const end = offset + length;
    if (end > bytes.length) throw new Error(`truncated WebAssembly section: ${filename}`);
    if (section === 2) {
      const count = uleb();
      for (let index = 0; index < count; index++) {
        name(); name();
        const kind = byte();
        if (kind === 0) uleb();
        else if (kind === 1) skipTableType();
        else if (kind === 2) memories.push(limits(true));
        else if (kind === 3) { byte(); byte(); }
        else if (kind === 4) { byte(); uleb(); }
        else throw new Error(`unknown WebAssembly import kind ${kind}: ${filename}`);
      }
    } else if (section === 5) {
      const count = uleb();
      for (let index = 0; index < count; index++) memories.push(limits(false));
    }
    offset = end;
  }
  return memories;
}

function verifyWasmMemoryContract(filename, contract) {
  if (contract.pageBytes !== undefined && contract.pageBytes !== 65536) {
    throw new Error(`invalid WebAssembly page size in production layout: ${contract.pageBytes}`);
  }
  const memories = wasmMemories(filename);
  if (memories.length !== 1) {
    throw new Error(`${filename} must define exactly one WebAssembly memory, found ${memories.length}`);
  }
  const actual = memories[0];
  if (actual.imported || actual.shared ||
      actual.initialPages !== contract.initialPages ||
      actual.maximumPages !== contract.maximumPages) {
    throw new Error(
      `${filename} memory contract differs: actual=${JSON.stringify(actual)}, ` +
        `expected=${JSON.stringify(contract)}`,
    );
  }
  return actual;
}

function normalizedRelative(root, filename) {
  const name = relative(root, filename).replaceAll("\\", "/");
  if (!name || name.startsWith("../") || name === "..") {
    throw new Error(`receipt input escapes its root: ${filename}`);
  }
  return name;
}

function filesUnder(root, filename, { ignored = new Set() } = {}) {
  if (!existsSync(filename)) return [];
  const status = lstatSync(filename);
  if (status.isSymbolicLink()) {
    throw new Error(`receipt input must not be a symbolic link: ${filename}`);
  }
  if (status.isFile()) return [filename];
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (ignored.has(entry.name)) continue;
      const child = join(directory, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(child);
      else if (entry.isSymbolicLink()) throw new Error(`receipt input must not be a symbolic link: ${child}`);
    }
  }
  visit(filename);
  return files;
}

function sourceClosure(repositoryRoot, packageRoot, sourceInputs = []) {
  for (const filename of sourceInputs) {
    if (!existsSync(filename)) {
      throw new Error(`required production source input is missing: ${filename}`);
    }
  }
  const lazyInputs = lazyModuleSourceInputs(repositoryRoot, packageRoot);
  const roots = [
    ...sourceInputs,
    ...lazyInputs,
    join(packageRoot, "scripts", "build.cjs"),
    join(packageRoot, "scripts", "browser-wasm-release-artifact.cjs"),
    join(packageRoot, "scripts", "production-receipt.cjs"),
    join(packageRoot, "scripts", "wasm-toolchain.cjs"),
    join(packageRoot, "toolchain"),
    join(packageRoot, "release"),
    join(repositoryRoot, "package.json"),
    join(repositoryRoot, "pnpm-lock.yaml"),
  ];
  const ignored = new Set(["node_modules", "build", ".native"]);
  const unique = new Map();
  for (const root of roots) {
    for (const filename of filesUnder(repositoryRoot, root, { ignored })) {
      unique.set(normalizedRelative(repositoryRoot, filename), filename);
    }
  }
  const hash = createHash("sha256");
  let bytes = 0;
  const entries = [];
  for (const [name, filename] of [...unique.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const contents = readFileSync(filename);
    hash.update(name); hash.update("\0"); hash.update(contents); hash.update("\0");
    bytes += contents.byteLength;
    entries.push({ path: name, bytes: contents.byteLength, sha256: sha256Bytes(contents) });
  }
  return { sha256: hash.digest("hex"), files: unique.size, bytes, entries };
}

function lazyModuleSourceInputs(repositoryRoot, packageRoot) {
  const candidates = [
    join(packageRoot, "dist", "lazy-modules.json"),
    join(repositoryRoot, "dist", "lazy-modules.json"),
  ];
  const bundleFilename = candidates.find((filename) => existsSync(filename));
  if (bundleFilename === undefined) return [];
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(bundleFilename, "utf8"));
  } catch {
    throw new Error(`invalid production lazy-module bundle: ${bundleFilename}`);
  }
  return lazyModuleReceiptInputs(repositoryRoot, bundle);
}

function currentGitCommit(repositoryRoot) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function artifactFiles(layout) {
  const files = new Set();
  for (const module of layout.modules) files.add(module.artifact);
  for (const name of layout.hostAssets) files.add(name);
  for (const name of [
    "ffi-resource-adapter.c",
    "ffi-resource-backend.mjs",
    "ffi-resource-manifest.json",
    "m4ri-resource-adapter.c",
    "m4ri-resource-backend.mjs",
    "m4ri-resource-manifest.json",
    "plotly.min.js",
  ]) files.add(name);
  return [...files].sort();
}

function runtimeHostAssets(layout, packageRoot) {
  const policy = layout.runtimeHostAssets;
  if (policy === undefined) return [];
  if (policy.source !== "." || policy.destination !== "runtime" ||
      policy.serveDestination !== "." ||
      !Array.isArray(policy.includeExtensions)) {
    throw new Error("unsupported WebAssembly runtime host-asset policy");
  }
  const extensions = new Set(policy.includeExtensions);
  return readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && [...extensions].some((extension) => entry.name.endsWith(extension)))
    .map((entry) => ({
      source: join(packageRoot, entry.name),
      path: `${policy.destination}/${entry.name}`,
      servePath: entry.name,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function createArtifactTopology(layout, assets) {
  const policy = layout.artifactTopology;
  if (policy?.schema !== "sagejs.wasm-artifact-topology/v1" ||
      !Array.isArray(policy.groups) || policy.groups.length === 0) {
    throw new Error("production layout must declare an artifact topology");
  }
  const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
  const groupById = new Map();
  const ownerByAsset = new Map();
  const kinds = new Set(["eager", "specialist", "support"]);
  for (const group of policy.groups) {
    if (typeof group.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(group.id) ||
        groupById.has(group.id)) {
      throw new Error(`invalid or duplicate artifact group id: ${group.id}`);
    }
    if (!kinds.has(group.kind)) throw new Error(`invalid artifact group kind: ${group.id}`);
    if (!Array.isArray(group.dependencies) || !Array.isArray(group.assets) || group.assets.length === 0) {
      throw new Error(`artifact group ${group.id} must declare dependencies and assets`);
    }
    if (new Set(group.dependencies).size !== group.dependencies.length ||
        new Set(group.assets).size !== group.assets.length) {
      throw new Error(`artifact group ${group.id} contains duplicate dependencies or assets`);
    }
    if (canonicalJson(group.dependencies) !== canonicalJson([...group.dependencies].sort()) ||
        canonicalJson(group.assets) !== canonicalJson([...group.assets].sort())) {
      throw new Error(`artifact group ${group.id} dependencies and assets must be sorted`);
    }
    const budget = group.maximumCompressedDelta;
    for (const encoding of ["gzipBytes", "brotliBytes"]) {
      if (!Number.isSafeInteger(budget?.[encoding]) || budget[encoding] <= 0) {
        throw new Error(`artifact group ${group.id} has no positive ${encoding} budget`);
      }
    }
    groupById.set(group.id, group);
    for (const name of group.assets) {
      if (!assetByPath.has(name)) throw new Error(`artifact group ${group.id} names unknown asset ${name}`);
      if (ownerByAsset.has(name)) {
        throw new Error(`artifact ${name} belongs to multiple topology groups`);
      }
      if (group.kind === "support" && name.endsWith(".wasm")) {
        throw new Error(`WebAssembly asset ${name} cannot be hidden in support group ${group.id}`);
      }
      ownerByAsset.set(name, group.id);
    }
  }
  for (const name of assetByPath.keys()) {
    if (!ownerByAsset.has(name)) {
      throw new Error(`production asset has no reviewed topology group: ${name}`);
    }
  }
  const eagerGroups = policy.groups.filter(({ kind }) => kind === "eager");
  if (eagerGroups.length !== 1) {
    throw new Error(`artifact topology must declare exactly one eager group, found ${eagerGroups.length}`);
  }
  for (const group of policy.groups) {
    for (const dependency of group.dependencies) {
      if (!groupById.has(dependency)) {
        throw new Error(`artifact group ${group.id} has unknown dependency ${dependency}`);
      }
      if (group.kind === "eager" && groupById.get(dependency).kind !== "eager") {
        throw new Error(`eager group ${group.id} cannot depend on ${dependency}`);
      }
    }
  }
  const closures = new Map();
  const visiting = new Set();
  function dependencyClosure(id) {
    if (closures.has(id)) return closures.get(id);
    if (visiting.has(id)) throw new Error(`artifact topology dependency cycle includes ${id}`);
    visiting.add(id);
    const closure = new Set();
    for (const dependency of groupById.get(id).dependencies) {
      closure.add(dependency);
      for (const ancestor of dependencyClosure(dependency)) closure.add(ancestor);
    }
    visiting.delete(id);
    const result = [...closure].sort();
    closures.set(id, result);
    return result;
  }
  for (const module of layout.modules) {
    const group = groupById.get(ownerByAsset.get(module.artifact));
    const expectedKind = module.eager ? "eager" : "specialist";
    if (group?.kind !== expectedKind) {
      throw new Error(`module ${module.id} must belong to a ${expectedKind} artifact group`);
    }
  }
  const eagerId = eagerGroups[0].id;
  const groups = policy.groups.map((group) => {
    const dependencyClosureIds = dependencyClosure(group.id);
    if (group.kind === "specialist" && !dependencyClosureIds.includes(eagerId)) {
      throw new Error(`specialist artifact group ${group.id} must depend on ${eagerId}`);
    }
    const groupAssets = group.assets.map((name) => {
      const { path, bytes, sha256 } = assetByPath.get(name);
      return { path, bytes, sha256 };
    });
    const receipt = {
      id: group.id,
      kind: group.kind,
      dependencies: group.dependencies,
      dependencyClosure: dependencyClosureIds,
      maximumCompressedDelta: group.maximumCompressedDelta,
      assets: groupAssets,
    };
    return { ...receipt, identity: `sha256:${sha256Bytes(canonicalJson(receipt))}` };
  });
  const receipt = { schema: policy.schema, eagerGroup: eagerId, groups };
  return { ...receipt, identity: `sha256:${sha256Bytes(canonicalJson(receipt))}` };
}

function createArtifactManifest({ packageRoot, outputDirectory }) {
  const layoutFilename = join(packageRoot, "release", "production-layout.json");
  const layout = JSON.parse(readFileSync(layoutFilename, "utf8"));
  if (layout.schema !== "sagejs.wasm-production-layout/v1") {
    throw new Error("unsupported WebAssembly production layout schema");
  }
  const allArtifactFiles = new Set(artifactFiles(layout));
  const runtimeAssets = runtimeHostAssets(layout, packageRoot);
  for (const host of runtimeAssets) allArtifactFiles.add(host.path);
  const runtimeByPath = new Map(runtimeAssets.map((asset) => [asset.path, asset]));
  const assets = [...allArtifactFiles].sort().map((name) => {
    const filename = join(outputDirectory, name);
    if (!existsSync(filename) || !lstatSync(filename).isFile()) {
      throw new Error(`production WebAssembly asset is missing: ${name}`);
    }
    return {
      path: name,
      servePath: runtimeByPath.get(name)?.servePath ?? `${layout.distServeDestination}/${name}`,
      bytes: lstatSync(filename).size,
      sha256: sha256File(filename),
    };
  });
  const servePaths = new Set();
  for (const asset of assets) {
    if (asset.servePath.startsWith("/") || asset.servePath.split("/").includes("..")) {
      throw new Error(`unsafe production serve path: ${asset.servePath}`);
    }
    if (servePaths.has(asset.servePath)) throw new Error(`duplicate production serve path: ${asset.servePath}`);
    servePaths.add(asset.servePath);
  }
  const capabilitySource = JSON.parse(readFileSync(
    join(packageRoot, "release", "production-capabilities.json"),
    "utf8",
  ));
  if (capabilitySource.schema !== "sagejs.wasm-production-capabilities/v1") {
    throw new Error("unsupported WebAssembly production capability schema");
  }
  const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
  const capabilities = [];
  for (const [module, closure] of Object.entries(capabilitySource.modules).sort(([a], [b]) => a.localeCompare(b))) {
    const asset = assetByPath.get(closure.artifact);
    if (asset === undefined) throw new Error(`capability module ${module} names an unknown artifact`);
    for (const id of [
      ...closure.capabilities,
      ...(closure.additionalCapabilities ?? []),
    ]) {
      capabilities.push({ id, module, artifact: closure.artifact, artifactSha256: asset.sha256 });
    }
  }
  capabilities.sort((left, right) => left.id.localeCompare(right.id));
  const topology = createArtifactTopology(layout, assets);
  const ffiClosure = JSON.parse(readFileSync(
    join(outputDirectory, "ffi-production-closure.json"),
    "utf8",
  ));
  if (ffiClosure.schema !== "sagejs.ffi/wasm-production-closure-v1") {
    throw new Error("unsupported generated WebAssembly FFI closure schema");
  }
  const expectedCapabilities = [];
  for (const library of ffiClosure.libraries) {
    expectedCapabilities.push(...library.resources.map(
      (id) => `ffi-resource:${library.library}:${id}`,
    ));
    expectedCapabilities.push(...library.functions.map(
      (id) => `ffi:${library.library}:${id}`,
    ));
  }
  assertSameSet(
    Object.values(capabilitySource.modules).flatMap(({ capabilities: ids }) => ids),
    expectedCapabilities,
    "tracked production capabilities and adapter inputs",
  );
  const identity = sha256Bytes(canonicalJson({ layout, assets, capabilities, topology }));
  return {
    schema: artifactSchema,
    identity: `sha256:${identity}`,
    layout,
    assets,
    capabilities,
    topology,
  };
}

function assertSameSet(actual, expected, description) {
  const left = [...new Set(actual)].sort();
  const right = [...new Set(expected)].sort();
  if (canonicalJson(left) !== canonicalJson(right) || actual.length !== left.length) {
    const absent = right.filter((item) => !left.includes(item));
    const extra = left.filter((item) => !right.includes(item));
    throw new Error(
      `${description} differ; missing=[${absent.join(", ")}], extra=[${extra.join(", ")}]`,
    );
  }
}

function writeProductionReceipt({
  repositoryRoot,
  packageRoot,
  outputDirectory,
  toolchain,
  sourceInputs = [],
}) {
  const artifact = createArtifactManifest({ packageRoot, outputDirectory });
  const artifactFilename = join(outputDirectory, "production-manifest.json");
  writeFileSync(artifactFilename, `${JSON.stringify(artifact, null, 2)}\n`);
  const adapterInputs = readFileSync(join(packageRoot, "toolchain", "adapter-inputs.json"));
  const receipt = {
    schema: receiptSchema,
    source: {
      gitCommit: currentGitCommit(repositoryRoot),
      closure: sourceClosure(repositoryRoot, packageRoot, sourceInputs),
      adapterInputsSha256: sha256Bytes(adapterInputs),
    },
    toolchain: toolchainReceiptIdentity(toolchain),
    artifact,
    productionManifestSha256: sha256File(artifactFilename),
  };
  writeFileSync(
    join(outputDirectory, "build-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return receipt;
}

function validateProductionReceipt({ packageRoot, outputDirectory }) {
  const receiptFilename = join(outputDirectory, "build-receipt.json");
  if (!existsSync(receiptFilename)) return { valid: false, reason: "build receipt is missing" };
  const receipt = JSON.parse(readFileSync(receiptFilename, "utf8"));
  if (receipt.schema !== receiptSchema || receipt.artifact?.schema !== artifactSchema) {
    return { valid: false, reason: "build receipt schema is invalid" };
  }
  for (const asset of receipt.artifact.assets ?? []) {
    const filename = resolve(outputDirectory, asset.path);
    if (!filename.startsWith(`${realpathSync(outputDirectory)}${require("node:path").sep}`)) {
      return { valid: false, reason: `asset path escapes output: ${asset.path}` };
    }
    if (!existsSync(filename)) return { valid: false, reason: `asset is missing: ${asset.path}` };
    if (lstatSync(filename).size !== asset.bytes || sha256File(filename) !== asset.sha256) {
      return { valid: false, reason: `asset digest differs: ${asset.path}` };
    }
  }
  const identity = sha256Bytes(canonicalJson({
    layout: receipt.artifact.layout,
    assets: receipt.artifact.assets,
    capabilities: receipt.artifact.capabilities,
    topology: receipt.artifact.topology,
  }));
  if (receipt.artifact.identity !== `sha256:${identity}`) {
    return { valid: false, reason: "artifact identity differs" };
  }
  const manifestFilename = join(outputDirectory, "production-manifest.json");
  if (!existsSync(manifestFilename) || sha256File(manifestFilename) !== receipt.productionManifestSha256) {
    return { valid: false, reason: "production manifest digest differs" };
  }
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestFilename, "utf8")); } catch {
    return { valid: false, reason: "production manifest is invalid JSON" };
  }
  if (canonicalJson(manifest) !== canonicalJson(receipt.artifact)) {
    return { valid: false, reason: "production manifest and receipt artifact differ" };
  }
  return { valid: true, identity: receipt.artifact.identity, receipt };
}

module.exports = {
  artifactFiles,
  artifactSchema,
  createArtifactTopology,
  createArtifactManifest,
  lazyModuleSourceInputs,
  receiptSchema,
  runtimeHostAssets,
  sourceClosure,
  validateProductionReceipt,
  verifyWasmMemoryContract,
  wasmMemories,
  writeProductionReceipt,
};

if (require.main === module) {
  const command = process.argv[2] || "validate";
  if (command !== "validate") {
    console.error("usage: production-receipt.cjs [validate]");
    process.exitCode = 1;
  } else {
    const packageRoot = resolve(__dirname, "..");
    const result = validateProductionReceipt({
      packageRoot,
      outputDirectory: join(packageRoot, "dist"),
    });
    if (!result.valid) {
      console.error(`invalid WebAssembly production receipt: ${result.reason}`);
      process.exitCode = 1;
    } else {
      console.log(`WebAssembly production receipt valid: ${result.identity}`);
    }
  }
}

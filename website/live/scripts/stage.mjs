#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { validateCapabilityReport } from "../capability-report.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultAppRoot = path.resolve(scriptRoot, "..");
const defaultRepository = path.resolve(defaultAppRoot, "../..");
const REQUIRED_RUNTIME_HOSTS = [
  "compiler-worker.mjs",
  "evaluator.mjs",
  "index.mjs",
  "kernel-worker.mjs",
  "kernel.mjs",
  "m4ri.mjs",
  "plotly-renderer.mjs",
  "portable-matrix.mjs",
  "portable-polynomial.mjs",
];
const SHELL_EXCLUDED = new Set(["dist", "scripts", "test", "README.md"]);

async function sha256(filename) {
  return createHash("sha256").update(await readFile(filename)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function productionArtifactIdentity(manifest) {
  return `sha256:${createHash("sha256").update(canonicalJson({
    layout: manifest.layout,
    assets: manifest.assets,
    capabilities: manifest.capabilities,
  })).digest("hex")}`;
}

function safeRelative(value) {
  if (typeof value !== "string" || !value || path.isAbsolute(value)) {
    throw new TypeError("artifact path must be a nonempty relative path");
  }
  const normalized = value.replaceAll("\\", "/");
  if (normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new TypeError(`unsafe artifact path ${JSON.stringify(value)}`);
  }
  return normalized;
}

async function copyFileWithParents(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

async function copyTree(source, destination, excluded = new Set()) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(from, to, excluded);
    else if (entry.isFile()) await copyFileWithParents(from, to);
  }
}

async function json(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

function validateManifest(manifest, receipt, manifestSha256) {
  if (manifest.schema !== "sagejs.wasm-production-artifact/v1") {
    throw new Error(`unsupported production manifest schema ${JSON.stringify(manifest.schema)}`);
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(manifest.identity)) {
    throw new Error("production artifact identity is invalid");
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    throw new Error("production manifest has no assets");
  }
  if (receipt.schema !== "sagejs.wasm-build-receipt/v1") {
    throw new Error(`unsupported build receipt schema ${JSON.stringify(receipt.schema)}`);
  }
  if (!isDeepStrictEqual(receipt.artifact, manifest)) {
    throw new Error("build receipt artifact does not exactly match production-manifest.json");
  }
  if (!Array.isArray(manifest.capabilities)) throw new Error("production manifest has no capability closure");
  if (productionArtifactIdentity(manifest) !== manifest.identity) {
    throw new Error("production artifact identity does not match its authenticated closure");
  }
  if (receipt.productionManifestSha256 !== manifestSha256) {
    throw new Error("build receipt does not authenticate production-manifest.json");
  }
  return manifest.identity.slice("sha256:".length);
}

async function collectFiles(root, prefix = "./") {
  const answer = [];
  async function visit(directory, relative) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(child, name);
      else if (entry.isFile() && entry.name !== "_headers") answer.push(`${prefix}${name}`);
    }
  }
  await visit(root, "");
  return answer.sort();
}

export async function stageRelease({
  appRoot = defaultAppRoot,
  packageRoot = path.join(defaultRepository, "packages/flint-wasm"),
  capabilityReport = path.join(defaultRepository, "architecture/wasm-capabilities-report.json"),
  target = path.join(appRoot, "dist"),
} = {}) {
  appRoot = path.resolve(appRoot);
  packageRoot = path.resolve(packageRoot);
  capabilityReport = path.resolve(capabilityReport);
  target = path.resolve(target);
  if (target === appRoot || !target.startsWith(`${appRoot}${path.sep}`)) {
    throw new Error("stage target must be a child of the live application root");
  }

  const manifestFile = path.join(packageRoot, "dist/production-manifest.json");
  const receiptFile = path.join(packageRoot, "dist/build-receipt.json");
  const [manifest, receipt, manifestSha256] = await Promise.all([json(manifestFile), json(receiptFile), sha256(manifestFile)]);
  const identity = validateManifest(manifest, receipt, manifestSha256);
  const manifestPaths = new Set(manifest.assets.map((entry) => safeRelative(entry.path)));
  for (const name of REQUIRED_RUNTIME_HOSTS) {
    if (!manifestPaths.has(`runtime/${name}`)) {
      throw new Error(`authenticated production runtime is missing runtime/${name}`);
    }
  }
  const assetDirectory = `sha256-${identity}`;
  const runtimeTarget = path.join(target, "assets", assetDirectory);

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await copyTree(appRoot, target, SHELL_EXCLUDED);

  for (const entry of manifest.assets) {
    const relative = safeRelative(entry.path);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`invalid manifest record for ${relative}`);
    }
    const source = path.join(packageRoot, "dist", relative);
    const information = await stat(source);
    if (!information.isFile() || information.size !== entry.bytes) {
      throw new Error(`artifact size mismatch for ${relative}`);
    }
    if (await sha256(source) !== entry.sha256) {
      throw new Error(`artifact digest mismatch for ${relative}`);
    }
    const destination = relative.startsWith("runtime/")
      ? path.join(runtimeTarget, relative.slice("runtime/".length))
      : path.join(runtimeTarget, "dist", relative);
    await copyFileWithParents(source, destination);
  }

  await copyFileWithParents(manifestFile, path.join(runtimeTarget, "dist/production-manifest.json"));
  await copyFileWithParents(receiptFile, path.join(runtimeTarget, "dist/build-receipt.json"));
  const capabilityData = validateCapabilityReport(await json(capabilityReport));
  const capabilityRoot = path.resolve(path.dirname(capabilityReport), "..");
  const capabilitySource = path.resolve(capabilityRoot, capabilityData.source);
  if (!capabilitySource.startsWith(`${capabilityRoot}${path.sep}`)) {
    throw new Error("generated WebAssembly capability source escapes the repository");
  }
  if (!/^[a-f0-9]{64}$/.test(capabilityData.source_sha256) ||
      await sha256(capabilitySource) !== capabilityData.source_sha256) {
    throw new Error("generated WebAssembly capability report is stale");
  }
  await copyFileWithParents(capabilityReport, path.join(target, "wasm-capabilities-report.json"));

  const version = {
    schema: "org.sagejs.web/runtime-v1",
    revision: receipt.source?.gitCommit ?? receipt.source?.commit ?? receipt.commit ?? "unknown",
    artifactIdentity: manifest.identity,
    assetBase: `./assets/${assetDirectory}/`,
    builtAt: receipt.createdAt ?? receipt.builtAt ?? "unknown",
    modules: Array.isArray(manifest.layout?.modules) ? manifest.layout.modules.map((module) => ({
      id: String(module.id ?? module.name ?? module.artifact ?? "wasm-module"),
      ownershipDomain: String(module.ownershipDomain ?? "unknown"),
      loading: module.eager === true ? "eager" : module.eager === false ? "lazy" : String(module.loading ?? module.instantiation ?? "unknown"),
      memory: module.memory && Number.isSafeInteger(module.memory.pageBytes) &&
        Number.isSafeInteger(module.memory.initialPages) &&
        Number.isSafeInteger(module.memory.maximumPages) ? {
          pageBytes: module.memory.pageBytes,
          initialPages: module.memory.initialPages,
          maximumPages: module.memory.maximumPages,
        } : null,
    })) : [],
  };
  await writeFile(path.join(target, "runtime-version.json"), `${JSON.stringify(version, null, 2)}\n`);

  const assets = await collectFiles(target);
  const releaseHash = createHash("sha256");
  for (const relative of assets) {
    releaseHash.update(relative);
    releaseHash.update(await readFile(path.join(target, relative.slice(2))));
  }
  const release = releaseHash.digest("hex");
  const assetManifest = {
    schema: "org.sagejs.web/assets-v1",
    release,
    artifactIdentity: manifest.identity,
    assets: ["./", ...assets.filter((item) => item !== "./asset-manifest.json")],
  };
  await writeFile(path.join(target, "asset-manifest.json"), `${JSON.stringify(assetManifest, null, 2)}\n`);
  return { target, release, artifactIdentity: manifest.identity, assets: assetManifest.assets.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  stageRelease().then(
    (result) => process.stdout.write(`Staged Sage.js web release ${result.release} (${result.assets} assets) at ${result.target}\n`),
    (error) => { console.error(error.stack ?? error); process.exitCode = 1; },
  );
}

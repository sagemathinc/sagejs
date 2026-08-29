"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  attachIdentity,
  canonicalJson,
  contentIdentity,
  digest,
  identifier,
  repositoryPath,
  sha256,
} = require("../optimizer-development/common.cjs");
const { DEFAULT_REASON_REGISTRY } = require("../optimizer-development/reason-codes.cjs");
const { inspectBuildReceipt, receiptRelativePath } = require("../../scripts/build-receipt.cjs");
const { createDocument, SCHEMAS, validateEpoch, validateBySchema } = require("./contracts.cjs");
const {
  canonicalRecordStream,
  parseCanonicalRecordStream,
  writeStore,
} = require("./evidence-store.cjs");

const SOURCE_CLOSURE_SCHEMA = "sagejs.optimization-source-closure/v2";
const OUTPUT_MANIFEST_SCHEMA = "sagejs.optimization-build-output-manifest/v2";
const WORKLOAD_SET_SCHEMA = "sagejs.optimization-workload-set/v2";
const LOCATION_SCHEMA = "sagejs.optimization-epoch-location/v2";
const SCHEMA_DIRECTORY = path.resolve(__dirname, "../../architecture/optimization-engine");

function fail(message) {
  throw new Error(`optimization epoch service: ${message}`);
}

function runGit(root, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: options.encoding === null ? null : "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) fail(`git ${args.join(" ")} failed: ${String(result.stderr).trim()}`);
  return result.stdout;
}

function gitRevision(root) {
  const status = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return {
    commit: runGit(root, ["rev-parse", "HEAD"]).trim(),
    tree: runGit(root, ["rev-parse", "HEAD^{tree}"]).trim(),
    clean: status.trim() === "",
    status,
  };
}

function trackedEntries(root) {
  const output = runGit(root, ["ls-files", "-s", "-z"], { encoding: null });
  return output.toString("utf8").split("\0").filter(Boolean).map((entry) => {
    const match = /^(\d{6}) ([0-9a-f]{40}) (\d)\t([\s\S]+)$/.exec(entry);
    if (!match) fail("git index contains an unsupported entry");
    const [, mode, objectId, stage, repositoryFile] = match;
    if (stage !== "0") fail(`tracked path ${repositoryFile} has an unresolved index stage`);
    repositoryPath("tracked path", repositoryFile);
    return { mode, objectId, path: repositoryFile };
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function sourceClosure(root) {
  const records = trackedEntries(root).map((entry) => {
    if (entry.mode === "160000") {
      return { ...entry, kind: "gitlink", bytes: null, digest: entry.objectId };
    }
    const filename = path.join(root, ...entry.path.split("/"));
    const stat = fs.lstatSync(filename);
    if (entry.mode === "120000") {
      if (!stat.isSymbolicLink()) fail(`${entry.path} no longer matches its symlink index mode`);
      const target = fs.readlinkSync(filename);
      return {
        ...entry,
        kind: "symbolic-link",
        bytes: Buffer.byteLength(target),
        digest: sha256(target),
      };
    }
    if (!stat.isFile()) fail(`${entry.path} no longer matches its regular-file index mode`);
    const bytes = fs.readFileSync(filename);
    return {
      ...entry,
      kind: entry.mode === "100755" ? "executable-file" : "regular-file",
      bytes: bytes.length,
      digest: sha256(bytes),
    };
  });
  return attachIdentity(SOURCE_CLOSURE_SCHEMA, { records });
}

function walkOutput(root, relative, records) {
  const filename = path.join(root, ...relative.split("/"));
  const stat = fs.lstatSync(filename);
  if (stat.isSymbolicLink()) fail(`build output ${relative} is a symbolic link`);
  if (stat.isDirectory()) {
    records.push({ path: relative, kind: "directory", mode: stat.mode & 0o777, bytes: 0, digest: null });
    for (const child of fs.readdirSync(filename).sort()) {
      walkOutput(root, `${relative}/${child}`, records);
    }
    return;
  }
  if (!stat.isFile()) fail(`build output ${relative} has an unsupported type`);
  const bytes = fs.readFileSync(filename);
  records.push({
    path: relative,
    kind: "file",
    mode: stat.mode & 0o777,
    bytes: bytes.length,
    digest: sha256(bytes),
  });
}

function buildOutputManifest(root, receipt = null) {
  const parsed = receipt || JSON.parse(fs.readFileSync(path.join(root, receiptRelativePath), "utf8"));
  if (!Array.isArray(parsed.outputs) || parsed.outputs.length === 0) {
    fail("build receipt has no output witnesses");
  }
  const records = [];
  for (const output of [...new Set(parsed.outputs)].sort()) {
    repositoryPath("build output", output);
    const filename = path.join(root, ...output.split("/"));
    if (!fs.existsSync(filename)) fail(`build output is missing: ${output}`);
    walkOutput(root, output, records);
  }
  records.sort((left, right) => left.path.localeCompare(right.path));
  return attachIdentity(OUTPUT_MANIFEST_SCHEMA, { records });
}

function schemaRegistry() {
  const filenames = fs.readdirSync(SCHEMA_DIRECTORY)
    .filter((name) => name.endsWith("-v2.schema.json"))
    .sort();
  const entries = filenames.map((name) => {
    const bytes = fs.readFileSync(path.join(SCHEMA_DIRECTORY, name));
    return { path: `architecture/optimization-engine/${name}`, digest: sha256(bytes) };
  });
  return attachIdentity("sagejs.optimization-schema-registry/v2", { entries });
}

function workloadSet(workloads) {
  const checked = workloads.map((workload) => validateBySchema(workload));
  if (checked.some((workload) => workload.schema !== SCHEMAS.workload)) {
    fail("workload set contains a non-workload document");
  }
  const workloadIds = checked.map((workload) => workload.id).sort();
  if (new Set(workloadIds).size !== workloadIds.length) fail("workload set contains duplicates");
  return attachIdentity(WORKLOAD_SET_SCHEMA, { workloadIds });
}

function fileDigest(root, relative) {
  return sha256(fs.readFileSync(path.join(root, ...relative.split("/"))));
}

function epochProducerIdentity() {
  const relative = "tools/optimization-engine/epoch-service.cjs";
  return contentIdentity("sagejs.optimization-epoch-producer/v2", {
    path: relative,
    digest: sha256(fs.readFileSync(__filename)),
  });
}

function defaultStoreRoot(root) {
  const common = runGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
  return path.join(common, "sagejs-optimization-engine");
}

function assertSafeStoreRoot(storeRoot) {
  const resolved = path.resolve(storeRoot);
  const prohibited = new Set([path.parse(resolved).root, path.resolve("/home"), path.resolve("/home/user")]);
  if (prohibited.has(resolved)) fail(`refusing unsafe store root ${resolved}`);
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    fail("store root must not be a symbolic link");
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function createEpoch({
  root,
  workloads,
  components = [],
  profiler,
  build = true,
  buildCommand = ["pnpm", "build"],
  runCommand = spawnSync,
  argv = ["node", "scripts/optimization-epoch.cjs", "create"],
  revisionInspector = gitRevision,
  buildInspector = inspectBuildReceipt,
  closureInspector = sourceClosure,
  outputInspector = buildOutputManifest,
} = {}) {
  root = path.resolve(root || path.resolve(__dirname, "../.."));
  let revision = revisionInspector(root);
  if (!revision.clean) fail("epoch creation requires a clean checkout");
  if (build) {
    const result = runCommand(buildCommand[0], buildCommand.slice(1), {
      cwd: root,
      stdio: "inherit",
    });
    if (result.status !== 0) fail(`build command failed with status ${result.status}`);
  }
  revision = revisionInspector(root);
  if (!revision.clean) fail("build changed the tracked checkout");
  const inspected = buildInspector(root);
  if (!inspected.current) fail(`build receipt is not current: ${inspected.reason}`);
  const closure = closureInspector(root);
  const receiptBytes = fs.readFileSync(path.join(root, receiptRelativePath));
  const outputManifest = outputInspector(root);
  const set = workloadSet(workloads);
  const registry = schemaRegistry();
  const normalizedComponents = components.map((component) => ({ ...component }))
    .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
  const epoch = createDocument("epoch", {
    authority: {
      kind: "trusted-integration",
      producer: "optimization.epoch-service.v2",
      validatedInputIds: [closure.id, outputManifest.id, set.id, registry.id].sort(),
    },
    revision: {
      commit: revision.commit,
      tree: revision.tree,
      clean: true,
      repositorySourceClosureId: closure.id,
    },
    build: {
      receiptPath: receiptRelativePath,
      receiptDigest: sha256(receiptBytes),
      outputManifestId: outputManifest.id,
      outputDigest: sha256(canonicalJson(outputManifest.records)),
      sourceClosureId: closure.id,
    },
    catalogId: set.id,
    workloadIds: set.workloadIds,
    runtime: {
      node: process.version,
      engine: process.versions.v8,
      operatingSystem: process.platform,
      architecture: process.arch,
      capabilities: normalizedComponents.map((component) => component.kind)
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort(),
    },
    components: normalizedComponents,
    profiler,
    reasonRegistryId: DEFAULT_REASON_REGISTRY.id,
    schemaRegistryId: registry.id,
    producer: { implementationId: epochProducerIdentity(), argv },
  });
  return Object.freeze({ epoch, closure, outputManifest, workloadSet: set, schemaRegistry: registry });
}

function epochBindings({
  epoch,
  root,
  workloads = null,
  revisionInspector = gitRevision,
  buildInspector = inspectBuildReceipt,
  closureInspector = sourceClosure,
  outputInspector = buildOutputManifest,
  receiptDigestInspector = fileDigest,
} = {}) {
  try {
    validateEpoch(epoch);
    root = path.resolve(root || path.resolve(__dirname, "../.."));
    const revision = revisionInspector(root);
    const reasons = [];
    if (!revision.clean) reasons.push("checkout-dirty");
    if (revision.commit !== epoch.revision.commit) reasons.push("commit-changed");
    if (revision.tree !== epoch.revision.tree) reasons.push("tree-changed");
    const closure = closureInspector(root);
    if (closure.id !== epoch.revision.repositorySourceClosureId) reasons.push("source-closure-changed");
    const build = buildInspector(root);
    if (!build.current) reasons.push(`build-${build.reason}`);
    const receiptDigest = receiptDigestInspector(root, receiptRelativePath);
    if (receiptDigest !== epoch.build.receiptDigest) reasons.push("build-receipt-changed");
    const outputManifest = outputInspector(root);
    if (outputManifest.id !== epoch.build.outputManifestId) reasons.push("build-output-changed");
    if (workloads) {
      const set = workloadSet(workloads);
      if (set.id !== epoch.catalogId) reasons.push("workload-set-changed");
    }
    return deepBinding(reasons.length === 0 ? "exact-current" : "historical", reasons);
  } catch (error) {
    return deepBinding("invalid", [error.message]);
  }
}

function deepBinding(state, reasons) {
  return Object.freeze({ state, actionable: state === "exact-current", reasons: Object.freeze(reasons) });
}

function verifyEpoch(options = {}) {
  const binding = epochBindings(options);
  if (options.requireCurrent !== false && !binding.actionable) {
    fail(`epoch is not current: ${binding.reasons.join(", ")}`);
  }
  return binding;
}

function allocateLaneScratch({ epoch, laneId, root, storeRoot = null } = {}) {
  validateEpoch(epoch);
  identifier("optimization lane", laneId);
  const base = assertSafeStoreRoot(storeRoot || defaultStoreRoot(root));
  const directory = path.join(base, "epochs", epoch.id.slice("sha256:".length), "lanes", laneId);
  fs.mkdirSync(path.join(directory, "records"), { recursive: true });
  fs.mkdirSync(path.join(directory, "attachments"), { recursive: true });
  return directory;
}

function ingestLaneEvidence({ epoch, laneId, root, documents, storeRoot = null } = {}) {
  verifyEpoch({ epoch, root, requireCurrent: true });
  for (const document of documents) {
    const checked = validateBySchema(document);
    if (checked.binding && checked.binding.epochId !== epoch.id) {
      fail(`document ${checked.id} belongs to another epoch`);
    }
  }
  const directory = allocateLaneScratch({ epoch, laneId, root, storeRoot });
  const stream = canonicalRecordStream(documents);
  const filename = path.join(directory, "records", `${stream.logicalId.slice(7)}.canonical.ndjson`);
  fs.writeFileSync(filename, stream.bytes, { flag: "wx" });
  verifyEpoch({ epoch, root, requireCurrent: true });
  return Object.freeze({ filename, logicalId: stream.logicalId, documents: documents.length });
}

function sealEvidenceStore({ epoch, laneIds, root, storeRoot = null } = {}) {
  verifyEpoch({ epoch, root, requireCurrent: true });
  const base = assertSafeStoreRoot(storeRoot || defaultStoreRoot(root));
  const epochRoot = path.join(base, "epochs", epoch.id.slice(7));
  const documents = [];
  for (const laneId of [...laneIds].sort()) {
    identifier("optimization lane", laneId);
    const records = path.join(epochRoot, "lanes", laneId, "records");
    if (!fs.existsSync(records)) fail(`lane ${laneId} has no evidence shard`);
    for (const name of fs.readdirSync(records).sort()) {
      if (!name.endsWith(".canonical.ndjson")) fail(`unexpected lane record ${name}`);
      documents.push(...parseCanonicalRecordStream(fs.readFileSync(path.join(records, name))).records
        .map((record) => record.document));
    }
  }
  const sealed = path.join(epochRoot, "sealed");
  if (fs.existsSync(sealed)) fail("epoch evidence store is already sealed");
  const manifest = writeStore(sealed, [epoch, ...documents]);
  verifyEpoch({ epoch, root, requireCurrent: true });
  return manifest;
}

function writeLocationSidecar({ epoch, root, storeRoot = null, filename } = {}) {
  validateEpoch(epoch);
  const payload = {
    schema: LOCATION_SCHEMA,
    epochId: epoch.id,
    buildRoot: path.resolve(root),
    storeRoot: assertSafeStoreRoot(storeRoot || defaultStoreRoot(root)),
  };
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
  return payload;
}

module.exports = Object.freeze({
  LOCATION_SCHEMA,
  OUTPUT_MANIFEST_SCHEMA,
  SOURCE_CLOSURE_SCHEMA,
  WORKLOAD_SET_SCHEMA,
  allocateLaneScratch,
  buildOutputManifest,
  createEpoch,
  defaultStoreRoot,
  epochBindings,
  gitRevision,
  ingestLaneEvidence,
  schemaRegistry,
  sealEvidenceStore,
  sourceClosure,
  verifyEpoch,
  workloadSet,
  writeLocationSidecar,
});

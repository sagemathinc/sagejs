#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const zlib = require("node:zlib");
const { canonicalJson } = require("../../wasm-toolchain/scripts/toolchain.cjs");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function manifestFileNames(manifest) {
  const files = manifest.assets ?? manifest.files ?? manifest.artifacts;
  if (Array.isArray(files)) {
    return files.map((item) => typeof item === "string" ? item : item.path ?? item.file);
  }
  if (files && typeof files === "object") return Object.keys(files);
  throw new Error("production manifest has no files or artifacts collection");
}

function expectedFileRecord(manifest, filename) {
  const files = manifest.assets ?? manifest.files ?? manifest.artifacts;
  if (Array.isArray(files)) {
    return files.find((item) =>
      (typeof item === "string" ? item : item.path ?? item.file) === filename,
    );
  }
  return files[filename];
}

function wasmMemories(bytes) {
  if (!bytes.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) {
    throw new Error("invalid WebAssembly header");
  }
  let offset = 8;
  const readUleb = () => {
    let answer = 0;
    let shift = 0;
    for (;;) {
      if (offset >= bytes.length || shift > 35) throw new Error("malformed Wasm LEB128");
      const byte = bytes[offset++];
      answer += (byte & 127) * 2 ** shift;
      if ((byte & 128) === 0) return answer;
      shift += 7;
    }
  };
  const readName = () => {
    const length = readUleb();
    if (offset + length > bytes.length) throw new Error("truncated Wasm name");
    offset += length;
  };
  const readLimits = (imported) => {
    const flags = readUleb();
    const initialPages = readUleb();
    const maximumPages = (flags & 1) === 1 ? readUleb() : null;
    if ((flags & ~3) !== 0) throw new Error(`unsupported Wasm memory flags ${flags}`);
    return { imported, shared: (flags & 2) === 2, initialPages, maximumPages };
  };
  const memories = [];
  while (offset < bytes.length) {
    const section = bytes[offset++];
    const length = readUleb();
    const end = offset + length;
    if (end > bytes.length) throw new Error("truncated Wasm section");
    if (section === 2) {
      const count = readUleb();
      for (let index = 0; index < count; index += 1) {
        readName();
        readName();
        const kind = bytes[offset++];
        if (kind === 0) readUleb();
        else if (kind === 1) {
          offset += 1;
          readLimits(false);
        } else if (kind === 2) memories.push(readLimits(true));
        else if (kind === 3) offset += 2;
        else if (kind === 4) {
          readUleb();
          readUleb();
        } else throw new Error(`unsupported Wasm import kind ${kind}`);
      }
    } else if (section === 5) {
      const count = readUleb();
      for (let index = 0; index < count; index += 1) memories.push(readLimits(false));
    }
    offset = end;
  }
  return memories;
}

function layoutModules(manifest) {
  const modules = manifest.layout?.modules;
  if (Array.isArray(modules)) return modules;
  if (modules && typeof modules === "object") {
    return Object.entries(modules).map(([id, value]) => ({ id, ...value }));
  }
  return [];
}

function importedMemoryDomains(manifest) {
  const domains = manifest.layout?.importedMemoryDomains ?? [];
  if (!Array.isArray(domains)) {
    throw new Error("production layout importedMemoryDomains must be an array");
  }
  return domains;
}

function validateWasmMemory(filename, memory, manifest) {
  const modules = layoutModules(manifest);
  const module = modules.find((item) =>
    (item.artifact ?? item.path ?? item.file) === filename,
  );
  if (module) {
    if (
      memory.length !== 1 ||
      memory[0].imported ||
      memory[0].shared ||
      memory[0].maximumPages === null
    ) {
      throw new Error(`${filename} must define exactly one bounded, non-shared memory`);
    }
    const expected = module.memory;
    if (
      expected?.pageBytes !== 65536 ||
      expected.initialPages !== memory[0].initialPages ||
      expected.maximumPages !== memory[0].maximumPages
    ) {
      throw new Error(`${filename} memory does not match the production layout`);
    }
    return;
  }

  const domains = importedMemoryDomains(manifest);
  const domain = domains.find((item) =>
    item.provider === filename || item.consumers?.includes(filename),
  );
  if (!domain) throw new Error(`${filename} has no production memory contract`);
  if (
    !domain.memory ||
    domain.memory.pageBytes !== 65536 ||
    !Number.isSafeInteger(domain.memory.initialPages) ||
    !Number.isSafeInteger(domain.memory.maximumPages) ||
    domain.memory.initialPages < 1 ||
    domain.memory.maximumPages < domain.memory.initialPages
  ) {
    throw new Error(`${filename} has an invalid imported-memory domain contract`);
  }
  if (memory.length !== 1 || !memory[0].imported || memory[0].shared) {
    throw new Error(`${filename} must import exactly one non-shared memory`);
  }
  // Emscripten's runtime module imports the same JavaScript-owned memory as
  // each grammar. Its Wasm declaration is an acceptance envelope, not the
  // allocator: the authenticated compiler frontend constructs the memory
  // using this stricter production contract. It is therefore safe (and
  // desirable on mobile) for the actual maximum to be lower than the generic
  // upper bound baked into the upstream runtime binary.
  if (
    memory[0].initialPages > domain.memory.initialPages ||
    (memory[0].maximumPages !== null &&
      domain.memory.maximumPages > memory[0].maximumPages)
  ) {
    throw new Error(`${filename} cannot accept the bounded provider memory`);
  }
}

function validateRelative(filename) {
  if (
    typeof filename !== "string" ||
    filename === "" ||
    path.isAbsolute(filename) ||
    filename.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`unsafe artifact path ${JSON.stringify(filename)}`);
  }
}

function payloadGroups(manifest, files) {
  const topology = manifest.topology;
  if (topology === undefined) return [];
  if (topology.schema !== "sagejs.wasm-artifact-topology/v1" ||
      !Array.isArray(topology.groups) || topology.groups.length === 0) {
    throw new Error("production manifest has an invalid authenticated artifact topology");
  }
  const { identity: topologyIdentity, ...topologyReceipt } = topology;
  if (topologyIdentity !== `sha256:${sha256(canonicalJson(topologyReceipt))}`) {
    throw new Error("artifact topology identity differs from its receipt");
  }
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const owned = new Set();
  const groups = topology.groups.map((group) => {
    const { identity: groupIdentity, ...groupReceipt } = group;
    if (groupIdentity !== `sha256:${sha256(canonicalJson(groupReceipt))}`) {
      throw new Error(`artifact group ${group.id} identity differs from its receipt`);
    }
    if (!Array.isArray(group.assets) || group.assets.length === 0) {
      throw new Error(`artifact group ${group.id} has no assets`);
    }
    const groupFiles = group.assets.map((asset) => {
      const file = fileByPath.get(asset.path);
      if (!file) throw new Error(`artifact group ${group.id} names missing file ${asset.path}`);
      if (owned.has(file.path)) throw new Error(`artifact file ${file.path} belongs to multiple groups`);
      if (file.sha256 !== asset.sha256 || file.bytes !== asset.bytes) {
        throw new Error(`artifact group ${group.id} receipt differs for ${asset.path}`);
      }
      owned.add(file.path);
      return file;
    });
    const compressed_delta = groupFiles.reduce((totals, file) => ({
      bytes: totals.bytes + file.bytes,
      gzip_bytes: totals.gzip_bytes + file.gzip_bytes,
      brotli_bytes: totals.brotli_bytes + file.brotli_bytes,
    }), { bytes: 0, gzip_bytes: 0, brotli_bytes: 0 });
    return {
      id: group.id,
      kind: group.kind,
      dependencies: group.dependencies,
      dependency_closure: group.dependencyClosure,
      identity: groupIdentity,
      files: groupFiles.map(({ path: filename }) => filename),
      compressed_delta,
      maximum_compressed_delta: {
        gzip_bytes: group.maximumCompressedDelta?.gzipBytes,
        brotli_bytes: group.maximumCompressedDelta?.brotliBytes,
      },
    };
  });
  for (const file of files) {
    if (!owned.has(file.path)) throw new Error(`artifact file has no topology group: ${file.path}`);
  }
  return groups;
}

function inspectProductionArtifact(distDirectory) {
  const root = path.resolve(distDirectory);
  const manifestPath = path.join(root, "production-manifest.json");
  const buildReceiptPath = path.join(root, "build-receipt.json");
  const manifestBytes = fs.readFileSync(manifestPath);
  const buildReceiptBytes = fs.readFileSync(buildReceiptPath);
  const manifest = JSON.parse(manifestBytes);
  const buildReceipt = JSON.parse(buildReceiptBytes);
  if (buildReceipt.schema !== "sagejs.wasm-build-receipt/v1") {
    throw new Error(`unsupported Wasm build receipt schema ${buildReceipt.schema}`);
  }
  if (manifest.schema !== "sagejs.wasm-production-artifact/v1") {
    throw new Error(`unsupported Wasm production manifest schema ${manifest.schema}`);
  }
  const manifestDigest = sha256(manifestBytes);
  if (buildReceipt.productionManifestSha256 !== manifestDigest) {
    throw new Error("build receipt does not authenticate production-manifest.json");
  }
  if (!isDeepStrictEqual(buildReceipt.artifact, manifest)) {
    throw new Error("build receipt artifact does not exactly match production-manifest.json");
  }
  const names = [...new Set(manifestFileNames(manifest))].sort();
  const servePaths = new Set();
  for (const asset of manifest.assets) {
    validateRelative(asset.servePath);
    if (servePaths.has(asset.servePath)) {
      throw new Error(`duplicate deployment servePath ${asset.servePath}`);
    }
    servePaths.add(asset.servePath);
  }
  if (names.length === 0) throw new Error("production manifest describes no artifacts");
  const files = names.map((filename) => {
    validateRelative(filename);
    const absolute = path.resolve(root, filename);
    if (!absolute.startsWith(`${root}${path.sep}`)) {
      throw new Error(`artifact escapes distribution directory: ${filename}`);
    }
    const bytes = fs.readFileSync(absolute);
    if (filename.endsWith(".wasm") && !bytes.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) {
      throw new Error(`${filename} does not have the WebAssembly magic header`);
    }
    if (filename.endsWith(".wasm")) {
      const memory = wasmMemories(bytes);
      validateWasmMemory(filename, memory, manifest);
    }
    const expected = expectedFileRecord(manifest, filename);
    const digest = sha256(bytes);
    const expectedDigest = expected && typeof expected === "object"
      ? expected.sha256 ?? expected.digest
      : undefined;
    const expectedBytes = expected && typeof expected === "object"
      ? expected.bytes ?? expected.size
      : undefined;
    if (expectedDigest !== undefined && expectedDigest !== digest) {
      throw new Error(`${filename} digest does not match production manifest`);
    }
    if (expectedBytes !== undefined && expectedBytes !== bytes.length) {
      throw new Error(`${filename} size does not match production manifest`);
    }
    return {
      path: filename,
      bytes: bytes.length,
      sha256: digest,
      gzip_bytes: zlib.gzipSync(bytes, { level: 9, mtime: 0 }).length,
      brotli_bytes: zlib.brotliCompressSync(bytes, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
          [zlib.constants.BROTLI_PARAM_MODE]: filename.endsWith(".wasm")
            ? zlib.constants.BROTLI_MODE_GENERIC
            : zlib.constants.BROTLI_MODE_TEXT,
        },
      }).length,
    };
  });
  const totals = files.reduce((result, item) => ({
    bytes: result.bytes + item.bytes,
    gzip_bytes: result.gzip_bytes + item.gzip_bytes,
    brotli_bytes: result.brotli_bytes + item.brotli_bytes,
  }), { bytes: 0, gzip_bytes: 0, brotli_bytes: 0 });
  return {
    schema: "sagejs.browser-wasm-release-artifact/v1",
    production_manifest_sha256: manifestDigest,
    build_receipt_sha256: sha256(buildReceiptBytes),
    source_revision:
      buildReceipt.source_revision ??
      buildReceipt.source?.revision ??
      buildReceipt.source?.gitCommit ??
      null,
    artifact_identity: buildReceipt.artifact?.identity ?? manifest.identity ?? null,
    files,
    payload_groups: payloadGroups(manifest, files),
    totals,
  };
}

function reviewedTopologyLimits(budget, groupIds) {
  if (budget === null || budget === undefined) return new Map();
  if (budget.schema !== "sagejs.browser-wasm-budget/v1") {
    throw new Error(`unsupported browser Wasm budget schema ${budget.schema}`);
  }
  const value = budget.artifact_topology_limits;
  if (value === undefined) return new Map();
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("artifact_topology_limits must be an object");
  }
  const limits = new Map();
  for (const [groupId, limit] of Object.entries(value)) {
    if (!groupIds.has(groupId)) {
      throw new Error(`artifact_topology_limits names unknown group ${groupId}`);
    }
    if (limit === null || typeof limit !== "object" || Array.isArray(limit)) {
      throw new Error(`artifact_topology_limits.${groupId} must be an object`);
    }
    const keys = Object.keys(limit).sort();
    if (!isDeepStrictEqual(keys, ["brotli_bytes", "gzip_bytes"])) {
      throw new Error(
        `artifact_topology_limits.${groupId} must contain exactly gzip_bytes and brotli_bytes`,
      );
    }
    for (const encoding of keys) {
      if (!Number.isSafeInteger(limit[encoding]) || limit[encoding] <= 0) {
        throw new Error(
          `artifact_topology_limits.${groupId}.${encoding} must be a positive safe integer`,
        );
      }
    }
    limits.set(groupId, limit);
  }
  return limits;
}

function enforceTopologyBudgets(report, budget = null) {
  const failures = [];
  if (!Array.isArray(report.payload_groups) || report.payload_groups.length === 0) {
    return ["authenticated artifact topology is absent"];
  }
  const limits = reviewedTopologyLimits(
    budget,
    new Set(report.payload_groups.map((group) => group.id)),
  );
  for (const group of report.payload_groups) {
    for (const encoding of ["gzip_bytes", "brotli_bytes"]) {
      const actual = group.compressed_delta?.[encoding];
      const maximum =
        limits.get(group.id)?.[encoding] ?? group.maximum_compressed_delta?.[encoding];
      if (!Number.isSafeInteger(maximum) || maximum <= 0) {
        failures.push(`${group.id} has no positive ${encoding} delta budget`);
      } else if (actual > maximum) {
        failures.push(`${group.id} ${encoding} delta ${actual} exceeds ${maximum}`);
      }
    }
  }
  return failures;
}

function compareArtifacts(left, right, { includeBuildReceipt = true } = {}) {
  const differences = [];
  if (left.production_manifest_sha256 !== right.production_manifest_sha256) {
    differences.push("production manifest bytes differ");
  }
  if (includeBuildReceipt &&
      left.build_receipt_sha256 !== right.build_receipt_sha256) {
    differences.push("build receipt bytes differ");
  }
  const byPath = (report) => new Map(report.files.map((item) => [item.path, item]));
  const leftFiles = byPath(left);
  const rightFiles = byPath(right);
  for (const filename of [...new Set([...leftFiles.keys(), ...rightFiles.keys()])].sort()) {
    const a = leftFiles.get(filename);
    const b = rightFiles.get(filename);
    if (!a || !b) differences.push(`${filename} is absent from one build`);
    else if (a.sha256 !== b.sha256) differences.push(`${filename} differs`);
  }
  return differences;
}

function enforceBudget(report, baseline, { requireBaseline = false } = {}) {
  const failures = [];
  if (baseline.schema !== "sagejs.browser-wasm-budget/v1") {
    throw new Error(`unsupported browser Wasm budget schema ${baseline.schema}`);
  }
  const expected = baseline.artifact_baseline;
  if (!expected) {
    if (requireBaseline) failures.push("reviewed artifact_baseline is absent");
    return failures;
  }
  const growth = baseline.thresholds?.compressed_growth_fraction;
  if (!Number.isFinite(growth) || growth < 0) {
    throw new Error("compressed_growth_fraction must be a nonnegative finite number");
  }
  for (const encoding of ["gzip_bytes", "brotli_bytes"]) {
    const maximum = expected.totals[encoding] * (1 + growth);
    if (report.totals[encoding] > maximum) {
      failures.push(`${encoding} ${report.totals[encoding]} exceeds ${Math.floor(maximum)}`);
    }
  }
  return failures;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (require.main === module) {
  try {
    const dist = argument("--dist") ?? path.resolve(__dirname, "..", "dist");
    const report = inspectProductionArtifact(dist);
    const budgetPath = argument("--budget");
    const budget = budgetPath ? JSON.parse(fs.readFileSync(budgetPath)) : null;
    const topologyFailures = enforceTopologyBudgets(report, budget);
    if (topologyFailures.length) {
      throw new Error(`artifact topology budget failed:\n${topologyFailures.join("\n")}`);
    }
    const compare = argument("--compare");
    if (compare) {
      const differences = compareArtifacts(report, inspectProductionArtifact(compare));
      if (differences.length) throw new Error(`artifact is not reproducible:\n${differences.join("\n")}`);
    }
    const comparePayload = argument("--compare-payload");
    if (comparePayload) {
      const differences = compareArtifacts(
        report,
        inspectProductionArtifact(comparePayload),
        { includeBuildReceipt: false },
      );
      if (differences.length) {
        throw new Error(`cross-platform payload differs:\n${differences.join("\n")}`);
      }
    }
    if (budget !== null) {
      const failures = enforceBudget(
        report,
        budget,
        { requireBaseline: process.argv.includes("--require-baseline") },
      );
      if (failures.length) throw new Error(`payload budget failed:\n${failures.join("\n")}`);
    }
    const output = argument("--output");
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (output) {
      fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
      fs.writeFileSync(output, serialized);
    } else {
      process.stdout.write(serialized);
    }
  } catch (error) {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  }
}

module.exports = {
  compareArtifacts,
  enforceBudget,
  enforceTopologyBudgets,
  inspectProductionArtifact,
  manifestFileNames,
  payloadGroups,
  sha256,
  wasmMemories,
};

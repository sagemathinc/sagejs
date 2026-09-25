#!/usr/bin/env node
"use strict";

// A byte-bound engineering inventory for release review, NOT an SBOM or a
// distribution approval. In particular, ELF dynamic imports cannot identify
// every statically linked Rust crate or LGPL library.

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceInput(relative) {
  const filename = path.join(root, relative);
  return { path: relative, sha256: sha256(fs.readFileSync(filename)) };
}

function parseElfInspection(header, programHeaders, dynamic) {
  const field = (label) => {
    const match = header.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "m"));
    if (!match) throw new Error(`readelf did not report ${label}`);
    return match[1].trim();
  };
  const interpreter = programHeaders.match(/Requesting program interpreter:\s*([^\]]+)\]/);
  const needed = [...dynamic.matchAll(/\(NEEDED\)\s+Shared library:\s*\[([^\]]+)\]/g)]
    .map((match) => match[1]);
  return {
    elfClass: field("Class"),
    machine: field("Machine"),
    interpreter: interpreter ? interpreter[1] : null,
    neededSharedLibraries: [...new Set(needed)].sort(),
  };
}

function inspectElf(filename) {
  const inspect = (flag) => execFileSync("readelf", [flag, filename], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseElfInspection(inspect("-h"), inspect("-l"), inspect("-d"));
}

function inspectWasm(bytes) {
  const module = new WebAssembly.Module(bytes);
  return {
    imports: WebAssembly.Module.imports(module).map(({ module: name, name: symbol, kind }) => ({
      module: name, name: symbol, kind,
    })),
    exports: WebAssembly.Module.exports(module).map(({ name, kind }) => ({ name, kind })),
  };
}

function artifact(kind, filename) {
  const absolute = path.resolve(filename);
  const bytes = fs.readFileSync(absolute);
  return {
    kind,
    path: absolute,
    sha256: sha256(bytes),
    sizeBytes: bytes.length,
    ...(kind === "elf" ? inspectElf(absolute) : inspectWasm(bytes)),
  };
}

function inventory(arguments_) {
  if (arguments_.length === 0 || arguments_.length % 2 !== 0) {
    throw new Error("usage: class-group-artifact-inventory --elf PATH [--wasm PATH]");
  }
  const artifacts = [];
  const seen = new Set();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const filename = arguments_[index + 1];
    if (!["--elf", "--wasm"].includes(flag) || !filename || seen.has(flag)) {
      throw new Error("usage: class-group-artifact-inventory --elf PATH [--wasm PATH]");
    }
    seen.add(flag);
    artifacts.push(artifact(flag.slice(2), filename));
  }
  const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root, encoding: "utf8",
  }).trim();
  const sourceStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: root, encoding: "utf8",
  }).trim();
  return {
    schema: "sagejs.class-groups/artifact-engineering-inventory/v1",
    purpose: "technical pre-review only; not an SBOM or distribution approval",
    sourceRevision,
    sourceStatus,
    sourceAssociation: "unverified-local-build; source revision is not proof of artifact provenance",
    sourceInputs: [
      "packages/class-groups/Cargo.toml",
      "packages/class-groups/Cargo.lock",
      "packages/class-groups/provenance.json",
      "architecture/native-code.json",
    ].map(sourceInput),
    artifacts,
    missingForDistribution: [
      "human/legal approval and reviewed source-file receipts",
      "artifact-derived static Rust and native-library closure for each target",
      "complete applicable license and notice texts",
      "corresponding-source and tested LGPL relink materials or approved alternative",
      "independent source-to-artifact build receipt and other platform artifacts",
    ],
  };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(inventory(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { inventory, inspectWasm, parseElfInspection };

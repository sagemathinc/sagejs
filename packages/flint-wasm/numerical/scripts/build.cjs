#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { join, relative, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { brotliCompressSync, gzipSync } = require("node:zlib");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "../../..");
const lock = JSON.parse(readFileSync(join(packageRoot, "sources/cminpack-lock.json"), "utf8"));
const { inspectToolchain, resolveToolchain } = require(
  join(repositoryRoot, "packages/wasm-toolchain/scripts/toolchain.cjs"),
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filename) {
  return sha256(readFileSync(filename));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function prefixMapFlags(source, destination) {
  return ["file", "debug", "macro"].map(
    (kind) => `-f${kind}-prefix-map=${source}=${destination}`,
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with ${result.status}` +
        (result.stderr ? `:\n${result.stderr}` : ""),
    );
  }
  return result;
}

async function fetchLockedArchive(path) {
  if (existsSync(path)) {
    const existing = readFileSync(path);
    if (sha256(existing) === lock.cminpack.archive_sha256) return;
    throw new Error(`cached cminpack archive has the wrong digest: ${path}`);
  }
  const response = await fetch(lock.cminpack.archive, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`cminpack archive download failed: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== lock.cminpack.archive_sha256) {
    throw new Error(`cminpack archive digest mismatch: ${digest}`);
  }
  writeFileSync(path, bytes);
}

async function main() {
  const inspection = inspectToolchain({ root: repositoryRoot });
  if (!inspection.ready) {
    throw new Error(
      "Sage.js Wasm toolchain is not ready; run " +
        "`pnpm --dir packages/wasm-toolchain toolchain:prepare`",
    );
  }
  const toolchain = resolveToolchain({ root: repositoryRoot });
  const buildRoot = join(packageRoot, "build");
  const archive = join(buildRoot, `${lock.cminpack.revision}.tar.gz`);
  const sourceParent = join(buildRoot, "source");
  const sourceRoot = join(sourceParent, `cminpack-${lock.cminpack.revision}`);
  const output = join(buildRoot, "cminpack.wasm");
  const oracleOutput = join(buildRoot, "mgh-oracle.wasm");
  mkdirSync(buildRoot, { recursive: true });
  await fetchLockedArchive(archive);
  if (!existsSync(join(sourceRoot, "include/cminpack.h"))) {
    mkdirSync(sourceParent, { recursive: true });
    run("tar", ["-xzf", archive, "-C", sourceParent]);
  }

  const upstreamLicense = join(sourceRoot, lock.cminpack.license_file);
  const distributedLicense = join(packageRoot, "licenses/CopyrightMINPACK.txt");
  if (sha256File(upstreamLicense) !== lock.cminpack.license_sha256 ||
      sha256File(distributedLicense) !== lock.cminpack.distributed_license_sha256 ||
      readFileSync(upstreamLicense, "utf8").trimEnd() !==
        readFileSync(distributedLicense, "utf8").trimEnd()) {
    throw new Error("cminpack upstream or distributed license identity mismatch");
  }
  for (const [field, expected] of [
    ["cases", lock.cminpack.qualification.cases_sha256],
    ["lmdif_reference", lock.cminpack.qualification.lmdif_reference_sha256],
    ["lmder_reference", lock.cminpack.qualification.lmder_reference_sha256],
  ]) {
    const filename = join(sourceRoot, lock.cminpack.qualification[field]);
    if (sha256File(filename) !== expected) {
      throw new Error(`cminpack qualification input identity mismatch: ${filename}`);
    }
  }

  const sources = [
    "src/dpmpar.c",
    "src/enorm.c",
    "src/fdjac2.c",
    "src/lmdif.c",
    "src/lmder.c",
    "src/lmpar.c",
    "src/qrfac.c",
    "src/qrsolv.c",
  ].map((path) => join(sourceRoot, path));
  const commonArgs = [
    `--target=${toolchain.lock.build.target}`,
    `--sysroot=${toolchain.paths.sysroot}`,
    "-mexec-model=reactor",
    "-O3",
    "-ffp-contract=off",
    "-fvisibility=hidden",
    "-fno-strict-aliasing",
    "-Wall",
    "-Wextra",
    "-Werror",
    ...prefixMapFlags(repositoryRoot, "/sagejs/source"),
    ...prefixMapFlags(sourceRoot, "/sagejs/upstream/cminpack"),
    ...prefixMapFlags(toolchain.root, "/sagejs/toolchain"),
    // Upstream documentation names source globs such as `src/*.c` inside a C
    // block comment. Clang diagnoses the slash-star substring as `-Wcomment`.
    "-Wno-comment",
    "-DCMINPACK_NO_DLL",
    `-I${join(sourceRoot, "include")}`,
    `-I${join(sourceRoot, "src")}`,
  ];
  const args = [
    ...commonArgs,
    join(packageRoot, "src/cminpack-adapter.c"),
    ...sources,
    "-Wl,--allow-undefined",
    "-Wl,--export=p3_alloc",
    "-Wl,--export=p3_free",
    "-Wl,--export=p3_live_allocations",
    "-Wl,--export=p3_live_bytes",
    "-Wl,--export=p3_lm_solve",
    "-Wl,--export=p3_set_allocation_failure_after",
    "-Wl,--export-memory",
    "-Wl,--initial-memory=2097152",
    "-Wl,--max-memory=134217728",
    "-Wl,--gc-sections",
    "-lm",
    "-o",
    output,
  ];
  run(toolchain.paths.clang, args);

  const oracleArgs = [
    ...commonArgs,
    `-I${join(sourceRoot, "examples")}`,
    join(packageRoot, "qualification/mgh-oracle-adapter.c"),
    join(sourceRoot, "examples/ssqfcn.c"),
    join(sourceRoot, "examples/ssqjac.c"),
    join(sourceRoot, "examples/ssqipt.c"),
    "-Wl,--export=mgh_alloc",
    "-Wl,--export=mgh_free",
    "-Wl,--export=mgh_initial",
    "-Wl,--export=mgh_residual",
    "-Wl,--export=mgh_jacobian",
    "-Wl,--export-memory",
    "-Wl,--initial-memory=1048576",
    "-Wl,--max-memory=16777216",
    "-Wl,--gc-sections",
    "-lm",
    "-o",
    oracleOutput,
  ];
  run(toolchain.paths.clang, oracleArgs);

  const bytes = readFileSync(output);
  const module = new WebAssembly.Module(bytes);
  const oracleBytes = readFileSync(oracleOutput);
  const oracleModule = new WebAssembly.Module(oracleBytes);
  const normalizePath = (value) => value
    .replaceAll(toolchain.root, "<toolchain>")
    .replaceAll(sourceRoot, "<cminpack>")
    .replaceAll(repositoryRoot, "<repository>");
  const compileFlags = args.slice(0, -2).map(normalizePath);
  const sourceInputs = [
    join(packageRoot, "scripts/build.cjs"),
    join(packageRoot, "index.mjs"),
    join(packageRoot, "src/cminpack-adapter.c"),
    join(packageRoot, "sources/cminpack-lock.json"),
    distributedLicense,
    join(sourceRoot, "include/cminpack.h"),
    join(sourceRoot, "src/minpackP.h"),
    ...sources,
  ].map((filename) => ({
    path: filename.startsWith(sourceRoot)
      ? `<cminpack>/${relative(sourceRoot, filename).replaceAll("\\", "/")}`
      : relative(repositoryRoot, filename).replaceAll("\\", "/"),
    sha256: sha256File(filename),
    bytes: readFileSync(filename).byteLength,
  })).sort((left, right) => left.path.localeCompare(right.path));
  const report = {
    schema: "sagejs.numerical-wasm-build/v1",
    source: lock.cminpack,
    source_closure: {
      sha256: sha256(Buffer.from(canonicalJson(sourceInputs))),
      inputs: sourceInputs,
      license_verified: true,
    },
    toolchain: {
      identity: toolchain.lockDigest,
      target: toolchain.lock.build.target,
      floating_point_contract: "off",
      compile_flags: compileFlags,
    },
    artifact: {
      path: "build/cminpack.wasm",
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      gzip_bytes: gzipSync(bytes, { level: 9 }).byteLength,
      brotli_bytes: brotliCompressSync(bytes).byteLength,
      imports: WebAssembly.Module.imports(module),
      exports: WebAssembly.Module.exports(module),
      memory: {
        initial_bytes: 2097152,
        maximum_bytes: 134217728,
      },
    },
    qualification_oracle: {
      path: "build/mgh-oracle.wasm",
      sha256: sha256(oracleBytes),
      bytes: oracleBytes.byteLength,
      imports: WebAssembly.Module.imports(oracleModule),
      exports: WebAssembly.Module.exports(oracleModule),
    },
  };
  const productionManifest = join(packageRoot, "release/production-manifest.json");
  if (existsSync(productionManifest)) {
    const expected = JSON.parse(readFileSync(productionManifest, "utf8"));
    for (const [name, actual, wanted] of [
      ["artifact SHA-256", report.artifact.sha256, expected.artifact.sha256],
      ["source closure SHA-256", report.source_closure.sha256,
        expected.source_closure.sha256],
      ["toolchain identity", report.toolchain.identity, expected.toolchain.identity],
      ["ABI identity", sha256(Buffer.from(canonicalJson({
        imports: report.artifact.imports,
        exports: report.artifact.exports,
        memory: report.artifact.memory,
      }))), expected.abi.sha256],
    ]) {
      if (actual !== wanted) {
        throw new Error(`numerical production manifest ${name} differs: ${actual}`);
      }
    }
    if (expected.qualification_receipt != null) {
      const receiptPath = join(packageRoot, expected.qualification_receipt.path);
      if (!existsSync(receiptPath) ||
          sha256File(receiptPath) !== expected.qualification_receipt.sha256) {
        throw new Error("numerical production qualification receipt differs");
      }
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      if (receipt.artifact_sha256 !== report.artifact.sha256 ||
          receipt.oracle_sha256 !== report.qualification_oracle.sha256 ||
          receipt.source_revision !== lock.cminpack.revision) {
        throw new Error("numerical qualification receipt is not bound to this build");
      }
    }
  }
  writeFileSync(
    join(buildRoot, "build-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

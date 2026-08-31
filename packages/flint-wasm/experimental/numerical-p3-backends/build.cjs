#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { brotliCompressSync, gzipSync } = require("node:zlib");

const packageRoot = __dirname;
const repositoryRoot = resolve(packageRoot, "../../../..");
const lock = JSON.parse(readFileSync(join(packageRoot, "source-lock.json"), "utf8"));
const { inspectToolchain, resolveToolchain } = require(
  join(repositoryRoot, "packages/wasm-toolchain/scripts/toolchain.cjs"),
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
  const output = join(buildRoot, "p3-cminpack.wasm");
  mkdirSync(buildRoot, { recursive: true });
  await fetchLockedArchive(archive);
  if (!existsSync(join(sourceRoot, "include/cminpack.h"))) {
    mkdirSync(sourceParent, { recursive: true });
    run("tar", ["-xzf", archive, "-C", sourceParent]);
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
  const args = [
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
    // Upstream documentation names source globs such as `src/*.c` inside a C
    // block comment. Clang diagnoses the slash-star substring as `-Wcomment`.
    "-Wno-comment",
    "-DCMINPACK_NO_DLL",
    `-I${join(sourceRoot, "include")}`,
    `-I${join(sourceRoot, "src")}`,
    join(packageRoot, "adapter.c"),
    ...sources,
    "-Wl,--allow-undefined",
    "-Wl,--export=p3_alloc",
    "-Wl,--export=p3_free",
    "-Wl,--export=p3_live_allocations",
    "-Wl,--export=p3_lm_solve",
    "-Wl,--export-memory",
    "-Wl,--initial-memory=2097152",
    "-Wl,--max-memory=134217728",
    "-Wl,--gc-sections",
    "-lm",
    "-o",
    output,
  ];
  run(toolchain.paths.clang, args);

  const bytes = readFileSync(output);
  const module = new WebAssembly.Module(bytes);
  const report = {
    schema: "sagejs.numerical-p3-prototype-build/v1",
    source: lock.cminpack,
    toolchain: {
      identity: toolchain.lockDigest,
      target: toolchain.lock.build.target,
      floating_point_contract: "off",
    },
    artifact: {
      path: "build/p3-cminpack.wasm",
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      gzip_bytes: gzipSync(bytes, { level: 9 }).byteLength,
      brotli_bytes: brotliCompressSync(bytes).byteLength,
      imports: WebAssembly.Module.imports(module),
      exports: WebAssembly.Module.exports(module),
    },
  };
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

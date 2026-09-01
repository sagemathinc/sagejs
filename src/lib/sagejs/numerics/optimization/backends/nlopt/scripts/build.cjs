#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { basename, dirname, join, relative, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { brotliCompressSync, gzipSync } = require("node:zlib");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "../../../../../../..");
const lock = JSON.parse(readFileSync(join(packageRoot, "source-lock.json"), "utf8"));
const { inspectToolchain, resolveToolchain } = require(
  join(repositoryRoot, "packages/wasm-toolchain/scripts/toolchain.cjs"),
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
        (result.stdout ? `:\n${result.stdout}` : "") +
        (result.stderr ? `\n${result.stderr}` : ""),
    );
  }
  return result;
}

async function fetchLockedArchive(path) {
  if (existsSync(path)) {
    const existing = readFileSync(path);
    if (sha256(existing) === lock.nlopt.archive_sha256) return;
    throw new Error(`cached NLopt archive has the wrong digest: ${path}`);
  }
  const response = await fetch(lock.nlopt.archive, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`NLopt archive download failed: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== lock.nlopt.archive_sha256) {
    throw new Error(`NLopt archive digest mismatch: ${digest}`);
  }
  writeFileSync(path, bytes);
}

function prefixMapFlags(source, destination) {
  return ["file", "debug", "macro"].map(
    (kind) => `-f${kind}-prefix-map=${source}=${destination}`,
  );
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
  const objectRoot = join(buildRoot, "objects");
  const archive = join(buildRoot, `${lock.nlopt.revision}.tar.gz`);
  const sourceParent = join(buildRoot, "source");
  const sourceRoot = join(sourceParent, `nlopt-${lock.nlopt.revision}`);
  const configRoot = join(buildRoot, "config");
  const output = join(buildRoot, "nlopt-methods.wasm");
  mkdirSync(buildRoot, { recursive: true });
  mkdirSync(objectRoot, { recursive: true });
  mkdirSync(configRoot, { recursive: true });
  await fetchLockedArchive(archive);
  if (!existsSync(join(sourceRoot, "src/api/nlopt.h"))) {
    mkdirSync(sourceParent, { recursive: true });
    run("tar", ["-xzf", archive, "-C", sourceParent]);
  }

  const upstreamLicense = readFileSync(join(sourceRoot, lock.nlopt.license_file));
  if (sha256(upstreamLicense) !== lock.nlopt.license_sha256) {
    throw new Error("pinned upstream NLopt license digest mismatch");
  }
  const distributedLicense = readFileSync(join(packageRoot, "licenses/COPYING"));
  if (sha256(distributedLicense) !== lock.nlopt.distributed_license_sha256 ||
      !distributedLicense.equals(upstreamLicense)) {
    throw new Error("distributed NLopt license is not byte-identical to upstream");
  }
  if (lock.nlopt.cmake_policy.NLOPT_LUKSAN !== false ||
      lock.nlopt.cmake_policy.NLOPT_CXX !== false) {
    throw new Error("the source lock must disable Luksan and C++ algorithms");
  }

  const config = [
    "#define BUGFIX_VERSION 0",
    "#define MAJOR_VERSION 2",
    "#define MINOR_VERSION 11",
    "#define HAVE_COPYSIGN 1",
    "#define HAVE_FPCLASSIFY 1",
    "#define HAVE_ISINF 1",
    "#define HAVE_ISNAN 1",
    "#define HAVE_STDINT_H 1",
    "#define HAVE_UINT32_T 1",
    "#define SIZEOF_UNSIGNED_INT 4",
    "#define SIZEOF_UNSIGNED_LONG 4",
    "#define THREADLOCAL __thread",
    "",
  ].join("\n");
  writeFileSync(join(configRoot, "nlopt_config.h"), config);
  const silentStdio = [
    "#include <stdio.h>",
    "#undef stderr",
    "#define stderr ((FILE *)0)",
    "",
  ].join("\n");
  writeFileSync(join(configRoot, "sagejs_nlopt_silent_stdio.h"), silentStdio);

  const compiledSources = [
    "src/algs/neldermead/nldrmd.c",
    "src/util/stop.c",
    "src/util/redblack.c",
    "src/util/rescale.c",
  ];
  const closureFiles = [
    "COPYING",
    "CMakeLists.txt",
    "nlopt_config.h.in",
    "src/api/nlopt.h",
    "src/algs/neldermead/README",
    "src/algs/neldermead/neldermead.h",
    "src/algs/neldermead/nldrmd.c",
    "src/util/nlopt-util.h",
    "src/util/redblack.h",
    "src/util/redblack.c",
    "src/util/rescale.c",
    "src/util/stop.c",
  ];
  for (const path of [...compiledSources, ...closureFiles]) {
    if (/luksan|esch|ags/i.test(path)) {
      throw new Error(`disallowed licensed source entered closure: ${path}`);
    }
    if (!existsSync(join(sourceRoot, path))) {
      throw new Error(`missing locked NLopt source closure file: ${path}`);
    }
  }
  const sourceClosure = [
    ...closureFiles.map((path) => ({
      path,
      sha256: sha256(readFileSync(join(sourceRoot, path))),
    })),
    { path: "generated/nlopt_config.h", sha256: sha256(config) },
    {
      path: "generated/sagejs_nlopt_silent_stdio.h",
      sha256: sha256(silentStdio),
    },
    {
      path: "sagejs/src/adapter.c",
      sha256: sha256(readFileSync(join(packageRoot, "src/adapter.c"))),
    },
  ];
  const sourceClosureSha256 = sha256(canonicalJson(sourceClosure));

  const includeFlags = [
    `-I${configRoot}`,
    `-I${join(sourceRoot, "src/api")}`,
    `-I${join(sourceRoot, "src/util")}`,
    `-I${join(sourceRoot, "src/algs/neldermead")}`,
  ];
  const common = [
    `--target=${toolchain.lock.build.target}`,
    `--sysroot=${toolchain.paths.sysroot}`,
    "-O3",
    "-ffp-contract=off",
    "-fvisibility=hidden",
    "-ffunction-sections",
    "-fdata-sections",
    "-fno-strict-aliasing",
    "-fno-math-errno",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-Wno-unused-parameter",
    "-Wno-sign-compare",
    ...includeFlags,
    ...prefixMapFlags(sourceRoot, "/usr/src/nlopt"),
    ...prefixMapFlags(packageRoot, "/usr/src/sagejs-nlopt-adapter"),
  ];
  const adapterObject = join(objectRoot, "adapter.o");
  run(toolchain.paths.clang, [
    ...common,
    "-c",
    join(packageRoot, "src/adapter.c"),
    "-o",
    adapterObject,
  ]);
  const upstreamObjects = [];
  for (const path of compiledSources) {
    const object = join(
      objectRoot,
      `${path.replaceAll("/", "_").replace(/\.c$/, "")}.o`,
    );
    run(toolchain.paths.clang, [
      ...common,
      "-Dmalloc=sagejs_nlopt_heap_malloc",
      "-Dcalloc=sagejs_nlopt_heap_calloc",
      "-Drealloc=sagejs_nlopt_heap_realloc",
      "-Dfree=sagejs_nlopt_heap_free",
      "-Dfprintf=sagejs_nlopt_fprintf",
      "-Dvsnprintf=sagejs_nlopt_vsnprintf",
      "-include",
      join(configRoot, "sagejs_nlopt_silent_stdio.h"),
      "-c",
      join(sourceRoot, path),
      "-o",
      object,
    ]);
    upstreamObjects.push(object);
  }
  run(toolchain.paths.clang, [
    `--target=${toolchain.lock.build.target}`,
    `--sysroot=${toolchain.paths.sysroot}`,
    "-mexec-model=reactor",
    adapterObject,
    ...upstreamObjects,
    "-Wl,--allow-undefined",
    "-Wl,--export=sagejs_nlopt_alloc",
    "-Wl,--export=sagejs_nlopt_free",
    "-Wl,--export=sagejs_nlopt_live_allocations",
    "-Wl,--export=sagejs_nlopt_live_bytes",
    "-Wl,--export=sagejs_nlopt_set_allocation_failure_after",
    "-Wl,--export=sagejs_nlopt_probe_callback",
    "-Wl,--export=sagejs_nlopt_solve",
    "-Wl,--export-memory",
    "-Wl,--initial-memory=2097152",
    "-Wl,--max-memory=134217728",
    "-Wl,--gc-sections",
    "-lm",
    "-o",
    output,
  ]);

  const bytes = readFileSync(output);
  const module = new WebAssembly.Module(bytes);
  const imports = WebAssembly.Module.imports(module);
  if (imports.length !== 1 || imports[0].module !== "sagejs_numerical_nlopt" ||
      imports[0].name !== "evaluate" || imports[0].kind !== "function") {
    throw new Error(`unexpected final NLopt imports: ${JSON.stringify(imports)}`);
  }
  const forbiddenNeedles = ["luksan", "esch", "plis", "plip", "pnet"];
  const artifactText = bytes.toString("latin1").toLowerCase();
  const forbiddenArtifactStrings = forbiddenNeedles.filter((name) =>
    artifactText.includes(name));
  if (forbiddenArtifactStrings.length > 0) {
    throw new Error(
      `forbidden NLopt families found in final artifact: ${forbiddenArtifactStrings}`,
    );
  }

  const report = {
    schema: "sagejs.numerical-nlopt-build/v1",
    source: lock.nlopt,
    source_closure: {
      sha256: sourceClosureSha256,
      files: sourceClosure,
      compiled_sources: compiledSources,
      rejected_source_patterns: ["src/algs/luksan/", "src/algs/esch/", "src/algs/ags/"],
    },
    toolchain: {
      identity: toolchain.lockDigest,
      target: toolchain.lock.build.target,
      floating_point_contract: "off",
    },
    artifact: {
      filename: basename(output),
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      gzip_bytes: gzipSync(bytes, { level: 9 }).byteLength,
      brotli_bytes: brotliCompressSync(bytes).byteLength,
      imports,
      exports: WebAssembly.Module.exports(module),
      initial_memory_bytes: 2097152,
      maximum_memory_bytes: 134217728,
    },
    methods: ["nlopt-nelder-mead"],
    selection: "explicit-only",
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

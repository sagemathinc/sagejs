"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { dirname, join, relative, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const { generateHostCore } = require("./c-backend.cjs");
const { lowerSource } = require("./ir.cjs");
const {
  portableKernelIdentity,
  sha256,
} = require("./portable-identity.cjs");
const {
  classifyWasmFunction,
  generateWasmBridge,
} = require("./wasm-bridge.cjs");

const WASM_PACK_SCHEMA = "sagejs.native-wasm-pack/v1";
const WASM_PACK_IDENTITY_SCHEMA = "sagejs.native-wasm-pack-identity/v1";

function sha256File(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function sourceKey(source) {
  const prefix = "src/lib/";
  if (!source.startsWith(prefix)) {
    throw new Error(`production kernel is outside ${prefix}: ${source}`);
  }
  return source.slice(prefix.length);
}

function domainFor(identity) {
  const dependencies = new Set(identity.canonicalCore.audit.nativeDependencies);
  return dependencies.has("FLINT") || identity.foreignDeclarations.length !== 0
    ? "flint"
    : dependencies.has("MPC") || dependencies.has("MPFR")
      ? "analytic"
      : "gmp";
}

function packIdentity(domain, modules) {
  const identity = {
    schema: WASM_PACK_IDENTITY_SCHEMA,
    domain,
    modules: modules.map((module) => ({
      logicalSource: module.logicalSource,
      sourceHash: module.identity.sourceHash,
      abiHash: module.identity.abiHash,
      coreHash: module.identity.coreHash,
      oracleIdentity: module.identity.oracleIdentity,
      identityHash: module.identity.identityHash,
      foreignDeclarations: module.identity.foreignDeclarations,
      functions: module.functions.map((fn) => fn.name),
    })),
  };
  return { identity, packKey: sha256(JSON.stringify(identity)) };
}

async function inventoryProductionKernels({ root, manifestPath }) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const production = manifest.kernels.filter((kernel) =>
    kernel.id.endsWith("-production")
  );
  if (production.length === 0) {
    throw new Error("native kernel manifest has no production kernels");
  }
  const modules = [];
  const inventory = [];
  for (const kernel of production) {
    const sourcePath = join(root, kernel.source);
    const logicalSource = sourceKey(kernel.source);
    const source = readFileSync(sourcePath, "utf8");
    const sourceHash = sha256(source);
    const ir = await lowerSource(source, sourcePath, {
      functions: kernel.functions,
    });
    const identity = portableKernelIdentity({ ir, sourceHash, logicalSource });
    const functions = kernel.functions.map((name) => {
      const fn = ir.functions.find((candidate) => candidate.name === name);
      if (fn === undefined) {
        throw new Error(`${kernel.id} did not lower requested function ${name}`);
      }
      const classification = classifyWasmFunction(fn, ir);
      return {
        name,
        declarationHash: identity.functionDeclarations[name],
        kernelKind: fn.kernelKind,
        status: classification.supported ? "compiled-source" : "unsupported",
        ...(classification.supported
          ? { results: classification.results }
          : {
            reason: classification.reason,
            ...(classification.resources === undefined
              ? {}
              : { resources: classification.resources }),
          }),
      };
    });
    const supported = functions.filter((fn) => fn.status === "compiled-source");
    const domain = domainFor(identity);
    const record = {
      id: kernel.id,
      source: kernel.source,
      logicalSource,
      sourceHash,
      abiHash: identity.abiHash,
      coreHash: identity.coreHash,
      oracleIdentity: identity.oracleIdentity,
      identityHash: identity.identityHash,
      moduleIdentity: identity.moduleIdentity,
      domain,
      fallback: kernel.fallback,
      oracles: kernel.oracles ?? [],
      tests: kernel.benchmark === undefined ? [] : [kernel.benchmark],
      foreignDeclarations: identity.foreignDeclarations,
      functions,
    };
    inventory.push(record);
    // Every production source is emitted, even when its current public
    // functions need an ownership-domain resource adapter. This keeps the
    // canonical core/source/ABI identities complete and lets the linker drop
    // an uncallable core without pretending it was never assessed.
    modules.push({
      ...record,
      sourcePath,
      source,
      ir,
      identity,
      functions: supported,
    });
  }
  const nonProduction = manifest.kernels
    .filter((kernel) => !kernel.id.endsWith("-production"))
    .map((kernel) => ({
      id: kernel.id,
      source: kernel.source,
      status: "not-production",
      reason: kernel.optional_foreign_libraries?.includes("m4ri")
        ? "separate-m4ri-ownership-domain"
        : kernel.optional_foreign_libraries?.includes("fflas")
          ? "optional-fflas-desktop-accelerator"
          : "development-witness-not-in-production-registry",
      fallback: kernel.fallback,
      oracles: kernel.oracles ?? [],
      tests: kernel.benchmark === undefined ? [] : [kernel.benchmark],
      functions: kernel.functions.map((name) => ({
        name,
        status: "not-production",
      })),
    }));
  return {
    inventory,
    modules,
    production,
    nonProduction,
    registered: manifest.kernels,
  };
}

function emitModule(outputRoot, module) {
  const directory = join(
    outputRoot,
    "sources",
    module.identity.moduleIdentity,
  );
  mkdirSync(directory, { recursive: true });
  const core = generateHostCore(module.ir, {
    moduleIdentity: module.identity.moduleIdentity,
  });
  const bridge = generateWasmBridge({
    ir: module.ir,
    moduleIdentity: module.identity.moduleIdentity,
    functionNames: module.functions.map((fn) => fn.name),
  });
  if (core.source.includes('#include "ffi_shims.h"')) {
    throw new Error(
      `${module.logicalSource} requires an exception shield; ` +
      "the Wasm C++ shield generator is not enabled",
    );
  }
  writeFileSync(join(directory, "kernel_core.c"), core.source);
  writeFileSync(join(directory, "kernel_core.h"), core.header);
  writeFileSync(join(directory, "wasm_bridge.c"), bridge.source);
  return {
    ...module,
    directory,
    core,
    bridge,
  };
}

function requirePath(description, filename) {
  if (!existsSync(filename)) {
    throw new Error(`missing ${description}: ${filename}`);
  }
}

function compilerVersion(clang) {
  const result = spawnSync(clang, ["--version"], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`unable to identify Wasm compiler ${clang}`);
  }
  return result.stdout.trim().split("\n")[0];
}

function domainConfiguration(domain, toolchain) {
  const gmp = toolchain.gmpPrefix;
  if (domain === "gmp") {
    return {
      prefixes: [gmp],
      libraries: ["gmp", "m", "wasi-emulated-signal",
        "wasi-emulated-getpid"],
    };
  }
  if (domain === "flint") {
    return {
      prefixes: [toolchain.flintPrefix, toolchain.mpfrPrefix, gmp],
      libraries: ["flint", "mpfr", "gmp", "m", "wasi-emulated-signal"],
    };
  }
  if (domain === "analytic") {
    return {
      prefixes: [toolchain.mpcPrefix, toolchain.mpfrPrefix, gmp],
      libraries: ["mpc", "mpfr", "gmp", "m", "wasi-emulated-signal"],
    };
  }
  throw new Error(`unknown Wasm kernel ownership domain ${domain}`);
}

function availableLibraries(configuration, toolchain) {
  const optionalWasiLibraries = new Set(["wasi-emulated-getpid"]);
  return configuration.libraries.filter((library) => {
    if (!optionalWasiLibraries.has(library)) return true;
    return existsSync(join(
      toolchain.sysroot,
      "lib",
      "wasm32-wasi",
      `lib${library}.a`,
    ));
  });
}

function toolchainReceipt(toolchain, configuration) {
  const archives = configuration.prefixes.map((prefix) => {
    const library = configuration.libraries.find((name) =>
      existsSync(join(prefix, "lib", `lib${name}.a`))
    );
    if (library === undefined) return { prefix, archive: null, sha256: null };
    const archive = join(prefix, "lib", `lib${library}.a`);
    return { prefix, archive, sha256: sha256File(archive) };
  });
  return {
    clang: resolve(toolchain.clang),
    clangVersion: compilerVersion(toolchain.clang),
    sysroot: resolve(toolchain.sysroot),
    archives,
  };
}

function buildDomain({ root, outputRoot, domain, modules, packKey, toolchain }) {
  const configuration = domainConfiguration(domain, toolchain);
  configuration.libraries = availableLibraries(configuration, toolchain);
  requirePath("WASI clang", toolchain.clang);
  requirePath("WASI sysroot", toolchain.sysroot);
  for (const prefix of configuration.prefixes) {
    requirePath("Wasm dependency include directory", join(prefix, "include"));
  }
  for (const library of configuration.libraries) {
    if (["m", "wasi-emulated-signal", "wasi-emulated-getpid"].includes(
      library,
    )) continue;
    const archive = configuration.prefixes
      .map((prefix) => join(prefix, "lib", `lib${library}.a`))
      .find(existsSync);
    requirePath(`${library} Wasm archive`, archive ?? `lib${library}.a`);
  }
  const directory = join(outputRoot, "packs", domain);
  mkdirSync(directory, { recursive: true });
  const wasmPath = join(directory, `${packKey}.wasm`);
  const compatibilityPath = join(directory, "wasi_compat.c");
  writeFileSync(compatibilityPath, `#include <stdlib.h>
/* GMP reaches this only for fatal invalid-operation signaling. */
__attribute__((weak)) int kill(int pid, int signal)
{
    (void) pid;
    (void) signal;
    abort();
}
`);
  const exports = modules.flatMap((module) => module.bridge.exports);
  const args = [
    "--target=wasm32-wasi",
    `--sysroot=${toolchain.sysroot}`,
    "-mexec-model=reactor",
    // `-O2` avoids pathological compile time and memory on the largest exact
    // proof kernels while retaining the optimizer passes relevant to Wasm.
    "-O2",
    "-fvisibility=hidden",
    "-ffunction-sections",
    "-fdata-sections",
    "-D_WASI_EMULATED_SIGNAL",
    ...configuration.prefixes.flatMap((prefix) => [
      "-isystem",
      join(prefix, "include"),
    ]),
    `-I${join(root, "packages", "flint", "include")}`,
    ...modules.flatMap((module) => [
      join(module.directory, "kernel_core.c"),
      join(module.directory, "wasm_bridge.c"),
    ]),
    compatibilityPath,
    ...configuration.prefixes.map((prefix) => `-L${join(prefix, "lib")}`),
    ...configuration.libraries.map((library) => `-l${library}`),
    ...exports.map((name) => `-Wl,--export=${name}`),
    "-Wl,--export-memory",
    "-Wl,--gc-sections",
    "-o",
    wasmPath,
  ];
  const result = spawnSync(toolchain.clang, args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`Wasm ${domain} pack compiler exited ${result.status}`);
  }
  return {
    asset: relative(outputRoot, wasmPath).replaceAll("\\", "/"),
    bytes: statSync(wasmPath).size,
    sha256: sha256File(wasmPath),
    exports: exports.sort(),
    toolchain: toolchainReceipt(toolchain, configuration),
  };
}

async function buildWasmProductionPacks(options) {
  const root = resolve(options.root);
  const outputRoot = resolve(options.outputRoot);
  const manifestPath = resolve(options.manifestPath);
  mkdirSync(outputRoot, { recursive: true });
  const discovered = await inventoryProductionKernels({ root, manifestPath });
  const emitted = discovered.modules.map((module) =>
    emitModule(outputRoot, module)
  );
  const domains = new Map();
  for (const module of emitted) {
    const modules = domains.get(module.domain) ?? [];
    modules.push(module);
    domains.set(module.domain, modules);
  }
  const requestedDomains = options.domains === undefined
    ? new Set(domains.keys())
    : new Set(options.domains);
  const packs = [];
  for (const [domain, unsorted] of [...domains].sort()) {
    const modules = unsorted.sort((left, right) =>
      left.logicalSource.localeCompare(right.logicalSource)
    );
    const { identity, packKey } = packIdentity(domain, modules);
    const built = options.emitOnly || !requestedDomains.has(domain)
      ? null
      : buildDomain({
        root,
        outputRoot,
        domain,
        modules,
        packKey,
        toolchain: options.toolchain,
      });
    packs.push({
      domain,
      packKey,
      identity,
      status: built === null ? "emitted" : "built",
      modules: modules.map((module) => module.identity.identityHash),
      ...(built ?? {}),
    });
  }
  const unsupported = discovered.inventory.flatMap((kernel) =>
    kernel.functions.filter((fn) => fn.status === "unsupported")
      .map((fn) => ({
        kernel: kernel.id,
        function: fn.name,
        reason: fn.reason,
        fallback: kernel.fallback,
        oracles: kernel.oracles,
        tests: kernel.tests,
      }))
  );
  const emittedByIdentity = new Map(emitted.map((module) => [
    module.identity.identityHash,
    module,
  ]));
  const runtimeKernels = discovered.inventory.map((kernel) => {
    const module = emittedByIdentity.get(kernel.identityHash);
    if (module === undefined) return kernel;
    const descriptors = new Map(
      module.bridge.functions.map((fn) => [fn.name, fn]),
    );
    return {
      ...kernel,
      runtime: module.bridge.runtime,
      functions: kernel.functions.map((fn) => ({
        ...fn,
        ...(descriptors.has(fn.name)
          ? { bridge: descriptors.get(fn.name) }
          : {}),
      })),
    };
  });
  const index = {
    schema: WASM_PACK_SCHEMA,
    completeInventory: true,
    registeredKernels: discovered.registered.length,
    productionKernels: discovered.production.length,
    compiledKernelCores: emitted.length,
    sourceModules: discovered.inventory.length,
    compiledFunctions: discovered.inventory.reduce(
      (total, kernel) => total + kernel.functions.filter(
        (fn) => fn.status === "compiled-source",
      ).length,
      0,
    ),
    unsupportedFunctions: unsupported.length,
    unsupported,
    packs,
    kernels: runtimeKernels,
    nonProductionKernels: discovered.nonProduction,
  };
  writeFileSync(join(outputRoot, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

function defaultToolchain(root) {
  const cowasm = resolve(process.env.SAGEJS_COWASM_ROOT ??
    join(dirname(root), "cowasm"));
  const prefix = (name) => join(cowasm, "sagemath", name, "dist", "wasi-sdk");
  return {
    clang: process.env.SAGEJS_WASI_CLANG ?? "clang",
    sysroot: process.env.SAGEJS_WASI_SYSROOT ?? "/usr",
    gmpPrefix: process.env.SAGEJS_WASM_GMP_PREFIX ?? prefix("gmp"),
    flintPrefix: process.env.SAGEJS_WASM_FLINT_PREFIX ?? prefix("flint"),
    mpfrPrefix: process.env.SAGEJS_WASM_MPFR_PREFIX ?? prefix("mpfr"),
    mpcPrefix: process.env.SAGEJS_WASM_MPC_PREFIX ?? prefix("mpc"),
  };
}

function parseArguments(argv, root = resolve(__dirname, "..", "..")) {
  const options = {
    root,
    manifestPath: join(root, "architecture", "native-kernels.json"),
    outputRoot: join(root, "dist", "wasm-native-kernels"),
    emitOnly: false,
    domains: undefined,
    toolchain: defaultToolchain(root),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--emit-only") {
      options.emitOnly = true;
      continue;
    }
    if (argument === "--domain") {
      options.domains ??= [];
      options.domains.push(argv[++index]);
      continue;
    }
    const values = new Map([
      ["--output", [options, "outputRoot"]],
      ["--manifest", [options, "manifestPath"]],
      ["--clang", [options.toolchain, "clang"]],
      ["--sysroot", [options.toolchain, "sysroot"]],
      ["--gmp-prefix", [options.toolchain, "gmpPrefix"]],
      ["--flint-prefix", [options.toolchain, "flintPrefix"]],
      ["--mpfr-prefix", [options.toolchain, "mpfrPrefix"]],
      ["--mpc-prefix", [options.toolchain, "mpcPrefix"]],
    ]);
    const target = values.get(argument);
    if (target === undefined || argv[index + 1] === undefined) {
      throw new Error(`unknown or incomplete option ${argument}`);
    }
    target[0][target[1]] = resolve(argv[++index]);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await buildWasmProductionPacks(options);
  process.stdout.write(
    `WebAssembly production kernels: ${result.compiledFunctions} compiled, ` +
      `${result.unsupportedFunctions} explicitly unsupported\n`,
  );
}

module.exports = {
  WASM_PACK_IDENTITY_SCHEMA,
  WASM_PACK_SCHEMA,
  buildWasmProductionPacks,
  defaultToolchain,
  inventoryProductionKernels,
  packIdentity,
  parseArguments,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

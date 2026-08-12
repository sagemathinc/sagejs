#!/usr/bin/env node

"use strict";

const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { basename, dirname, join, relative, resolve } = require("node:path");
const { createHash } = require("node:crypto");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const {
  RESOURCE_FINALIZATION_CAPABILITY,
} = require("../tools/native-kernel/c-backend.cjs");
const { loadRegistry } = require("../tools/ffi/declarations.cjs");
const {
  generatedHostAdapterPath,
  generatedHostAdapterSource,
  generatedHostFunctions,
} = require("../tools/ffi/host-adapters.cjs");

const root = resolve(__dirname, "..");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(filename) {
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch {
    return null;
  }
}

function adapterPaths(repositoryRoot, declaration) {
  const sourcePath = generatedHostAdapterPath(repositoryRoot, declaration);
  const packageDirectory = dirname(dirname(sourcePath));
  const outputDirectory = join(packageDirectory, "build", "generated-ffi");
  const addonName = `sagejs_${declaration.library.id}_ffi.node`;
  return {
    addonName,
    addonPath: join(outputDirectory, addonName),
    manifestPath: join(outputDirectory, "manifest.json"),
    outputDirectory,
    packageDirectory,
    sourcePath,
  };
}

async function resolveHostAdapter(
  declaration,
  { repositoryRoot = root } = {},
) {
  const paths = adapterPaths(repositoryRoot, declaration);
  const { sourcePath, packageDirectory } = paths;
  const expected = generatedHostAdapterSource(declaration);
  if (!existsSync(sourcePath) || readFileSync(sourcePath, "utf8") !== expected) {
    throw new Error(
      `${relative(repositoryRoot, sourcePath)} is missing or stale; ` +
      `run sagejs ffi generate ${declaration.library.id}`,
    );
  }
  const cacheRoot = join(packageDirectory, ".native", "ffi-host-cache");
  const compiled = await compileKernel({ sourcePath, cacheRoot });
  return { compiled, expected, paths };
}

function hostAdapterManifest(repositoryRoot, declaration, resolved) {
  const { compiled, expected, paths } = resolved;
  const functions = generatedHostFunctions(declaration);
  const generatedResourceTypes = new Set(functions.flatMap((fn) => [
    fn.signature.return_type,
    ...fn.signature.parameters.map((parameter) => parameter.type),
  ]));
  const generatedResources = declaration.resources.filter((resource) =>
    resource.ownership === "owned" &&
    generatedResourceTypes.has(resource.python_name)
  );
  return {
    schema: "sagejs.ffi/generated-host-adapter-v1",
    library: declaration.identity,
    source: relative(repositoryRoot, paths.sourcePath),
    source_hash: sha256(expected),
    cache_key: compiled.cacheKey,
    addon: paths.addonName,
    addon_hash: sha256(readFileSync(compiled.addonPath)),
    functions: [
      ...functions.map((fn) => ({
        declaration: fn.declaration_id,
        export: fn.dynamic.export,
        symbol: fn.native.symbol,
      })),
      ...declaration.resources.flatMap((resource) =>
        resource.host_ingress?.kind === "copied_bytes"
          ? [{
            declaration: `${declaration.identity}:resource:${resource.id}`,
            export: resource.host_ingress.dynamic.export,
            symbol: resource.host_ingress.native.init_symbol,
          }]
          : []
      ),
    ],
    ...(generatedResources.length === 0
      ? {}
      : { resource_lifecycle: RESOURCE_FINALIZATION_CAPABILITY }),
    resources: generatedResources
      .map((resource) => ({
        id: resource.id,
        python_type: resource.python_name,
        close_export: resource.dynamic.close_export,
        ...(resource.native.size_symbol === undefined
          ? {} : { size_symbol: resource.native.size_symbol }),
        ...(resource.host_transfer === undefined
          ? {}
          : {
            host_transfer: {
              kind: resource.host_transfer.kind,
              export: resource.host_transfer.dynamic.export,
              wasm: resource.host_transfer.targets.wasm,
            },
          }),
        ...(resource.host_ingress === undefined
          ? {}
          : {
            host_ingress: {
              kind: resource.host_ingress.kind,
              export: resource.host_ingress.dynamic.export,
              wasm: resource.host_ingress.targets.wasm,
            },
          }),
      })),
    omitted_resources: declaration.functions.length - functions.length,
    host_isolation: {
      boundary: "packed-c-abi",
      callbacks_inside_core: 0,
    },
  };
}

function installedHostAdapterStatus(repositoryRoot, declaration, resolved) {
  const { paths } = resolved ?? {
    paths: adapterPaths(repositoryRoot, declaration),
  };
  const installedArtifacts = [
    paths.addonPath,
    paths.manifestPath,
    join(paths.outputDirectory, "kernel_core.c"),
    join(paths.outputDirectory, "kernel_core.h"),
  ];
  if (!installedArtifacts.some((filename) => existsSync(filename))) {
    return { status: "absent", reason: "installed artifacts are absent" };
  }
  if (resolved === undefined) {
    return { status: "installed", reason: null };
  }
  const expected = hostAdapterManifest(repositoryRoot, declaration, resolved);
  const actual = readJson(paths.manifestPath);
  if (actual === null) {
    return { status: "stale", reason: "manifest is missing or invalid" };
  }
  for (const key of [
    "schema", "library", "source", "source_hash", "cache_key", "addon",
  ]) {
    if (actual[key] !== expected[key]) {
      return { status: "stale", reason: `manifest ${key} changed` };
    }
  }
  if (!existsSync(paths.addonPath)) {
    return { status: "stale", reason: "addon is missing" };
  }
  if (sha256(readFileSync(paths.addonPath)) !== expected.addon_hash) {
    return { status: "stale", reason: "addon content changed" };
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return { status: "stale", reason: "manifest contents changed" };
  }
  return { status: "current", reason: null };
}

function publishHostAdapter(repositoryRoot, declaration, resolved) {
  const { compiled, paths } = resolved;
  const { outputDirectory } = paths;
  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(outputDirectory, { recursive: true });
  copyFileSync(compiled.addonPath, paths.addonPath);
  copyFileSync(compiled.coreSourcePath, join(outputDirectory, "kernel_core.c"));
  copyFileSync(compiled.coreHeaderPath, join(outputDirectory, "kernel_core.h"));
  const manifest = hostAdapterManifest(repositoryRoot, declaration, resolved);
  writeFileSync(
    paths.manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  process.stdout.write(
    `Built ${manifest.functions.length} generated ` +
    `${declaration.library.id} host adapters at ` +
    `${relative(repositoryRoot, outputDirectory)}\n`,
  );
  return manifest;
}

async function buildHostAdapter(declaration, options = {}) {
  const repositoryRoot = options.repositoryRoot ?? root;
  const resolved = await (options.resolve ?? resolveHostAdapter)(declaration, {
    repositoryRoot,
  });
  return (options.publish ?? publishHostAdapter)(
    repositoryRoot, declaration, resolved,
  );
}

async function reconcileInstalledHostAdapters(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? root;
  const registry = options.registry ?? loadRegistry({ root: repositoryRoot });
  const resolveAdapter = options.resolve ?? resolveHostAdapter;
  const publishAdapter = options.publish ?? publishHostAdapter;
  const reports = [];
  for (const declaration of registry.libraries) {
    const installed = installedHostAdapterStatus(
      repositoryRoot, declaration,
    );
    if (installed.status === "absent") {
      const report = {
        library: declaration.library.id,
        status: "skipped-absent",
      };
      reports.push(report);
      process.stdout.write(
        `Skipped generated ${report.library} host adapter: optional adapter ` +
        "is not installed.\n",
      );
      continue;
    }
    const resolved = await resolveAdapter(declaration, { repositoryRoot });
    const current = installedHostAdapterStatus(
      repositoryRoot, declaration, resolved,
    );
    if (current.status === "current") {
      reports.push({
        library: declaration.library.id,
        status: "current",
        cacheKey: resolved.compiled.cacheKey,
      });
      process.stdout.write(
        `Generated ${declaration.library.id} host adapter is current.\n`,
      );
      continue;
    }
    await publishAdapter(repositoryRoot, declaration, resolved);
    reports.push({
      library: declaration.library.id,
      status: "rebuilt",
      reason: current.reason,
      cacheKey: resolved.compiled.cacheKey,
    });
  }
  return reports;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === "--reconcile-installed") {
    await reconcileInstalledHostAdapters();
    return;
  }
  const [libraryId, ...extra] = argv;
  if (!libraryId || extra.length !== 0) {
    throw new Error(
      "usage: build-ffi-host-adapter.cjs <library>|--reconcile-installed",
    );
  }
  const declaration = loadRegistry({ root }).byId.get(libraryId);
  if (declaration === undefined) {
    throw new Error(`unknown FFI library ${libraryId}`);
  }
  await buildHostAdapter(declaration);
}

module.exports = {
  adapterPaths,
  buildHostAdapter,
  hostAdapterManifest,
  installedHostAdapterStatus,
  main,
  publishHostAdapter,
  reconcileInstalledHostAdapters,
  resolveHostAdapter,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

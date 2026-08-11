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
const { loadRegistry } = require("../tools/ffi/declarations.cjs");
const {
  generatedHostAdapterPath,
  generatedHostAdapterSource,
  generatedHostFunctions,
} = require("../tools/ffi/host-adapters.cjs");

const root = resolve(__dirname, "..");

async function main() {
  const [libraryId] = process.argv.slice(2);
  if (!libraryId) {
    throw new Error("usage: build-ffi-host-adapter.cjs <library>");
  }
  const declaration = loadRegistry({ root }).byId.get(libraryId);
  if (declaration === undefined) {
    throw new Error(`unknown FFI library ${libraryId}`);
  }
  const sourcePath = generatedHostAdapterPath(root, declaration);
  const expected = generatedHostAdapterSource(declaration);
  if (!existsSync(sourcePath) || readFileSync(sourcePath, "utf8") !== expected) {
    throw new Error(
      `${relative(root, sourcePath)} is missing or stale; ` +
      `run sagejs ffi generate ${libraryId}`,
    );
  }
  const packageDirectory = dirname(dirname(sourcePath));
  const outputDirectory = join(packageDirectory, "build", "generated-ffi");
  const cacheRoot = join(packageDirectory, ".native", "ffi-host-cache");
  const compiled = await compileKernel({ sourcePath, cacheRoot });
  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(outputDirectory, { recursive: true });
  const addonName = `sagejs_${libraryId}_ffi.node`;
  copyFileSync(compiled.addonPath, join(outputDirectory, addonName));
  copyFileSync(compiled.coreSourcePath, join(outputDirectory, "kernel_core.c"));
  copyFileSync(compiled.coreHeaderPath, join(outputDirectory, "kernel_core.h"));
  const functions = generatedHostFunctions(declaration);
  const generatedResourceTypes = new Set(functions.flatMap((fn) => [
    fn.signature.return_type,
    ...fn.signature.parameters.map((parameter) => parameter.type),
  ]));
  writeFileSync(
    join(outputDirectory, "manifest.json"),
    `${JSON.stringify({
      schema: "sagejs.ffi/generated-host-adapter-v1",
      library: declaration.identity,
      source: relative(root, sourcePath),
      source_hash: createHash("sha256").update(expected).digest("hex"),
      addon: addonName,
      functions: functions.map((fn) => ({
        declaration: fn.declaration_id,
        export: fn.dynamic.export,
        symbol: fn.native.symbol,
      })),
      resources: declaration.resources
        .filter((resource) =>
          resource.ownership === "owned" &&
          generatedResourceTypes.has(resource.python_name)
        )
        .map((resource) => ({
          id: resource.id,
          python_type: resource.python_name,
          close_export: resource.dynamic.close_export,
          ...(resource.native.size_symbol === undefined
            ? {} : { size_symbol: resource.native.size_symbol }),
        })),
      omitted_resources: declaration.functions.length - functions.length,
      host_isolation: {
        boundary: "packed-c-abi",
        callbacks_inside_core: 0,
      },
    }, null, 2)}\n`,
  );
  process.stdout.write(
    `Built ${functions.length} generated ${libraryId} host adapters at ` +
    `${relative(root, outputDirectory)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

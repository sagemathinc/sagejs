"use strict";

const { createHash } = require("node:crypto");
const { existsSync, readFileSync, realpathSync } = require("node:fs");
const { dirname, resolve, sep } = require("node:path");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Resolve explicitly imported source-transparent native functions.
 *
 * The physical path is the cycle and source identity. `displayPath` controls
 * recorded provenance: desktop caches retain canonical absolute paths while
 * portable production identities use repository-relative paths.
 * `initialDisplayPath` is the exact root name passed to lowerSource when its
 * public identity differs from the dependency display convention.
 */
function createNativeImportResolver({
  root,
  lowerSource,
  initialSourcePath,
  displayPath = (filename) => filename,
  initialDisplayPath,
}) {
  const initialPhysicalPath = realpathSync(initialSourcePath);
  const resolving = new Set([initialPhysicalPath]);
  const physicalSources = new Map([
    [displayPath(initialPhysicalPath), initialPhysicalPath],
  ]);
  if (initialDisplayPath !== undefined) {
    physicalSources.set(initialDisplayPath, initialPhysicalPath);
  }

  async function resolveNativeImport(request) {
    let candidates;
    if (request.moduleName.startsWith(".")) {
      const match = /^(\.+)([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)$/.exec(request.moduleName);
      if (!match) throw new Error("native kernel: unsupported relative native import");
      const importer = physicalSources.get(request.importer);
      if (!importer) throw new Error("native kernel: unknown relative import source");
      let directory = dirname(importer);
      // Namespace-package roots depend on the dynamic import search path. The
      // isolated compiler admits only an explicit regular-package chain.
      for (let level = 0; level < match[1].length; level++) {
        if (level) directory = dirname(directory);
        if (!existsSync(resolve(directory, "__init__.py"))) {
          throw new Error("native kernel: relative import requires a regular package and cannot cross its root");
        }
      }
      const components = match[2].split(".");
      for (const component of components.slice(0, -1)) {
        directory = resolve(directory, component);
        if (!existsSync(resolve(directory, "__init__.py"))) {
          throw new Error("native kernel: relative native submodules require regular packages");
        }
      }
      candidates = [resolve(directory, components.at(-1) + ".py")];
    } else {
      const relativeModule = request.moduleName.replaceAll(".", sep) + ".py";
      candidates = [
        resolve(root, "src", "lib", relativeModule),
        resolve(root, "src", "baselib", relativeModule),
      ];
    }
    const importedPath = candidates.find((candidate) => existsSync(candidate));
    if (importedPath === undefined) return null;
    const physicalPath = realpathSync(importedPath);
    physicalSources.set(displayPath(physicalPath), physicalPath);
    const importedSource = readFileSync(physicalPath, "utf8");
    const escapedName = request.importedName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const nativeDefinition = new RegExp(
      `(?:^|\\n)[ \\t]*@native[ \\t]*(?:\\r?\\n)` +
        `[ \\t]*def[ \\t]+${escapedName}[ \\t]*\\(`,
    );
    if (!nativeDefinition.test(importedSource)) return null;
    if (resolving.has(physicalPath)) {
      throw new Error(
        `native kernel: cyclic source-transparent import through ${physicalPath}`,
      );
    }
    resolving.add(physicalPath);
    try {
      const importedIr = await lowerSource(
        importedSource,
        displayPath(physicalPath),
        {
          functions: [request.importedName],
          resolveNativeImport,
        },
      );
      return {
        ...request,
        sourcePath: displayPath(physicalPath),
        sourceHash: sha256(importedSource),
        ir: importedIr,
      };
    } finally {
      resolving.delete(physicalPath);
    }
  }

  return resolveNativeImport;
}

module.exports = { createNativeImportResolver };

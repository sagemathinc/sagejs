"use strict";

const { createHash } = require("node:crypto");
const { existsSync, readFileSync, realpathSync } = require("node:fs");
const { resolve, sep } = require("node:path");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Resolve explicitly imported source-transparent native functions.
 *
 * The physical path is the cycle and source identity. `displayPath` controls
 * recorded provenance: desktop caches retain canonical absolute paths while
 * portable production identities use repository-relative paths.
 */
function createNativeImportResolver({
  root,
  lowerSource,
  initialSourcePath,
  displayPath = (filename) => filename,
}) {
  const resolving = new Set([realpathSync(initialSourcePath)]);

  async function resolveNativeImport(request) {
    const relativeModule = request.moduleName.replaceAll(".", sep) + ".py";
    const candidates = [
      resolve(root, "src", "lib", relativeModule),
      resolve(root, "src", "baselib", relativeModule),
    ];
    const importedPath = candidates.find((candidate) => existsSync(candidate));
    if (importedPath === undefined) return null;
    const physicalPath = realpathSync(importedPath);
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

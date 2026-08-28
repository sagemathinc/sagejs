"use strict";

/** Public modules required by operations implemented in the bootstrap baselib.
 *
 * Full Sage.js sessions provide a lazy module loader. Standalone JavaScript,
 * compiler fixtures, lightweight task workers, and future SEA-only realms do
 * not. Their compiler entry points prepend these normal Python imports so the
 * authoritative module resolver embeds one host-independent dependency set.
 */

const { existsSync, readFileSync } = require("node:fs");
const { basename, join } = require("node:path");

const TOOL_PARENT = join(__dirname, "..");
const ROOT = existsSync(join(TOOL_PARENT, "src"))
  ? TOOL_PARENT
  : join(TOOL_PARENT, "..");
const LIBRARY_DIRECTORY = join(ROOT, "src", "lib");
const EMBEDDED_STANDALONE_LIBRARY =
  globalThis.__sagejs_embedded_standalone_library__;

function sourceFilenameForModule(name) {
  const base = join(LIBRARY_DIRECTORY, ...name.split("."));
  const moduleFilename = `${base}.py`;
  if (existsSync(moduleFilename)) return moduleFilename;
  const packageFilename = join(base, "__init__.py");
  if (existsSync(packageFilename)) return packageFilename;
  return undefined;
}

function resolveRelativeImport(importer, imported) {
  if (!imported.startsWith(".")) return imported;
  const level = imported.length - imported.replace(/^\.+/, "").length;
  const suffix = imported.slice(level);
  const importerSource = sourceFilenameForModule(importer);
  let base = importerSource && basename(importerSource) === "__init__.py"
    ? importer
    : importer.split(".").slice(0, -1).join(".");
  for (let index = 1; index < level; index += 1) {
    base = base.split(".").slice(0, -1).join(".");
  }
  return suffix ? `${base}.${suffix}` : base;
}

function pythonDynamicImports(source, importer) {
  const names = new Set();
  for (const match of source.matchAll(/__import__\(\s*["']([^"']+)["']/g)) {
    names.add(resolveRelativeImport(importer, match[1]));
  }
  return [...names];
}

function pythonImports(source, importer) {
  const names = new Set(pythonDynamicImports(source, importer));
  for (const match of source.matchAll(
    /^\s*from\s+([.\w]+)\s+import\s+(\([^)]*\)|[^\n#]+)/gm,
  )) {
    const parent = resolveRelativeImport(importer, match[1]);
    names.add(parent);
    const importedNames = match[2]
      .replace(/[()]/g, "")
      .replace(/#[^\n]*/g, "")
      .split(",");
    for (const item of importedNames) {
      const child = item.trim().split(/\s+as\s+/)[0];
      if (!child || child === "*") continue;
      const childName = parent ? `${parent}.${child}` : child;
      if (sourceFilenameForModule(childName)) names.add(childName);
    }
  }
  for (const match of source.matchAll(/^\s*import\s+([^\n#]+)/gm)) {
    for (const item of match[1].split(",")) {
      const name = item.trim().split(/\s+as\s+/)[0];
      if (name) names.add(resolveRelativeImport(importer, name));
    }
  }
  return [...names];
}

function moduleParents(name) {
  const parts = name.split(".");
  const result = [];
  for (let length = 1; length < parts.length; length += 1) {
    const parent = parts.slice(0, length).join(".");
    if (sourceFilenameForModule(parent)) result.push(parent);
  }
  return result;
}

function moduleClosure(roots) {
  const found = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const name = pending.shift();
    if (found.has(name)) continue;
    const filename = sourceFilenameForModule(name);
    if (!filename) continue;
    found.add(name);
    pending.push(...moduleParents(name));
    const source = readFileSync(filename, "utf8");
    for (const dependency of pythonImports(source, name)) {
      if (dependency === "sagejs" || dependency.startsWith("sagejs.")) {
        pending.push(dependency);
      }
    }
  }
  return [...found].sort();
}

function baselibLazyModules(filename) {
  const source = readFileSync(join(ROOT, "src", "baselib", filename), "utf8");
  return pythonDynamicImports(
    source,
    `sagejs._baselib.${filename.slice(0, -3)}`,
  )
    .filter((name) => sourceFilenameForModule(name) !== undefined)
    .sort();
}

const BUILTINS_STANDALONE_MODULES = Object.freeze(
  EMBEDDED_STANDALONE_LIBRARY?.builtins ??
    baselibLazyModules("builtins.py"),
);

const MATRIX_STANDALONE_MODULES = Object.freeze(
  EMBEDDED_STANDALONE_LIBRARY?.matrix ?? baselibLazyModules("matrix.py"),
);

const POLYNOMIAL_STANDALONE_MODULES = Object.freeze([
  "sagejs.kernels.polynomial.packed_integer",
  "sagejs.kernels.polynomial.packed_flint",
  "sagejs.kernels.polynomial.packed_prime_field",
  "sagejs.kernels.polynomial.packed_rational",
  "sagejs.polynomial_algorithms.arbitrary_prime_public",
]);

const BASELIB_STANDALONE_MODULES = Object.freeze([
  ...new Set([
    ...BUILTINS_STANDALONE_MODULES,
    ...MATRIX_STANDALONE_MODULES,
    ...POLYNOMIAL_STANDALONE_MODULES,
    "sagejs.plotting",
  ]),
]);

// Cache the complete static dependency closure as separate module artifacts.
// The authoritative resolver still verifies these identities and source
// hashes; this avoids reparsing the same library graph for every explicit
// standalone compilation without maintaining a second module list by hand.
const BASELIB_STANDALONE_CACHE_MODULES = Object.freeze(
  EMBEDDED_STANDALONE_LIBRARY?.cache ??
    [...new Set([
      ...moduleClosure(BASELIB_STANDALONE_MODULES),
      // This dotted standard-library dependency is imported by the matrix
      // and plotting closure, but is not part of `standardModules` above.
      "collections.abc",
    ])].sort(),
);

function baselibStandaloneImportPrelude(modules = BASELIB_STANDALONE_MODULES) {
  return modules.map((name) => `import ${name}\n`).join("");
}

function standaloneRuntimeRequirePrelude() {
  return (
    "var __sagejs_runtime_require__ = " +
    "typeof globalThis.__sagejs_runtime_require__ === 'function' " +
    "? globalThis.__sagejs_runtime_require__ " +
    ": (typeof require === 'function' ? require : function(name) { " +
    "throw new Error('native runtime module is unavailable: ' + name); });\n"
  );
}

module.exports = {
  BASELIB_STANDALONE_CACHE_MODULES,
  BASELIB_STANDALONE_MODULES,
  BUILTINS_STANDALONE_MODULES,
  MATRIX_STANDALONE_MODULES,
  POLYNOMIAL_STANDALONE_MODULES,
  baselibStandaloneImportPrelude,
  moduleClosure,
  standaloneRuntimeRequirePrelude,
};

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  array,
  attachIdentity,
  canonicalJson,
  contentId,
  contentIdentity,
  deepFreeze,
  digest,
  enumeration,
  exactKeys,
  identifier,
  nonemptyString,
  repositoryPath,
  safeInteger,
  sha256,
  stableName,
} = require("./common.cjs");

const SOURCE_BUNDLE_SCHEMA = "sagejs.optimizer-source-bundle/v1";
const COMPILER_IDENTITY_SCHEMA = "sagejs.optimizer-compiler-identity/v1";
const COMPILER_COMPATIBILITY_SCHEMA =
  "sagejs.optimizer-compiler-implementation-compatibility/v1";
const SOURCE_UNIT_SCHEMA = "sagejs.optimizer-source-unit/v1";
const FUNCTION_IDENTITY_SCHEMA = "sagejs.optimizer-function-identity/v1";
const REGION_IDENTITY_SCHEMA = "sagejs.optimizer-region-identity/v1";
const DECISION_IDENTITY_SCHEMA = "sagejs.optimizer-decision-identity/v1";

const COMPILER_SOURCE_ROOT_PATHS = Object.freeze([
  "src/ast_types.py",
  "tools/compiler.ts",
  "tools/python/compiler-frontend.ts",
  "tools/python/frontend.ts",
  "tools/python/lowerer.ts",
  "tools/python/module-resolver.ts",
  "tools/optimizer-development/common.cjs",
  "tools/optimizer-development/identity.cjs",
]);

const FRONTEND_ARTIFACT_PATHS = Object.freeze([
  "dist/compiler/compiler.js",
  "dist/compiler/signatures.json",
  "dist/tools/compiler.js",
  "dist/tools/python/compiler-frontend.js",
  "dist/tools/python/frontend.js",
  "dist/tools/python/lowerer.js",
  "dist/tools/python/optimizer/profile-identity.js",
  "dist/tools/python/optimizer/profile-map.js",
  "dist/vendor/tree-sitter-python.wasm",
  "dist/vendor/tree-sitter-sage.wasm",
  "dist/tools/tree-sitter-python/grammar.js",
  "dist/tools/tree-sitter-sage/grammar.js",
]);

function validateRange(label, value) {
  exactKeys(label, value, ["startLine", "startColumn", "endLine", "endColumn"]);
  const result = {
    startLine: safeInteger(`${label}.startLine`, value.startLine, 1),
    startColumn: safeInteger(`${label}.startColumn`, value.startColumn),
    endLine: safeInteger(`${label}.endLine`, value.endLine, 1),
    endColumn: safeInteger(`${label}.endColumn`, value.endColumn),
  };
  if (result.endLine < result.startLine ||
      (result.endLine === result.startLine && result.endColumn < result.startColumn)) {
    throw new Error(`optimizer evidence ${label}: end must not precede start`);
  }
  return result;
}

function normalizeFileRecords(files) {
  return array("source bundle files", files, (label, value) => {
    exactKeys(label, value, ["path", "digest", "bytes"]);
    return {
      path: repositoryPath(`${label}.path`, value.path),
      digest: digest(`${label}.digest`, value.digest),
      bytes: safeInteger(`${label}.bytes`, value.bytes),
    };
  }, { minimum: 1, uniqueBy: (item) => item.path })
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function sourceBundleFromRecords(files) {
  return attachIdentity(SOURCE_BUNDLE_SCHEMA, { files: normalizeFileRecords(files) });
}

function sourceBundleIdentity(root, repositoryPaths) {
  const rootPath = path.resolve(nonemptyString("source bundle root", root));
  const records = array("source bundle paths", repositoryPaths,
    (label, value) => repositoryPath(label, value),
    { minimum: 1, uniqueBy: (item) => item })
    .map((relativePath) => {
      const bytes = fs.readFileSync(path.join(rootPath, relativePath));
      return { path: relativePath, digest: sha256(bytes), bytes: bytes.length };
    });
  return sourceBundleFromRecords(records);
}

function recursiveRepositoryFiles(root, relativeDirectory, suffix) {
  const result = [];
  const visit = (relative) => {
    const directory = path.join(root, relative);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.endsWith(suffix)) result.push(child);
    }
  };
  visit(relativeDirectory);
  return result.sort();
}

function compilerSourcePaths(root) {
  const rootPath = path.resolve(nonemptyString("compiler identity root", root));
  return Object.freeze([
    ...COMPILER_SOURCE_ROOT_PATHS,
    ...recursiveRepositoryFiles(rootPath, "tools/python/optimizer", ".ts"),
  ].sort());
}

function fileRecords(root, repositoryPaths) {
  const rootPath = path.resolve(nonemptyString("compiler identity root", root));
  return normalizeFileRecords(repositoryPaths.map((relativePath) => {
    const checked = repositoryPath("compiler identity path", relativePath);
    const bytes = fs.readFileSync(path.join(rootPath, checked));
    return { path: checked, digest: sha256(bytes), bytes: bytes.length };
  }));
}

function semanticOptimizerCatalog(optimizerCatalog) {
  exactKeys("optimizer catalog", optimizerCatalog, ["plugins"]);
  const plugins = array("optimizer catalog.plugins", optimizerCatalog.plugins, (label, plugin) => {
    exactKeys(label, plugin,
      ["id", "domainId", "priority", "claimSemantics", "loweringIds", "pass"]);
    exactKeys(`${label}.pass`, plugin.pass, [
      "id", "inputSchema", "factsConsumed", "factsProduced", "factsInvalidated", "preserves",
      "acceptedLevel", "producedLevel", "guardsIntroduced", "supportedTargets", "verifier",
      "compilationCostBudget", "codeSizeBudget", "requiredEvidence", "run",
    ]);
    if (typeof plugin.pass.run !== "function") {
      throw new TypeError(`optimizer evidence ${label}.pass.run: must be a function`);
    }
    const { run: _run, ...pass } = plugin.pass;
    return {
      id: stableName(`${label}.id`, plugin.id),
      domainId: stableName(`${label}.domainId`, plugin.domainId),
      priority: safeInteger(`${label}.priority`, plugin.priority),
      claimSemantics: enumeration(`${label}.claimSemantics`, plugin.claimSemantics, ["exclusive"]),
      loweringIds: array(`${label}.loweringIds`, plugin.loweringIds,
        (itemLabel, item) => stableName(itemLabel, item),
        { uniqueBy: (item) => item }),
      pass,
    };
  }, {
    minimum: 1,
    uniqueBy: (plugin) => plugin.id,
  });
  return deepFreeze(plugins);
}

function compilerImplementationIdentity(root, optimizerCatalog) {
  const compilerSourceBundle = sourceBundleIdentity(root, compilerSourcePaths(root));
  const frontendArtifacts = fileRecords(root, FRONTEND_ARTIFACT_PATHS);
  const catalog = semanticOptimizerCatalog(optimizerCatalog);
  return deepFreeze({
    compilerSourceBundle,
    frontendDigest: sha256(canonicalJson(frontendArtifacts)),
    catalogDigest: sha256(canonicalJson(catalog)),
  });
}

function canonicalCompilerIdentity(value) {
  exactKeys("canonical compiler identity", value,
    ["root", "irSchema", "optimizerCatalog", "optionsDigest"]);
  const implementation = compilerImplementationIdentity(value.root, value.optimizerCatalog);
  return compilerIdentity({
    irSchema: value.irSchema,
    compilerSourceBundleId: implementation.compilerSourceBundle.id,
    frontendDigest: implementation.frontendDigest,
    catalogDigest: implementation.catalogDigest,
    optionsDigest: value.optionsDigest,
  });
}

function validateSourceBundle(label, value) {
  exactKeys(label, value, ["schema", "id", "files"]);
  if (value.schema !== SOURCE_BUNDLE_SCHEMA) {
    throw new Error(`optimizer evidence ${label}.schema: unknown schema ${value.schema}`);
  }
  const expected = sourceBundleFromRecords(value.files);
  contentId(`${label}.id`, value.id);
  if (expected.id !== value.id) {
    throw new Error(`optimizer evidence ${label}.id: is stale; expected ${expected.id}`);
  }
  return expected;
}

function compilerIdentity(value) {
  exactKeys("compiler identity", value, [
    "irSchema", "compilerSourceBundleId", "frontendDigest", "catalogDigest", "optionsDigest",
  ]);
  return attachIdentity(COMPILER_IDENTITY_SCHEMA, {
    irSchema: nonemptyString("compiler identity.irSchema", value.irSchema),
    compilerSourceBundleId: contentId(
      "compiler identity.compilerSourceBundleId", value.compilerSourceBundleId,
    ),
    frontendDigest: digest("compiler identity.frontendDigest", value.frontendDigest),
    catalogDigest: digest("compiler identity.catalogDigest", value.catalogDigest),
    optionsDigest: digest("compiler identity.optionsDigest", value.optionsDigest),
  });
}

/**
 * Return the content-addressed implementation dimensions that must agree
 * before static dashboard evidence and a live compilation may be compared.
 *
 * `optionsDigest` is intentionally excluded: the dashboard compiles with a
 * lint-safe O2 environment while live evaluation uses real imports and target
 * options. Their decisions remain separate evidence and must never be made to
 * look identical merely to permit the source/profile join.
 */
function compilerCompatibilityIdentity(value) {
  exactKeys("compiler compatibility input", value, [
    "schema", "id", "irSchema", "compilerSourceBundleId", "frontendDigest",
    "catalogDigest", "optionsDigest",
  ]);
  if (value.schema !== COMPILER_IDENTITY_SCHEMA) {
    throw new Error("optimizer evidence compiler compatibility input.schema: unknown schema");
  }
  const checked = compilerIdentity({
    irSchema: value.irSchema,
    compilerSourceBundleId: value.compilerSourceBundleId,
    frontendDigest: value.frontendDigest,
    catalogDigest: value.catalogDigest,
    optionsDigest: value.optionsDigest,
  });
  if (checked.id !== value.id) {
    throw new Error("optimizer evidence compiler compatibility input.id: is stale");
  }
  return attachIdentity(COMPILER_COMPATIBILITY_SCHEMA, {
    irSchema: checked.irSchema,
    compilerSourceBundleId: checked.compilerSourceBundleId,
    frontendDigest: checked.frontendDigest,
    catalogDigest: checked.catalogDigest,
  });
}

function compilerImplementationsCompatible(left, right) {
  return compilerCompatibilityIdentity(left).id ===
    compilerCompatibilityIdentity(right).id;
}

function sourceUnitIdentity(value) {
  exactKeys("source unit identity", value, ["path", "digest", "language"]);
  return attachIdentity(SOURCE_UNIT_SCHEMA, {
    path: repositoryPath("source unit identity.path", value.path),
    digest: digest("source unit identity.digest", value.digest),
    language: enumeration("source unit identity.language", value.language,
      ["python", "javascript", "typescript", "c", "cpp", "wasm"]),
  });
}

function functionIdentity(value) {
  exactKeys("function identity", value, [
    "sourceUnitId", "qualifiedName", "kind", "semanticFingerprint", "range", "ordinal",
  ]);
  const payload = {
    sourceUnitId: contentId("function identity.sourceUnitId", value.sourceUnitId),
    qualifiedName: nonemptyString("function identity.qualifiedName", value.qualifiedName),
    kind: enumeration("function identity.kind", value.kind,
      ["function", "method", "lambda", "module"]),
    semanticFingerprint: contentId(
      "function identity.semanticFingerprint", value.semanticFingerprint,
    ),
    range: validateRange("function identity.range", value.range),
    ordinal: safeInteger("function identity.ordinal", value.ordinal),
  };
  return attachIdentity(FUNCTION_IDENTITY_SCHEMA, payload);
}

function semanticFingerprint(value) {
  return contentIdentity("sagejs.optimizer-semantic-structure/v1", value);
}

function semanticRegionIdentity(value) {
  exactKeys("region identity", value, [
    "functionId", "kind", "semanticFingerprint", "range", "ordinal",
  ]);
  return attachIdentity(REGION_IDENTITY_SCHEMA, {
    functionId: contentId("region identity.functionId", value.functionId),
    kind: stableName("region identity.kind", value.kind),
    semanticFingerprint: contentId(
      "region identity.semanticFingerprint", value.semanticFingerprint,
    ),
    range: validateRange("region identity.range", value.range),
    ordinal: safeInteger("region identity.ordinal", value.ordinal),
  });
}

function decisionIdentity(value) {
  exactKeys("decision identity", value, ["regionId", "passId", "compilerId"]);
  return attachIdentity(DECISION_IDENTITY_SCHEMA, {
    regionId: contentId("decision identity.regionId", value.regionId),
    passId: stableName("decision identity.passId", value.passId),
    compilerId: contentId("decision identity.compilerId", value.compilerId),
  });
}

function predecessorKey(region) {
  return [region.path, region.qualifiedName, region.kind, region.semanticFingerprint].join("\u0000");
}

function linkPredecessor(previousRegions, currentRegion) {
  exactKeys("current predecessor candidate", currentRegion,
    ["id", "path", "qualifiedName", "kind", "semanticFingerprint"]);
  contentId("current predecessor candidate.id", currentRegion.id);
  repositoryPath("current predecessor candidate.path", currentRegion.path);
  nonemptyString("current predecessor candidate.qualifiedName", currentRegion.qualifiedName);
  identifier("current predecessor candidate.kind", currentRegion.kind);
  contentId("current predecessor candidate.semanticFingerprint", currentRegion.semanticFingerprint);
  const currentKey = predecessorKey(currentRegion);
  const matches = array("previous predecessor candidates", previousRegions, (label, region) => {
    exactKeys(label, region, ["id", "path", "qualifiedName", "kind", "semanticFingerprint"]);
    contentId(`${label}.id`, region.id);
    repositoryPath(`${label}.path`, region.path);
    nonemptyString(`${label}.qualifiedName`, region.qualifiedName);
    identifier(`${label}.kind`, region.kind);
    contentId(`${label}.semanticFingerprint`, region.semanticFingerprint);
    return region;
  }).filter((region) => predecessorKey(region) === currentKey);
  return matches.length === 1 && matches[0].id !== currentRegion.id ? matches[0].id : null;
}

module.exports = {
  COMPILER_SOURCE_ROOT_PATHS,
  COMPILER_COMPATIBILITY_SCHEMA,
  COMPILER_IDENTITY_SCHEMA,
  DECISION_IDENTITY_SCHEMA,
  FUNCTION_IDENTITY_SCHEMA,
  REGION_IDENTITY_SCHEMA,
  SOURCE_BUNDLE_SCHEMA,
  SOURCE_UNIT_SCHEMA,
  FRONTEND_ARTIFACT_PATHS,
  canonicalCompilerIdentity,
  compilerCompatibilityIdentity,
  compilerImplementationIdentity,
  compilerImplementationsCompatible,
  compilerIdentity,
  compilerSourcePaths,
  decisionIdentity,
  functionIdentity,
  linkPredecessor,
  normalizeFileRecords,
  semanticFingerprint,
  semanticOptimizerCatalog,
  semanticRegionIdentity,
  sourceBundleFromRecords,
  sourceBundleIdentity,
  sourceUnitIdentity,
  validateRange,
  validateSourceBundle,
};

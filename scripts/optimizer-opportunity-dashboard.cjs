#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const {
  canonicalJson,
  contentIdentity,
  documentIdentity,
  sha256,
} = require("../tools/optimizer-development/common.cjs");
const {
  canonicalSnapshot,
  ensureLocalDatabase,
  querySnapshotDatabase,
  readArtifactManifest,
  readSnapshotDatabase,
  validateArtifactManifest,
  writeSnapshotArtifacts,
} = require("../tools/optimizer-development/dashboard-artifacts.cjs");
const {
  canonicalCompilerIdentity,
  compilerIdentity,
  decisionIdentity,
  functionIdentity,
  semanticFingerprint,
  semanticRegionIdentity,
  sourceBundleFromRecords,
  sourceUnitIdentity,
} = require("../tools/optimizer-development/identity.cjs");

const ROOT = path.resolve(__dirname, "..");
const SCHEMA = "sagejs.optimizer-opportunity-dashboard/v2";
const GENERATOR = "optimizer-opportunity-dashboard/v2";
const DEFAULT_MANIFEST = path.join(
  ROOT,
  "architecture",
  "optimizer-opportunities.manifest.json",
);
const DEFAULT_MARKDOWN = path.join(
  ROOT,
  "docs",
  "optimizer-opportunities.md",
);

// Native/reactor builders keep downloaded dependency trees below mathematical
// packages. Those generated files must not become first-party optimizer inputs
// merely because a developer built an optional backend in this checkout.
const GENERATED_DIRECTORY_NAMES = new Set([
  ".git", ".cache", ".native", "__pycache__", "build", "dist", "node_modules",
]);

const IGNORED_AST_KEYS = new Set([
  "start",
  "end",
  "filename",
  "scope",
  "thedef",
  "imports",
  "globals",
  "classes",
  "baselib",
  "optimization_ir",
  "optimization_region",
  "optimization_contract",
]);

const SEMANTIC_LOOP_KINDS = new Set([
  "AST_ForIn",
  "AST_AsyncFor",
  "AST_ForJS",
  "AST_While",
  "AST_Do",
  "AST_ListComprehension",
  "AST_SetComprehension",
  "AST_DictComprehension",
  "AST_GeneratorComprehension",
]);

const COERCION_NAMES = new Set([
  "int",
  "float",
  "complex",
  "Integer",
  "Rational",
  "RealNumber",
  "ZZ",
  "QQ",
  "RDF",
  "CDF",
  "GF",
  "Zmod",
  "FiniteField",
  "RealField",
  "ComplexField",
]);

const REASON_REMEDIATIONS = Object.freeze({
  "bounded-integer.dynamic-call":
    "Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph.",
  "bounded-integer.mutable-buffer-access":
    "Prove an owner-bound packed buffer, alias discipline, and transactional publication.",
  "bounded-integer.unproved-live-in":
    "Add exact `int` annotations for every scalar live-in; runtime guards still authenticate values.",
  "bounded-integer.unsupported-control-flow":
    "Restructure the loop into supported transactional branches or add a verified control-flow lowering.",
  "bounded-integer.unsupported-iterator":
    "Use a proved built-in `range` iteration shape or add a verifier for the required iterator semantics.",
  "bounded-integer.unsupported-power":
    "Expand a small fixed power into ordered multiplications or add an exact bounded-power proof.",
  "bounded-integer.code-size-budget":
    "Split the region or add a compact target so emitted code stays inside the reviewed budget.",
  "catchable-interrupt-region":
    "Keep interrupt handling outside the transactional hot region or prove equivalent catch semantics.",
  "dashboard.comprehension-loop":
    "Lower the comprehension through a dedicated packed/container representation before scalar optimization.",
  "dashboard.control-flow-sites":
    "Canonicalize the branches into a verified operation graph or add a domain-specific control-flow proof.",
  "dashboard.dynamic-call-sites":
    "Profile the calls, then inline, hoist, batch, or give the dominant call an authenticated coarse boundary.",
  "dashboard.indexed-access-sites":
    "Prove shape, element representation, aliasing, and ownership before selecting a packed lowering.",
  "dashboard.nested-loop-sites":
    "Consider a fused multidimensional region with explicit shape and work bounds.",
  "dashboard.no-current-pass-claimed":
    "No existing mathematical-domain pass proves this loop; profile it before adding a new domain.",
  "dashboard.no-mathematical-domain-evidence":
    "Add precise annotations or an explicit domain contract only after profiling proves this loop matters.",
  "dashboard.unsupported-while-loop":
    "Prove a finite progress measure and transactional exits before lowering a `while` loop.",
});


function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function slash(value) {
  return value.split(path.sep).join("/");
}

function repositoryPath(root, filename) {
  if (typeof filename !== "string" || filename.length === 0) return "<unknown>";
  if (filename.startsWith("<") && filename.endsWith(">")) return filename;
  const absolute = path.isAbsolute(filename) ? filename : path.resolve(root, filename);
  const relative = path.relative(root, absolute);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return slash(relative || ".");
  }
  return slash(absolute);
}

function normalizedRepositoryPath(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value)) {
    throw new Error("source path must be a nonempty repository-relative path");
  }
  const normalized = slash(path.normalize(value)).replace(/^\.\//, "");
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("source path must stay inside the repository");
  }
  return normalized;
}


function recursiveFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory() && !GENERATED_DIRECTORY_NAMES.has(entry.name)) {
      result.push(...recursiveFiles(filename, predicate));
    }
    else if (entry.isFile() && predicate(filename)) result.push(filename);
  }
  return result.sort();
}

function dashboardInputFiles(root = ROOT) {
  const candidates = [
    ...recursiveFiles(path.join(root, "src", "lib"), (name) => name.endsWith(".py")),
    ...recursiveFiles(
      path.join(root, "bench", "optimizer-workloads"),
      (name) => name.endsWith(".py"),
    ),
    ...recursiveFiles(
      path.join(root, "tools", "python", "optimizer"),
      (name) => name.endsWith(".ts"),
    ),
    path.join(root, "tools", "optimizer-development", "common.cjs"),
    path.join(root, "tools", "optimizer-development", "identity.cjs"),
    path.join(root, "src", "ast_types.py"),
    path.join(root, "tools", "compiler.ts"),
    path.join(root, "tools", "python", "compiler-frontend.ts"),
    path.join(root, "tools", "python", "frontend.ts"),
    path.join(root, "tools", "python", "lowerer.ts"),
    path.join(root, "tools", "python", "module-resolver.ts"),
    path.join(root, "scripts", "optimizer-opportunity-dashboard.cjs"),
    path.join(root, "architecture", "optimizer-reason-codes.json"),
  ];
  return [...new Set(candidates.map((filename) => path.resolve(filename)))]
    .filter((filename) => fs.existsSync(filename))
    .sort((left, right) => repositoryPath(root, left).localeCompare(
      repositoryPath(root, right),
    ));
}

function inputIdentity(root = ROOT) {
  const files = dashboardInputFiles(root);
  let bytes = 0;
  const hash = crypto.createHash("sha256");
  for (const filename of files) {
    const content = fs.readFileSync(filename);
    const relative = repositoryPath(root, filename);
    bytes += content.byteLength;
    hash.update(`${relative}\0${content.byteLength}\0`);
    hash.update(content);
    hash.update("\0");
  }
  return {
    digest: hash.digest("hex"),
    files: files.length,
    bytes,
  };
}

function compilerControlIdentity() {
  return {
    mode: "python",
    for_linting: true,
    runtime_imports: false,
    exact_integer_literals: true,
    strict_python_scopes: true,
    scoped_flags: {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    },
    optimization_level: "O2",
    optimization_explain: true,
    optimization_contract_policy: "diagnose",
    disabled_passes: [],
    required_passes: [],
  };
}

function createCompilerIdentity(root, irSchema, optimizerCatalog) {
  return canonicalCompilerIdentity({
    root,
    irSchema,
    optimizerCatalog,
    optionsDigest: sha256(canonicalJson(compilerControlIdentity())),
  });
}

function sourceRegion(root, node, fallbackPath) {
  const start = node?.start ?? {};
  const end = node?.end ?? start;
  return {
    path: repositoryPath(root, start.file ?? fallbackPath),
    line: Number(start.line ?? 0),
    column: Number(start.col ?? 0),
    endLine: Number(end.line ?? start.line ?? 0),
    endColumn: Number(end.col ?? start.col ?? 0),
  };
}

function locationKey(value) {
  return `${value.path}\0${value.line}\0${value.column}`;
}

function stableId(kind, value) {
  return `${kind}:${sha256(JSON.stringify(value)).slice(0, 24)}`;
}

function nodeChildren(value) {
  return Object.entries(value)
    .filter(([key, child]) =>
      !IGNORED_AST_KEYS.has(key) && typeof child !== "function")
    .map(([, child]) => child);
}

function isSemanticLoop(value) {
  return SEMANTIC_LOOP_KINDS.has(value?.constructor?.name ?? "");
}

function expressionName(compiler, expression) {
  if (expression instanceof compiler.AST_SymbolRef) return expression.name;
  if (expression instanceof compiler.AST_Dot) {
    const prefix = expressionName(compiler, expression.expression);
    return prefix ? `${prefix}.${expression.property}` : String(expression.property);
  }
  return "";
}

function emptyMetrics() {
  return {
    binaryOperationSites: 0,
    unaryOperationSites: 0,
    callSites: 0,
    knownCoercionSites: 0,
    itemAccessSites: 0,
    collectionAllocationSites: 0,
    branchSites: 0,
    nestedLoopSites: 0,
    potentialBoundaryCallSites: 0,
    unresolvedCallSites: 0,
    potentialObjectResultSites: 0,
  };
}

function loopMetrics(compiler, loop) {
  const metrics = emptyMetrics();
  const seen = new Set();
  const visit = (value, root = false) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;
    if (!root && (value instanceof compiler.AST_Function ||
        value instanceof compiler.AST_Method || value instanceof compiler.AST_Class)) {
      return;
    }
    if (!root && isSemanticLoop(value)) {
      metrics.nestedLoopSites += 1;
      return;
    }
    if (value instanceof compiler.AST_Assign) {
      // Assignment itself is not an arithmetic result site; its children are.
    } else if (value instanceof compiler.AST_Binary) {
      metrics.binaryOperationSites += 1;
    } else if (value instanceof compiler.AST_Unary) {
      metrics.unaryOperationSites += 1;
    }
    if (value instanceof compiler.AST_Call) {
      metrics.callSites += 1;
      const name = expressionName(compiler, value.expression);
      const leaf = name.split(".").at(-1) ?? "";
      if (COERCION_NAMES.has(name) || COERCION_NAMES.has(leaf)) {
        metrics.knownCoercionSites += 1;
      }
      if (/(?:^|[._])(ffi|native|kernel|wasm)(?:$|[._A-Z])/i.test(name)) {
        metrics.potentialBoundaryCallSites += 1;
      } else {
        metrics.unresolvedCallSites += 1;
      }
    }
    if (value instanceof compiler.AST_ItemAccess) metrics.itemAccessSites += 1;
    if (value instanceof compiler.AST_Array || value instanceof compiler.AST_Object ||
        value instanceof compiler.AST_Set ||
        value instanceof compiler.AST_ListComprehension ||
        value instanceof compiler.AST_SetComprehension ||
        value instanceof compiler.AST_DictComprehension) {
      metrics.collectionAllocationSites += 1;
    }
    if (value instanceof compiler.AST_If || value instanceof compiler.AST_Try) {
      metrics.branchSites += 1;
    }
    for (const child of nodeChildren(value)) visit(child);
  };
  visit(loop, true);
  metrics.potentialObjectResultSites =
    metrics.binaryOperationSites + metrics.unaryOperationSites +
    metrics.callSites + metrics.collectionAllocationSites;
  return metrics;
}

function annotationSummary(definition) {
  return (definition.argnames ?? []).map((argument) => ({
    name: String(argument?.name ?? ""),
    annotation: typeof argument?.annotation_text === "string"
      ? argument.annotation_text
      : (typeof argument?.annotation?.name === "string"
        ? argument.annotation.name
        : null),
  }));
}

function sourceLine(source, line) {
  if (!Number.isSafeInteger(line) || line < 1) return "";
  return (source.split("\n")[line - 1] ?? "").trim().slice(0, 240);
}

function sourceExcerpt(source, region) {
  if (!Number.isSafeInteger(region.line) || region.line < 1 ||
      !Number.isSafeInteger(region.endLine) || region.endLine < region.line) {
    return "";
  }
  const lines = source.split("\n");
  const first = region.line - 1;
  const last = region.endLine - 1;
  if (first >= lines.length) return "";
  if (first === last) {
    return (lines[first] ?? "").slice(region.column, region.endColumn);
  }
  return [
    (lines[first] ?? "").slice(region.column),
    ...lines.slice(first + 1, last),
    (lines[last] ?? "").slice(0, region.endColumn),
  ].join("\n");
}

function nextLexicalOrdinal(ordinals, key) {
  const ordinal = ordinals.get(key) ?? 0;
  ordinals.set(key, ordinal + 1);
  return ordinal;
}

function identityRange(region) {
  return {
    startLine: region.line,
    startColumn: region.column,
    endLine: region.endLine,
    endColumn: region.endColumn,
  };
}

function inventoryAst({ compiler, ast, root, filename, relativePath, source,
  sourceUnitId, semanticSourceFingerprint: sourceFingerprint, semanticOccurrenceKey,
  semanticRegionKind }) {
  const functions = [];
  const loops = [];
  const functionById = new Map();
  const functionOrdinals = new Map();
  const loopOrdinals = new Map();
  const seen = new Set();
  const moduleRegion = sourceRegion(root, ast, filename);
  const moduleIdentity = functionIdentity({
    sourceUnitId,
    qualifiedName: "<module>",
    kind: "module",
    semanticFingerprint: sourceFingerprint(ast, source),
    range: identityRange(moduleRegion),
    ordinal: 0,
  });

  const visit = (value, state) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child, state);
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;

    const isMethod = value instanceof compiler.AST_Method;
    const isFunction = value instanceof compiler.AST_Function;
    const isLambda = value.is_lambda === true ||
      (value instanceof compiler.AST_Lambda && !isFunction && !isMethod);
    if (isFunction || isMethod || isLambda) {
      const name = String(value.name?.name ?? value.name ?? "<anonymous>");
      const qualifier = [...state.qualifier, name];
      const region = sourceRegion(root, value, filename);
      const kind = isMethod ? "method" : isLambda ? "lambda" : "function";
      const fingerprint = sourceFingerprint(value, source);
      const ordinalKey = semanticOccurrenceKey({
        ownerId: state.functionId ?? moduleIdentity.id,
        qualifiedName: qualifier.join("."),
        kind,
        semanticFingerprint: fingerprint,
      });
      const ordinal = nextLexicalOrdinal(functionOrdinals, ordinalKey);
      const identity = functionIdentity({
        sourceUnitId,
        qualifiedName: qualifier.join("."),
        kind,
        semanticFingerprint: fingerprint,
        range: identityRange(region),
        ordinal,
      });
      const record = {
        id: identity.id,
        sourceUnitId,
        path: relativePath,
        qualifiedName: qualifier.join("."),
        kind,
        semanticFingerprint: fingerprint,
        excerptDigest: sha256(sourceExcerpt(source, region)),
        ordinal,
        source: region,
        sourceLine: sourceLine(source, region.line),
        annotations: annotationSummary(value),
        loopIds: [],
      };
      functions.push(record);
      functionById.set(identity.id, record);
      visit(value.body, {
        qualifier,
        functionId: identity.id,
        loopDepth: 0,
      });
      return;
    }

    if (value instanceof compiler.AST_Class) {
      const name = String(value.name?.name ?? value.name ?? "<anonymous-class>");
      visit(value.body, {
        ...state,
        qualifier: [...state.qualifier, name],
      });
      return;
    }

    const isLoop = isSemanticLoop(value);
    let childState = state;
    if (isLoop) {
      const region = sourceRegion(root, value, filename);
      const kind = semanticRegionKind(value);
      const fingerprint = sourceFingerprint(value, source);
      const ordinalKey = semanticOccurrenceKey({
        ownerId: state.functionId ?? moduleIdentity.id,
        kind,
        semanticFingerprint: fingerprint,
      });
      const ordinal = nextLexicalOrdinal(loopOrdinals, ordinalKey);
      const identity = semanticRegionIdentity({
        functionId: state.functionId ?? moduleIdentity.id,
        kind,
        semanticFingerprint: fingerprint,
        range: identityRange(region),
        ordinal,
      });
      const record = {
        id: identity.id,
        sourceUnitId,
        functionId: state.functionId,
        semanticFingerprint: fingerprint,
        excerptDigest: sha256(sourceExcerpt(source, region)),
        ordinal,
        source: region,
        sourceLine: sourceLine(source, region.line),
        kind,
        depth: state.loopDepth + 1,
        metrics: loopMetrics(compiler, value),
        decisions: [],
        status: state.functionId ? "unrecognized" : "module-scope",
        reasonCodes: [],
        suggestedContracts: [],
      };
      loops.push(record);
      if (state.functionId) functionById.get(state.functionId).loopIds.push(identity.id);
      childState = { ...state, loopDepth: state.loopDepth + 1 };
    }

    for (const child of nodeChildren(value)) visit(child, childState);
  };

  visit(ast, { qualifier: [], functionId: null, loopDepth: 0 });
  return { functions, loops, moduleIdentity };
}

function normalizeQuantity(value) {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (value === "runtime-dependent" || value === "not-applicable") return value;
  return "runtime-dependent";
}

function normalizeCost(cost) {
  const result = {};
  for (const field of [
    "arithmeticOperations",
    "representationConversions",
    "boundaryCrossings",
    "copiedBytes",
    "allocations",
    "cleanupOperations",
    "compileMilliseconds",
    "instantiateMilliseconds",
    "loadMilliseconds",
    "materializations",
    "emittedBytes",
    "totalUnits",
  ]) result[field] = normalizeQuantity(cost?.[field]);
  return result;
}

function suggestedContract(decision, targetKind) {
  const target = ["v8", "wasm", "native", "library", "adaptive", "generic"]
    .includes(targetKind) ? targetKind : "auto";
  return {
    import: "from sagejs.compiler import optimize",
    decorator:
      `@optimize(require=${JSON.stringify(decision.passId)}, ` +
      `target=${JSON.stringify(target)}, guard_failure="fallback")`,
    passId: decision.passId,
    target,
    condition: decision.selected
      ? "pins the already-proved optimization"
      : "apply only after every listed compiler rejection is resolved",
  };
}

function rejectedTargetsForReason(decision, reason) {
  const rejected = decision.candidates.filter((candidate) =>
    candidate.kind !== "generic" && candidate.availability === "rejected");
  const matching = rejected.filter(
    (candidate) => candidate.rejectionReason === reason,
  );
  return matching.length > 0 ? matching : rejected;
}

function normalizeDecision(root, decision, loopId, compilerId) {
  const detailed = decision.selected || decision.rejectionReasons.length === 1;
  const candidates = decision.target.candidates.map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    representation: candidate.representation,
    availability: candidate.availability,
    rejectionReason: candidate.rejectionReason,
    ...(detailed ? { cost: normalizeCost(candidate.cost) } : {}),
  }));
  const selectedCandidate = candidates.find(
    (candidate) => candidate.id === decision.target.selectedCandidate,
  ) ?? null;
  const source = {
    path: repositoryPath(root, decision.source.filename),
    line: decision.source.line,
    column: decision.source.column,
    endLine: decision.source.endLine,
    endColumn: decision.source.endColumn,
  };
  const normalized = {
    passId: decision.passId,
    selected: decision.selected,
    detailLevel: detailed ? "full" : "summary",
    source,
    rejectionReasons: [...decision.rejectionReasons].sort(),
    mathematicalDomain: decision.mathematical.domain,
    mathematicalKind: decision.mathematical.kind,
    operations: [...decision.mathematical.operations],
    representation: decision.representation.kind,
    representationConversions: [...decision.representation.conversions],
    materializations: decision.representation.materializations,
    target: decision.target.kind,
    lowering: decision.target.lowering,
    boundaryCrossings: decision.target.boundaryCrossings,
    copiedBytes: decision.target.copiedBytes,
    selectedCandidate,
    candidates,
    facts: detailed ? decision.facts.map((fact) => ({ ...fact })) : [],
    guards: detailed ? [...decision.guards].sort() : [],
  };
  const evidenceDigest = sha256(canonicalJson(normalized));
  const identity = decisionIdentity({
    regionId: loopId,
    passId: normalized.passId,
    compilerId,
  });
  return {
    id: identity.id,
    evidenceDigest,
    ...normalized,
    fallbackId: contentIdentity("sagejs.optimizer-fallback-identity/v1", {
      regionId: loopId,
      passId: normalized.passId,
    }),
  };
}

function unrecognizedReasons(loop, owner) {
  const reasons = ["dashboard.no-current-pass-claimed"];
  if (loop.kind === "AST_While") reasons.push("dashboard.unsupported-while-loop");
  if (loop.kind.includes("Comprehension")) reasons.push("dashboard.comprehension-loop");
  if (loop.metrics.callSites > 0) reasons.push("dashboard.dynamic-call-sites");
  if (loop.metrics.itemAccessSites > 0) reasons.push("dashboard.indexed-access-sites");
  if (loop.metrics.branchSites > 0) reasons.push("dashboard.control-flow-sites");
  if (loop.metrics.nestedLoopSites > 0) reasons.push("dashboard.nested-loop-sites");
  const annotations = new Set(
    (owner?.annotations ?? []).map((argument) => argument.annotation).filter(Boolean),
  );
  if (![...annotations].some((value) =>
    value === "int" || value === "float" || value.startsWith("tuple[") ||
    value.includes("IntegerBuffer") || value.includes("NativeIntegerVector"))) {
    reasons.push("dashboard.no-mathematical-domain-evidence");
  }
  return [...new Set(reasons)].sort();
}

function reasonRemediation(reason) {
  if (REASON_REMEDIATIONS[reason]) return REASON_REMEDIATIONS[reason];
  if (reason.startsWith("bounded-integer.unsupported-operation:")) {
    return "Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass.";
  }
  return `Resolve the stable compiler rejection ${JSON.stringify(reason)} and rerun the dashboard.`;
}

function correlateDecisions({ root, functions, loops, program, compilerId }) {
  const loopByLocation = new Map();
  for (const loop of loops) {
    const key = locationKey(loop.source);
    if (!loopByLocation.has(key)) loopByLocation.set(key, []);
    loopByLocation.get(key).push(loop);
  }
  const orphans = [];
  for (const region of program.regions) {
    const decisionSource = {
      path: repositoryPath(root, region.source.filename),
      line: region.source.line,
      column: region.source.column,
    };
    const matching = loopByLocation.get(locationKey(decisionSource)) ?? [];
    if (matching.length !== 1) {
      const orphan = {
        source: decisionSource,
        passId: region.passId,
        error: `expected one semantic region, found ${matching.length}`,
      };
      orphans.push({
        id: contentIdentity("sagejs.optimizer-orphan-decision/v1", orphan),
        ...orphan,
      });
      continue;
    }
    const decision = normalizeDecision(root, region, matching[0].id, compilerId);
    matching[0].decisions.push(decision);
  }

  const functionById = new Map(functions.map((record) => [record.id, record]));
  for (const loop of loops) {
    loop.decisions.sort((left, right) => left.id.localeCompare(right.id));
    if (!loop.functionId) {
      loop.reasonCodes = ["dashboard.module-scope-loop"];
      continue;
    }
    const selected = loop.decisions.filter((decision) => decision.selected);
    if (selected.length > 0) {
      loop.status = "selected";
      loop.reasonCodes = [];
      loop.suggestedContracts = selected.map((decision) =>
        suggestedContract(decision, decision.target));
      continue;
    }
    if (loop.decisions.length > 0) {
      loop.status = "rejected";
      loop.reasonCodes = [...new Set(loop.decisions.flatMap(
        (decision) => decision.rejectionReasons,
      ))].sort();
      loop.suggestedContracts = loop.decisions
        .filter((decision) => decision.rejectionReasons.length === 1)
        .map((decision) => {
          const target = rejectedTargetsForReason(
            decision,
            decision.rejectionReasons[0],
          )[0]?.kind ?? "auto";
          return suggestedContract(decision, target);
        });
      continue;
    }
    loop.status = "unrecognized";
    loop.reasonCodes = unrecognizedReasons(loop, functionById.get(loop.functionId));
  }
  return orphans;
}

function quantityCounter() {
  return { known: 0, runtimeDependent: 0, notApplicable: 0 };
}

function addQuantity(counter, value) {
  if (Number.isSafeInteger(value) && value >= 0) counter.known += value;
  else if (value === "not-applicable") counter.notApplicable += 1;
  else counter.runtimeDependent += 1;
}

function selectedCostAggregates(loops) {
  const result = {
    allocations: quantityCounter(),
    coercions: quantityCounter(),
    boundaryCrossings: quantityCounter(),
    copiedBytes: quantityCounter(),
    materializations: quantityCounter(),
  };
  for (const decision of loops.flatMap((loop) => loop.decisions)
    .filter((decision) => decision.selected)) {
    const cost = decision.selectedCandidate?.cost;
    if (!cost) continue;
    addQuantity(result.allocations, cost.allocations);
    addQuantity(result.coercions, cost.representationConversions);
    addQuantity(result.boundaryCrossings, cost.boundaryCrossings);
    addQuantity(result.copiedBytes, cost.copiedBytes);
    addQuantity(result.materializations, cost.materializations);
  }
  return result;
}

function histogram(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));
}

function buildNearMisses(loops, functionById) {
  const result = [];
  for (const loop of loops) {
    if (loop.status !== "rejected") continue;
    for (const decision of loop.decisions) {
      if (decision.selected || decision.rejectionReasons.length !== 1) continue;
      const reason = decision.rejectionReasons[0];
      const targets = rejectedTargetsForReason(decision, reason);
      if (targets.length === 0) continue;
      const owner = functionById.get(loop.functionId);
      result.push({
        id: contentIdentity("sagejs.optimizer-near-miss/v1", {
          loopId: loop.id,
          passId: decision.passId,
          reason,
        }),
        loopId: loop.id,
        functionId: loop.functionId,
        qualifiedName: owner?.qualifiedName ?? null,
        source: loop.source,
        passId: decision.passId,
        reason,
        remediation: reasonRemediation(reason),
        potentialObjectResultSites: loop.metrics.potentialObjectResultSites,
        targetCandidates: targets.map((target) => ({
          id: target.id,
          kind: target.kind,
          representation: target.representation,
          cost: target.cost,
        })),
        suggestedContract: suggestedContract(decision, targets[0].kind),
      });
    }
  }
  return result.sort((left, right) =>
    right.potentialObjectResultSites - left.potentialObjectResultSites ||
    left.source.path.localeCompare(right.source.path) ||
    left.source.line - right.source.line || left.id.localeCompare(right.id));
}

function sumMetric(loops, field) {
  return loops.reduce((sum, loop) => sum + loop.metrics[field], 0);
}

function finalizeDashboard({ root, identity, sourceBundle, compilerIdentity: compiler,
  files, functions, loops, orphans }) {
  functions.sort((left, right) =>
    left.path.localeCompare(right.path) || left.source.line - right.source.line ||
    left.qualifiedName.localeCompare(right.qualifiedName));
  loops.sort((left, right) =>
    left.source.path.localeCompare(right.source.path) ||
    left.source.line - right.source.line || left.source.column - right.source.column ||
    left.id.localeCompare(right.id));
  const suitable = functions.filter((record) => record.loopIds.length > 0);
  const functionById = new Map(functions.map((record) => [record.id, record]));
  const inFunctions = loops.filter((loop) => loop.functionId !== null);
  const decisions = loops.flatMap((loop) => loop.decisions);
  const selected = inFunctions.filter((loop) => loop.status === "selected");
  const rejected = inFunctions.filter((loop) => loop.status === "rejected");
  const unrecognized = inFunctions.filter((loop) => loop.status === "unrecognized");
  const reasons = histogram(inFunctions.flatMap((loop) => loop.reasonCodes));
  const passDecisions = histogram(decisions.map((decision) =>
    `${decision.passId}:${decision.selected ? "selected" : "rejected"}`));
  const nearMisses = buildNearMisses(inFunctions, functionById);

  const dashboard = {
    schema: SCHEMA,
    generator: GENERATOR,
    optimizationLevel: "O2",
    scope: {
      roots: ["bench/optimizer-workloads", "src/lib"],
      policy:
        "ordinary CPython-parseable modules are lowered with imports stubbed; " +
        "library and explicit control sources are counted separately, every " +
        "function/method/lambda identity is retained, and loops remain separately queryable",
    },
    inputs: identity,
    sourceBundle,
    compilerIdentity: compiler,
    summary: {
      sourceFilesDiscovered: files.length,
      sourceFilesCompiled: files.filter((file) => file.status === "compiled").length,
      sourceFilesFailed: files.filter((file) => file.status !== "compiled").length,
      librarySourceFilesDiscovered: files.filter((file) => file.scope === "library").length,
      librarySourceFilesCompiled: files.filter((file) =>
        file.scope === "library" && file.status === "compiled").length,
      librarySourceFilesFailed: files.filter((file) =>
        file.scope === "library" && file.status !== "compiled").length,
      controlSourceFilesDiscovered: files.filter((file) => file.scope === "control").length,
      controlSourceFilesCompiled: files.filter((file) =>
        file.scope === "control" && file.status === "compiled").length,
      controlSourceFilesFailed: files.filter((file) =>
        file.scope === "control" && file.status !== "compiled").length,
      functionsCompiled: functions.length,
      suitableFunctions: suitable.length,
      loopsInFunctions: inFunctions.length,
      moduleScopeLoops: loops.length - inFunctions.length,
      selectedLoops: selected.length,
      rejectedLoops: rejected.length,
      unrecognizedLoops: unrecognized.length,
      optimizerDecisions: decisions.length,
      orphanOptimizerDecisions: orphans.length,
      oneReasonNearMisses: nearMisses.length,
    },
    estimates: {
      interpretation:
        "static sites are source-shape indicators, not dynamic counts; selected target " +
        "costs come from verified optimizer IR and retain runtime-dependent quantities",
      staticSites: {
        potentialObjectResults: sumMetric(inFunctions, "potentialObjectResultSites"),
        collectionAllocations: sumMetric(inFunctions, "collectionAllocationSites"),
        knownCoercions: sumMetric(inFunctions, "knownCoercionSites"),
        potentialBoundaryCalls: sumMetric(inFunctions, "potentialBoundaryCallSites"),
        unresolvedCalls: sumMetric(inFunctions, "unresolvedCallSites"),
      },
      selectedTargetCosts: selectedCostAggregates(inFunctions),
    },
    reasonCounts: reasons,
    passDecisionCounts: passDecisions,
    nearMisses,
    files,
    functions,
    loops,
    orphanDecisions: orphans.sort((left, right) => left.id.localeCompare(right.id)),
  };
  const { schema, ...payload } = dashboard;
  return {
    schema,
    id: documentIdentity(dashboard),
    ...payload,
  };
}

function parserOptions(root, filename, logicalFilename = repositoryPath(root, filename)) {
  return {
    filename: logicalFilename,
    basedir: path.dirname(filename),
    libdir: path.join(root, "src", "lib"),
    import_dirs: [],
    for_linting: true,
    runtime_imports: false,
    exact_integer_literals: true,
    strict_python_scopes: true,
    scoped_flags: {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    },
    optimization_level: "O2",
    optimization_explain: true,
    optimization_contract_policy: "diagnose",
  };
}

async function analyzeSources({ root = ROOT, compilerRoot = root, sources, identity }) {
  const createCompiler = require(path.join(
    compilerRoot,
    "dist",
    "tools",
    "compiler.js",
  )).default;
  const { createPythonCompilerFrontend } = require(path.join(
    compilerRoot,
    "dist",
    "tools",
    "python",
    "compiler-frontend.js",
  ));
  const { explainOptimizationProgram, verifyOptimizationProgram } = require(path.join(
    compilerRoot,
    "dist",
    "tools",
    "python",
    "optimizer",
    "index.js",
  ));
  const { optimizerCatalog } = require(path.join(
    compilerRoot,
    "dist",
    "tools",
    "python",
    "optimizer",
    "catalog.js",
  ));
  const {
    semanticSourceFingerprint,
    semanticOccurrenceKey,
    semanticRegionKind,
  } = require(path.join(
    compilerRoot,
    "dist",
    "tools",
    "python",
    "optimizer",
    "profile-map.js",
  ));
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  const files = [];
  const functions = [];
  const loops = [];
  const orphans = [];
  let compilerDocument = null;
  try {
    for (const item of [...sources].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath))) {
      const relativePath = normalizedRepositoryPath(item.relativePath);
      const sourceDigest = sha256(item.source);
      const sourceUnit = sourceUnitIdentity({
        path: relativePath,
        digest: sourceDigest,
        language: "python",
      });
      const fileRecord = {
        id: sourceUnit.id,
        path: relativePath,
        sourceDigest,
        scope: item.scope ?? (relativePath.startsWith("bench/optimizer-workloads/")
          ? "control"
          : "library"),
        bytes: Buffer.byteLength(item.source),
        status: "compiled",
        error: null,
        functions: 0,
        loops: 0,
        optimizerDecisions: 0,
      };
      try {
        const ast = frontend.parse(
          item.source,
          parserOptions(root, item.filename, item.relativePath),
        );
        verifyOptimizationProgram(ast.optimization_ir);
        const program = explainOptimizationProgram(ast.optimization_ir);
        if (compilerDocument === null) {
          compilerDocument = createCompilerIdentity(
            compilerRoot,
            program.schema,
            optimizerCatalog,
          );
        } else if (compilerDocument.irSchema !== program.schema) {
          throw new Error("compiler IR schema changed during dashboard analysis");
        }
        const inventory = inventoryAst({
          compiler,
          ast,
          root,
          filename: item.filename,
          relativePath,
          source: item.source,
          sourceUnitId: sourceUnit.id,
          semanticSourceFingerprint,
          semanticOccurrenceKey,
          semanticRegionKind,
        });
        fileRecord.moduleIdentity = inventory.moduleIdentity;
        const unmatched = correlateDecisions({
          root,
          functions: inventory.functions,
          loops: inventory.loops,
          program,
          compilerId: compilerDocument.id,
        });
        fileRecord.functions = inventory.functions.length;
        fileRecord.loops = inventory.loops.length;
        fileRecord.optimizerDecisions = program.regions.length;
        functions.push(...inventory.functions);
        loops.push(...inventory.loops);
        orphans.push(...unmatched);
      } catch (error) {
        fileRecord.status = "failed";
        fileRecord.error = String(error?.message ?? error);
      }
      files.push(fileRecord);
    }
  } finally {
    frontend.close();
  }
  if (compilerDocument === null) {
    throw new Error("optimizer opportunity analysis requires at least one compiled source");
  }
  const sourceBundle = sourceBundleFromRecords(files.map((file) => ({
    path: file.path,
    digest: file.sourceDigest,
    bytes: file.bytes,
  })));
  return finalizeDashboard({
    root,
    identity: identity ?? {
      digest: sha256([...sources].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath)).map((item) =>
        `${normalizedRepositoryPath(item.relativePath)}\0${item.source}`).join("\0")),
      files: sources.length,
      bytes: sources.reduce((sum, item) => sum + Buffer.byteLength(item.source), 0),
    },
    sourceBundle,
    compilerIdentity: compilerDocument,
    files,
    functions,
    loops,
    orphans,
  });
}

async function analyzeRepository(root = ROOT) {
  const libraryFiles = recursiveFiles(
    path.join(root, "src", "lib"),
    (name) => name.endsWith(".py"),
  );
  const controlFiles = recursiveFiles(
    path.join(root, "bench", "optimizer-workloads"),
    (name) => name.endsWith(".py"),
  );
  const filenames = [...libraryFiles, ...controlFiles];
  const sources = filenames.map((filename) => ({
    filename,
    relativePath: repositoryPath(root, filename),
    source: fs.readFileSync(filename, "utf8"),
    scope: filename.startsWith(`${path.join(root, "bench", "optimizer-workloads")}${path.sep}`)
      ? "control"
      : "library",
  }));
  const dashboard = await analyzeSources({
    root,
    sources,
    identity: inputIdentity(root),
  });
  if (dashboard.summary.sourceFilesFailed !== 0) {
    const failures = dashboard.files
      .filter((file) => file.status !== "compiled")
      .map((file) => `${file.path}: ${file.error}`)
      .join("\n");
    throw new Error(
      `optimizer opportunity scan failed to compile ` +
      `${dashboard.summary.sourceFilesFailed} source module(s):\n${failures}`,
    );
  }
  if (dashboard.summary.orphanOptimizerDecisions !== 0) {
    throw new Error(
      `optimizer opportunity scan could not attach ` +
      `${dashboard.summary.orphanOptimizerDecisions} decision(s) to source loops`,
    );
  }
  return dashboard;
}

function markdownLink(source) {
  const target = source.path.startsWith("src/")
    ? `../${source.path}`
    : source.path;
  return `[${source.path}:${source.line}](${target}#L${source.line})`;
}

function renderQuantity(value) {
  return `${value.known} known; ${value.runtimeDependent} runtime-dependent`;
}

function renderMarkdown(dashboard) {
  validateDashboard(dashboard);
  const lines = [
    "---",
    'title: "Optimization opportunity dashboard"',
    "---",
    "",
    "# Optimization opportunity dashboard",
    "",
    "This generated dashboard compiles every ordinary Python module under `src/lib` and each",
    "explicit control source under `bench/optimizer-workloads` at `O2` without executing it.",
    "Imports are stubbed, optimizer IR is independently verified, and every loop-bearing",
    "function, method, or lambda is retained with its exact source location and portable identity.",
    "",
    `Input identity: \`${dashboard.inputs.digest}\` (${dashboard.inputs.files} files, ` +
      `${dashboard.inputs.bytes} bytes).`,
    `Analyzed source bundle: \`${dashboard.sourceBundle.id}\`; compiler identity: ` +
      `\`${dashboard.compilerIdentity.id}\`.`,
    "",
    "The complete machine census is stored outside Git as immutable GitHub Release assets.",
    "`architecture/optimizer-opportunities.manifest.json` binds its canonical NDJSON logical",
    "identity, indexed SQLite query artifact, legacy JSON archive, and physical SHA-256 digests.",
    "Queries download and verify the SQLite artifact once, then reuse the ignored local cache.",
    "",
    "Regenerate or verify it with:",
    "",
    "```bash",
    "pnpm optimizer:opportunities",
    "pnpm optimizer:opportunities:check",
    "pnpm optimizer:opportunities:fetch",
    "pnpm optimizer:opportunities:materialize -- build/optimizer-opportunities.json",
    "pnpm optimizer:opportunities:query -- src/lib/sagejs/number_fields/class_unit_groups.py:1",
    "pnpm optimizer:opportunities:query -- sha256:<digest>",
    "```",
    "",
    "## Summary",
    "",
    "| Measure | Count |",
    "| --- | ---: |",
    `| Source modules compiled | ${dashboard.summary.sourceFilesCompiled} / ` +
      `${dashboard.summary.sourceFilesDiscovered} |`,
    `| Library modules compiled | ${dashboard.summary.librarySourceFilesCompiled} / ` +
      `${dashboard.summary.librarySourceFilesDiscovered} |`,
    `| Explicit control sources compiled | ${dashboard.summary.controlSourceFilesCompiled} / ` +
      `${dashboard.summary.controlSourceFilesDiscovered} |`,
    `| Functions and methods compiled | ${dashboard.summary.functionsCompiled} |`,
    `| Loop-bearing functions and methods | ${dashboard.summary.suitableFunctions} |`,
    `| Loops in functions | ${dashboard.summary.loopsInFunctions} |`,
    `| Selected optimized loops | ${dashboard.summary.selectedLoops} |`,
    `| Compiler-rejected loops | ${dashboard.summary.rejectedLoops} |`,
    `| Unrecognized loops | ${dashboard.summary.unrecognizedLoops} |`,
    `| One-reason compiler near-misses | ${dashboard.summary.oneReasonNearMisses} |`,
    "",
    "A rejected loop has a stable reason from a domain pass. An unrecognized loop was compiled",
    "but no current mathematical-domain pass claimed it; dashboard reason codes for those loops",
    "are explicitly heuristic triage signals, not correctness proofs.",
    "",
    "## Static and verified cost evidence",
    "",
    `- Potential object-result sites: ${dashboard.estimates.staticSites.potentialObjectResults}`,
    `- Collection-allocation sites: ${dashboard.estimates.staticSites.collectionAllocations}`,
    `- Known coercion sites: ${dashboard.estimates.staticSites.knownCoercions}`,
    `- Potential boundary-call sites: ${dashboard.estimates.staticSites.potentialBoundaryCalls}`,
    `- Unresolved call sites: ${dashboard.estimates.staticSites.unresolvedCalls}`,
    `- Selected-target allocations: ${renderQuantity(
      dashboard.estimates.selectedTargetCosts.allocations,
    )}`,
    `- Selected-target representation conversions: ${renderQuantity(
      dashboard.estimates.selectedTargetCosts.coercions,
    )}`,
    `- Selected-target boundary crossings: ${renderQuantity(
      dashboard.estimates.selectedTargetCosts.boundaryCrossings,
    )}`,
    "",
    "Static sites are not runtime event counts. Use profiling before prioritizing work.",
    "",
    "## Highest-signal one-reason near-misses",
    "",
    "These are ordered by static potential object-result sites only; that ordering is a triage",
    "convenience, not a performance ranking.",
    "",
    "| Source | Function | Pass | Stable reason | Suggested next proof |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const item of dashboard.nearMisses.slice(0, 50)) {
    lines.push(
      `| ${markdownLink(item.source)} | \`${item.qualifiedName ?? "<module>"}\` | ` +
        `\`${item.passId}\` | \`${item.reason}\` | ${item.remediation} |`,
    );
  }
  if (dashboard.nearMisses.length === 0) lines.push("| _None_ | | | | |");
  lines.push(
    "",
    "## Most frequent reason codes",
    "",
    "| Stable reason | Loops | Remediation |",
    "| --- | ---: | --- |",
  );
  for (const item of dashboard.reasonCounts.slice(0, 40)) {
    lines.push(`| \`${item.id}\` | ${item.count} | ${reasonRemediation(item.id)} |`);
  }
  lines.push(
    "",
    "## Interpretation limits",
    "",
    "- The dashboard proves compiler selection/rejection, not that a loop is dynamically hot.",
    "- Calls without authenticated provenance remain unresolved rather than being mislabeled as",
    "  native or Wasm crossings.",
    "- IEEE-754 and exact arithmetic retain different domains and proof obligations.",
    "- A suggested `@optimize` contract pins a proof; it does not create one. Rejected regions",
    "  must first resolve every listed reason.",
    "- Runtime guard fallbacks are visible through evaluation receipts and are not predicted by",
    "  this source-only dashboard.",
  );
  return `${lines.join("\n")}\n`;
}

function validateCounter(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
}

function requireDigest(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
}

function requireContentId(value, label) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a schema-addressed SHA-256 identity`);
  }
}

function sameIdentity(actual, expected, label) {
  if (!plainObject(actual) || canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} has inconsistent portable identity`);
  }
}

function validateDecisionIdentity(decision, loopId, compilerId) {
  requireDigest(decision.evidenceDigest, `decision ${decision.id} evidenceDigest`);
  const { id, evidenceDigest, fallbackId, ...payload } = decision;
  if (sha256(canonicalJson(payload)) !== evidenceDigest) {
    throw new Error(`decision ${id} has inconsistent semantic evidence`);
  }
  const expected = decisionIdentity({
    regionId: loopId,
    passId: decision.passId,
    compilerId,
  });
  const expectedFallback = contentIdentity("sagejs.optimizer-fallback-identity/v1", {
    regionId: loopId,
    passId: decision.passId,
  });
  if (id !== expected.id || fallbackId !== expectedFallback) {
    throw new Error(`decision ${id} has inconsistent portable identity`);
  }
}

function validateDashboard(dashboard, { expectedInput } = {}) {
  if (!plainObject(dashboard) || dashboard.schema !== SCHEMA ||
      dashboard.generator !== GENERATOR || dashboard.optimizationLevel !== "O2") {
    throw new Error("unsupported optimizer opportunity dashboard schema");
  }
  if (!plainObject(dashboard.inputs) || !/^[0-9a-f]{64}$/.test(
    dashboard.inputs.digest ?? "")) {
    throw new Error("optimizer opportunity dashboard has no input identity");
  }
  if (expectedInput && JSON.stringify(dashboard.inputs) !== JSON.stringify(expectedInput)) {
    throw new Error(
      `optimizer opportunity dashboard is stale: expected ${expectedInput.digest}, ` +
      `found ${dashboard.inputs.digest}`,
    );
  }
  for (const name of ["files", "functions", "loops", "nearMisses", "reasonCounts"]) {
    if (!Array.isArray(dashboard[name])) throw new Error(`dashboard ${name} must be an array`);
  }
  const expectedSourceBundle = sourceBundleFromRecords(dashboard.files.map((file) => ({
    path: file.path,
    digest: file.sourceDigest,
    bytes: file.bytes,
  })));
  sameIdentity(
    dashboard.sourceBundle,
    expectedSourceBundle,
    "dashboard source bundle",
  );
  const expectedCompiler = compilerIdentity({
    irSchema: dashboard.compilerIdentity?.irSchema,
    compilerSourceBundleId: dashboard.compilerIdentity?.compilerSourceBundleId,
    frontendDigest: dashboard.compilerIdentity?.frontendDigest,
    catalogDigest: dashboard.compilerIdentity?.catalogDigest,
    optionsDigest: dashboard.compilerIdentity?.optionsDigest,
  });
  sameIdentity(dashboard.compilerIdentity, expectedCompiler, "dashboard compiler identity");
  requireContentId(dashboard.compilerIdentity.id, "dashboard compiler identity id");
  const sourceUnits = new Map();
  for (const file of dashboard.files) {
    if (!plainObject(file)) throw new Error("dashboard has an invalid source unit");
    if (!["library", "control"].includes(file.scope)) {
      throw new Error(`source unit ${file.path} has invalid dashboard scope`);
    }
    requireDigest(file.sourceDigest, `source unit ${file.path} sourceDigest`);
    const expected = sourceUnitIdentity({
      path: file.path,
      digest: file.sourceDigest,
      language: "python",
    });
    if (file.id !== expected.id || sourceUnits.has(file.id)) {
      throw new Error("dashboard has invalid or duplicate source-unit identity");
    }
    const expectedModule = functionIdentity({
      sourceUnitId: file.id,
      qualifiedName: "<module>",
      kind: "module",
      semanticFingerprint: file.moduleIdentity?.semanticFingerprint,
      range: file.moduleIdentity?.range,
      ordinal: 0,
    });
    sameIdentity(file.moduleIdentity, expectedModule, `source unit ${file.path} module`);
    sourceUnits.set(file.id, file);
  }
  const functionIds = new Set();
  for (const record of dashboard.functions) {
    if (!plainObject(record)) throw new Error("dashboard has an invalid function");
    requireContentId(
      record.semanticFingerprint,
      `function ${record.id} semanticFingerprint`,
    );
    requireDigest(record.excerptDigest, `function ${record.id} excerptDigest`);
    const expected = functionIdentity({
      sourceUnitId: record.sourceUnitId,
      qualifiedName: record.qualifiedName,
      kind: record.kind,
      semanticFingerprint: record.semanticFingerprint,
      range: identityRange(record.source),
      ordinal: record.ordinal,
    });
    if (record.id !== expected.id || !sourceUnits.has(record.sourceUnitId) ||
        sourceUnits.get(record.sourceUnitId).path !== record.path ||
        functionIds.has(record.id)) {
      throw new Error("dashboard has invalid or duplicate function identity");
    }
    functionIds.add(record.id);
  }
  const loopIds = new Set();
  for (const loop of dashboard.loops) {
    if (!plainObject(loop)) throw new Error("dashboard has an invalid loop");
    requireContentId(loop.semanticFingerprint, `loop ${loop.id} semanticFingerprint`);
    requireDigest(loop.excerptDigest, `loop ${loop.id} excerptDigest`);
    const sourceUnit = sourceUnits.get(loop.sourceUnitId);
    const identityFunctionId = loop.functionId ?? sourceUnit?.moduleIdentity?.id;
    const expected = semanticRegionIdentity({
      functionId: identityFunctionId,
      kind: loop.kind,
      semanticFingerprint: loop.semanticFingerprint,
      range: identityRange(loop.source),
      ordinal: loop.ordinal,
    });
    if (loop.id !== expected.id || !sourceUnit ||
        loop.source.path !== sourceUnits.get(loop.sourceUnitId).path ||
        loopIds.has(loop.id) ||
        !["selected", "rejected", "unrecognized", "module-scope"].includes(loop.status)) {
      throw new Error("dashboard has invalid or duplicate loop identity");
    }
    if (loop.functionId !== null && !functionIds.has(loop.functionId)) {
      throw new Error(`loop ${loop.id} names an unknown function`);
    }
    for (const decision of loop.decisions) {
      validateDecisionIdentity(decision, loop.id, dashboard.compilerIdentity.id);
    }
    loopIds.add(loop.id);
  }
  for (const item of dashboard.nearMisses) {
    if (!loopIds.has(item.loopId) || !functionIds.has(item.functionId) ||
        typeof item.reason !== "string" ||
        item.id !== contentIdentity("sagejs.optimizer-near-miss/v1", {
          loopId: item.loopId,
          passId: item.passId,
          reason: item.reason,
        })) {
      throw new Error("dashboard near miss has invalid references");
    }
  }
  const inFunctions = dashboard.loops.filter((loop) => loop.functionId !== null);
  const expectedSummary = {
    sourceFilesDiscovered: dashboard.files.length,
    sourceFilesCompiled: dashboard.files.filter((file) => file.status === "compiled").length,
    sourceFilesFailed: dashboard.files.filter((file) => file.status !== "compiled").length,
    librarySourceFilesDiscovered: dashboard.files.filter(
      (file) => file.scope === "library",
    ).length,
    librarySourceFilesCompiled: dashboard.files.filter(
      (file) => file.scope === "library" && file.status === "compiled",
    ).length,
    librarySourceFilesFailed: dashboard.files.filter(
      (file) => file.scope === "library" && file.status !== "compiled",
    ).length,
    controlSourceFilesDiscovered: dashboard.files.filter(
      (file) => file.scope === "control",
    ).length,
    controlSourceFilesCompiled: dashboard.files.filter(
      (file) => file.scope === "control" && file.status === "compiled",
    ).length,
    controlSourceFilesFailed: dashboard.files.filter(
      (file) => file.scope === "control" && file.status !== "compiled",
    ).length,
    functionsCompiled: dashboard.files.reduce((sum, file) => sum + file.functions, 0),
    suitableFunctions: dashboard.functions.filter(
      (record) => record.loopIds.length > 0,
    ).length,
    loopsInFunctions: inFunctions.length,
    moduleScopeLoops: dashboard.loops.length - inFunctions.length,
    selectedLoops: inFunctions.filter((loop) => loop.status === "selected").length,
    rejectedLoops: inFunctions.filter((loop) => loop.status === "rejected").length,
    unrecognizedLoops: inFunctions.filter((loop) => loop.status === "unrecognized").length,
    optimizerDecisions: dashboard.files.reduce(
      (sum, file) => sum + file.optimizerDecisions,
      0,
    ),
    orphanOptimizerDecisions: dashboard.orphanDecisions.length,
    oneReasonNearMisses: dashboard.nearMisses.length,
  };
  for (const [key, value] of Object.entries(expectedSummary)) {
    validateCounter(dashboard.summary[key], `dashboard.summary.${key}`);
    if (dashboard.summary[key] !== value) {
      throw new Error(`dashboard summary ${key} is inconsistent`);
    }
  }
  if (dashboard.summary.sourceFilesFailed !== 0) {
    throw new Error("optimizer opportunity dashboard contains failed source modules");
  }
  if (dashboard.summary.orphanOptimizerDecisions !== 0) {
    throw new Error("optimizer opportunity dashboard contains orphan decisions");
  }
  requireContentId(dashboard.id, "dashboard.id");
  if (dashboard.id !== documentIdentity(dashboard)) {
    throw new Error("optimizer opportunity dashboard identity is stale");
  }
  return dashboard;
}

function dashboardJson(dashboard) {
  validateDashboard(dashboard);
  return `${JSON.stringify(dashboard, null, 2)}\n`;
}

function readDashboard(filename) {
  return validateDashboard(readSnapshotDatabase(filename).dashboard);
}

function verifyGenerated({
  root = ROOT,
  manifestPath = DEFAULT_MANIFEST,
  markdownPath = DEFAULT_MARKDOWN,
} = {}) {
  const expectedInput = inputIdentity(root);
  const markdown = fs.readFileSync(markdownPath, "utf8");
  const manifest = readArtifactManifest(manifestPath);
  return validateArtifactManifest(manifest, { expectedInput, markdown });
}

function writeDashboardArtifacts(dashboard, {
  root = ROOT,
  manifestPath = DEFAULT_MANIFEST,
  markdownPath = DEFAULT_MARKDOWN,
} = {}) {
  const json = dashboardJson(dashboard);
  const markdown = renderMarkdown(dashboard);
  const result = writeSnapshotArtifacts({
    root,
    dashboard,
    dashboardJson: json,
    markdown,
  });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(result.manifest, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);
  return result;
}

function parseQuery(value) {
  const identity = /^(sha256:[0-9a-f]{64})$/
    .exec(value ?? "");
  if (identity) return { kind: "identity", id: value };
  if ((value ?? "").startsWith("sha256:")) {
    throw new Error("exact identity must be sha256 followed by 64 lowercase hex digits");
  }
  const match = /^(.*?)(?::([0-9]+))?$/.exec(value ?? "");
  if (!match || !match[1]) {
    throw new Error("query requires an exact identity, path, or path:line");
  }
  return {
    kind: "location",
    path: slash(match[1].replace(/^\.\//, "")),
    line: match[2] === undefined ? null : Number(match[2]),
  };
}

function queryDashboard(dashboard, value) {
  const query = parseQuery(value);
  let loops;
  const exactFunctionIds = new Set();
  const exactSourceUnitIds = new Set();
  let exactIdentityFound = false;
  if (query.kind === "identity") {
    if (dashboard.files.some((file) => file.id === query.id)) {
      exactIdentityFound = true;
      exactSourceUnitIds.add(query.id);
      loops = dashboard.loops.filter((loop) => loop.sourceUnitId === query.id);
    } else if (dashboard.functions.some((record) => record.id === query.id)) {
      exactIdentityFound = true;
      exactFunctionIds.add(query.id);
      loops = dashboard.loops.filter((loop) => loop.functionId === query.id);
    } else if (dashboard.loops.some((loop) => loop.id === query.id)) {
      exactIdentityFound = true;
      loops = dashboard.loops.filter((loop) => loop.id === query.id);
    } else if (dashboard.loops.some((loop) =>
      loop.decisions.some((decision) => decision.id === query.id))) {
      exactIdentityFound = true;
      loops = dashboard.loops.filter((loop) =>
        loop.decisions.some((decision) => decision.id === query.id));
    } else {
      const nearMiss = dashboard.nearMisses.find((item) => item.id === query.id);
      exactIdentityFound = nearMiss !== undefined;
      loops = nearMiss === undefined
        ? []
        : dashboard.loops.filter((loop) => loop.id === nearMiss.loopId);
    }
    if (!exactIdentityFound) {
      throw new Error(`no optimizer opportunity has exact identity ${query.id}`);
    }
  } else {
    loops = dashboard.loops.filter((loop) => {
      const pathMatch = loop.source.path === query.path ||
        loop.source.path.endsWith(`/${query.path}`);
      if (!pathMatch) return false;
      return query.line === null ||
        (loop.source.line <= query.line && loop.source.endLine >= query.line);
    });
    if (query.line !== null && loops.length > 1) {
      throw new Error(
        `ambiguous optimizer opportunity location ${query.path}:${query.line}; ` +
        `${loops.length} loops contain that line (${loops.map((loop) => loop.id).join(", ")}); ` +
        "query an exact loop identity",
      );
    }
  }
  const functionIds = new Set(loops.map((loop) => loop.functionId).filter(Boolean));
  for (const id of exactFunctionIds) functionIds.add(id);
  if (exactSourceUnitIds.size > 0) {
    for (const record of dashboard.functions) {
      if (exactSourceUnitIds.has(record.sourceUnitId)) functionIds.add(record.id);
    }
  }
  const sourceUnitIds = new Set(loops.map((loop) => loop.sourceUnitId));
  for (const id of exactSourceUnitIds) sourceUnitIds.add(id);
  return {
    schema: "sagejs.optimizer-opportunity-query/v2",
    inputDigest: dashboard.inputs.digest,
    query,
    files: dashboard.files.filter((file) => sourceUnitIds.has(file.id)),
    functions: dashboard.functions.filter((record) => functionIds.has(record.id)),
    loops,
    nearMisses: dashboard.nearMisses.filter((item) =>
      loops.some((loop) => loop.id === item.loopId)),
  };
}

function formatQuery(result) {
  const lines = [
    result.query.kind === "identity"
      ? `optimizer opportunity ${result.query.id}`
      : `optimizer opportunities for ${result.query.path}` +
        `${result.query.line === null ? "" : `:${result.query.line}`}`,
  ];
  if (result.loops.length === 0) lines.push("no matching compiled loops");
  const functionById = new Map(result.functions.map((record) => [record.id, record]));
  for (const loop of result.loops) {
    const owner = functionById.get(loop.functionId);
    lines.push(
      `${loop.source.path}:${loop.source.line}:${loop.source.column} ` +
      `${owner?.qualifiedName ?? "<module>"} ${loop.status}`,
    );
    if (loop.reasonCodes.length) lines.push(`  reasons: ${loop.reasonCodes.join(", ")}`);
    for (const decision of loop.decisions) {
      lines.push(
        `  ${decision.selected ? "selected" : "rejected"} ${decision.passId} ` +
        `${decision.target}/${decision.representation}`,
      );
    }
    for (const suggestion of loop.suggestedContracts) {
      lines.push(`  suggestion: ${suggestion.decorator}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function parseArguments(argv) {
  const options = {
    write: false,
    check: false,
    verify: false,
    fetch: false,
    json: false,
    query: null,
    materializeJson: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write") options.write = true;
    else if (argument === "--check") options.check = true;
    else if (argument === "--verify-generated") options.verify = true;
    else if (argument === "--fetch") options.fetch = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--materialize-json") {
      index += 1;
      options.materializeJson = argv[index];
    }
    else if (argument === "--query") {
      index += 1;
      if (argv[index] === "--") index += 1;
      options.query = argv[index];
    }
    else if (argument === "--") continue;
    else throw new Error(`unknown argument ${argument}`);
  }
  if ([
    options.write,
    options.check,
    options.verify,
    options.fetch,
    options.query !== null,
    options.materializeJson !== null,
  ]
    .filter(Boolean).length !== 1) {
    throw new Error(
      "choose exactly one of --write, --check, --verify-generated, --fetch, " +
      "--materialize-json FILE, or --query PATH[:LINE]",
    );
  }
  if (options.materializeJson === undefined) {
    throw new Error("--materialize-json requires an output filename");
  }
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.verify) {
    const manifest = verifyGenerated();
    process.stdout.write(
      `Verified optimizer opportunities ${manifest.snapshot.logicalId}: ` +
      `${manifest.dashboard.summary.functionsCompiled} functions, ` +
      `${manifest.dashboard.summary.loopsInFunctions} loops.\n`,
    );
    return;
  }
  if (options.fetch || options.query !== null || options.materializeJson !== null) {
    const manifest = verifyGenerated();
    const database = await ensureLocalDatabase({ root: ROOT, manifest });
    if (options.fetch) {
      process.stdout.write(`${database}\n`);
      return;
    }
    if (options.materializeJson !== null) {
      const dashboard = readDashboard(database);
      fs.mkdirSync(path.dirname(path.resolve(options.materializeJson)), { recursive: true });
      fs.writeFileSync(options.materializeJson, dashboardJson(dashboard));
      process.stdout.write(`Materialized ${options.materializeJson} from ${manifest.snapshot.logicalId}.\n`);
      return;
    }
    const query = parseQuery(options.query);
    const result = querySnapshotDatabase(database, query);
    process.stdout.write(options.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : formatQuery(result));
    return;
  }
  const started = performance.now();
  const dashboard = await analyzeRepository();
  const elapsed = (performance.now() - started) / 1000;
  if (options.write) {
    const result = writeDashboardArtifacts(dashboard);
    process.stdout.write(
      `Wrote optimizer opportunity artifacts ${result.snapshot.logicalId}: ` +
      `${dashboard.summary.functionsCompiled} ` +
      `functions, ${dashboard.summary.loopsInFunctions} loops, ` +
      `${dashboard.summary.oneReasonNearMisses} near misses in ${elapsed.toFixed(2)}s.\n` +
      `Release assets: ${result.releaseDirectory}\n`,
    );
    return;
  }
  const manifest = verifyGenerated();
  const snapshot = canonicalSnapshot(dashboard);
  const expectedMarkdown = fs.readFileSync(DEFAULT_MARKDOWN, "utf8");
  if (manifest.snapshot.logicalId !== snapshot.logicalId ||
      expectedMarkdown !== renderMarkdown(dashboard)) {
    throw new Error(
      "optimizer opportunity dashboard is stale; run pnpm optimizer:opportunities",
    );
  }
  process.stdout.write(
    `Optimizer opportunity dashboard is exact (${elapsed.toFixed(2)}s).\n`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  GENERATOR,
  SCHEMA,
  analyzeRepository,
  analyzeSources,
  dashboardInputFiles,
  dashboardJson,
  formatQuery,
  inputIdentity,
  parseArguments,
  queryDashboard,
  reasonRemediation,
  readDashboard,
  renderMarkdown,
  validateDashboard,
  verifyGenerated,
  writeDashboardArtifacts,
};

"use strict";

const { createHash } = require("node:crypto");
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { basename, relative, resolve } = require("node:path");
const { generateC, generateHostCore } = require("./c-backend.cjs");
const { lowerSource } = require("./ir.cjs");
const { generatedCSourceMap } = require("./provenance.cjs");

function selectedFunctions(options) {
  if (Array.isArray(options.functions) && options.functions.length > 0) {
    return options.functions;
  }
  return undefined;
}

async function analyzeKernel(options) {
  const sourcePath = resolve(options.sourcePath);
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath, {
    functions: selectedFunctions(options),
  });
  return { sourcePath, source, ir };
}

function operationStatistics(fn) {
  const kinds = {};
  let operations = 0;
  let generated = 0;
  function visit(body) {
    for (const operation of body || []) {
      operations += 1;
      kinds[operation.kind] = (kinds[operation.kind] || 0) + 1;
      if (Array.isArray(operation.origins) &&
          !(operation.origins.length === 1 && operation.origins[0] === operation.id)) {
        generated += 1;
      }
      visit(operation.body);
      visit(operation.alternative);
      visit(operation.condition?.operations);
      visit(operation.right?.operations);
    }
  }
  visit(fn.body);
  return { operations, generated, kinds };
}

function explainFunction(fn) {
  return {
    name: fn.name,
    eligible: true,
    decorated: fn.decorated,
    kernelKind: fn.kernelKind || "field",
    sourceTransparent: fn.sourceTransparent === true,
    hostIsolation: {
      eligible: true,
      normalPathHostCallbacks: 0,
      boundary: fn.kernelKind === "integer" || fn.kernelKind === "float64"
        ? "packed-c-abi"
        : "owned-or-borrowed-native-value-abi",
    },
    provenance: fn.provenance,
    signature: {
      parameters: fn.params,
      returnType: fn.returnType,
    },
    dependencies: fn.dependencies || [],
    foreignDependencies: fn.foreignDependencies || [],
    locals: fn.locals,
    optimizations: fn.optimizations || {},
    analysis: fn.analysis || {},
    ir: operationStatistics(fn),
  };
}

function topLevelFunctions(source) {
  const result = [];
  const pattern = /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;
  for (const match of source.matchAll(pattern)) result.push(match[1]);
  return result;
}

async function explainKernel(options) {
  const sourcePath = resolve(options.sourcePath);
  const source = readFileSync(sourcePath, "utf8");
  try {
    const result = await analyzeKernel(options);
    return {
      sourcePath,
      eligible: true,
      version: result.ir.version,
      functions: result.ir.functions.map(explainFunction),
      callGraph: result.ir.callGraph,
      foreignLibraries: result.ir.foreignLibraries || [],
    };
  } catch (error) {
    if (selectedFunctions(options) !== undefined) {
      return {
        sourcePath,
        eligible: false,
        error: error?.message || String(error),
        functions: options.functions.map((name) => ({
          name,
          eligible: false,
          reason: error?.message || String(error),
        })),
      };
    }
    const names = topLevelFunctions(source);
    const functions = [];
    for (const name of names) {
      try {
        const result = await analyzeKernel({ ...options, functions: [name] });
        functions.push(explainFunction(result.ir.functions[0]));
      } catch (functionError) {
        functions.push({
          name,
          eligible: false,
          reason: functionError?.message || String(functionError),
        });
      }
    }
    return {
      sourcePath,
      eligible: functions.some((fn) => fn.eligible),
      moduleReason: error?.message || String(error),
      functions,
    };
  }
}

function pythonSources(rootPath) {
  if (!statSync(rootPath).isDirectory()) return [rootPath];
  const result = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isDirectory()) {
        if (entry.name === "__pycache__" || entry.name.startsWith(".")) continue;
        visit(resolve(directory, entry.name));
      } else if (entry.isFile() && entry.name.endsWith(".py")) {
        result.push(resolve(directory, entry.name));
      }
    }
  }
  visit(rootPath);
  return result;
}

function sourceFeatures(source) {
  const features = new Set();
  const checks = [
    ["annotations", /(?:^|\n)\s*def\s+\w+\s*\([^\n]*:[^\n]*\)|->\s*[^:\n]+\s*:/],
    ["float", /\bfloat\b|\d+\.\d*|\.\d+|\d+[eE][+-]?\d+/],
    ["complex", /\bcomplex\b|\d+[jJ]\b/],
    ["string", /(?:^|[^\w])(?:[rubf]{0,2})(?:'[^'\n]*'|"[^"\n]*")/i],
    ["list", /\blist\s*\(|\[[^\]]*\]/],
    ["dict", /\bdict\s*\(|\{[^}\n]*:/],
    ["set", /\bset\s*\(/],
    ["class", /(?:^|\n)\s*class\s+/],
    ["lambda", /\blambda\b/],
    ["generator", /\byield\b/],
    ["comprehension", /\[[^\]\n]+\bfor\b[^\]\n]+\]/],
    ["exception", /\b(?:try|except|raise|finally)\b/],
    ["imports", /(?:^|\n)\s*(?:from|import)\s+/],
    ["bitwise", /(?:<<|>>|\^|~|(?<!\*)\|(?!\*)|(?<!\*)&(?!\*))/],
    ["attribute", /\.[A-Za-z_]\w*/],
    ["async", /\b(?:async|await)\b/],
  ];
  for (const [name, pattern] of checks) {
    if (pattern.test(source)) features.add(name);
  }
  return Array.from(features).sort();
}

function rejectionCategory(reason) {
  const text = String(reason || "").toLowerCase();
  if (text.includes("annotation")) return "missing-or-unsupported-annotation";
  if (text.includes("signature")) return "unsupported-signature";
  if (text.includes("may only contain") || text.includes("module")) {
    return "unsupported-module-structure";
  }
  if (text.includes("calls missing") || text.includes("dependency")) {
    return "unsupported-dependency";
  }
  if (text.includes("parse") || text.includes("syntax")) return "parse-error";
  if (text.includes("unsupported")) return "unsupported-syntax";
  return "other";
}

/** Recursively explain native eligibility without compiling any artifacts. */
async function auditKernels(options) {
  const rootPath = resolve(options.sourcePath);
  const directory = statSync(rootPath).isDirectory();
  const files = pythonSources(rootPath);
  const modules = await Promise.all(files.map(async (sourcePath) => {
    const source = readFileSync(sourcePath, "utf8");
    const explanation = await explainKernel({ sourcePath });
    const functions = explanation.functions.map((fn) => {
      if (fn.eligible) return fn;
      const category = rejectionCategory(fn.reason);
      return { ...fn, category };
    });
    return {
      path: directory ? relative(rootPath, sourcePath) : basename(sourcePath),
      sha256: createHash("sha256").update(source).digest("hex"),
      features: sourceFeatures(source),
      eligible: functions.some((fn) => fn.eligible),
      moduleReason: explanation.moduleReason,
      error: explanation.error,
      functions,
    };
  }));
  const rejectionCounts = new Map();
  let eligibleFunctions = 0;
  let rejectedFunctions = 0;
  for (const module of modules) {
    for (const fn of module.functions) {
      if (fn.eligible) eligibleFunctions += 1;
      else {
        rejectedFunctions += 1;
        rejectionCounts.set(
          fn.category,
          (rejectionCounts.get(fn.category) || 0) + 1,
        );
      }
    }
  }
  return {
    schemaVersion: 1,
    rootPath,
    summary: {
      modules: modules.length,
      functions: eligibleFunctions + rejectedFunctions,
      eligibleFunctions,
      rejectedFunctions,
      rejectionCategories: Object.fromEntries(
        Array.from(rejectionCounts).sort(([left], [right]) =>
          left.localeCompare(right)),
      ),
    },
    modules,
  };
}

async function emitKernelC(options) {
  const result = await analyzeKernel(options);
  const source = generateC(result.ir);
  return {
    ...result,
    cSource: source,
    cSourceMap: generatedCSourceMap(source),
  };
}

async function emitHostCore(options) {
  const result = await analyzeKernel(options);
  const core = generateHostCore(result.ir);
  return {
    ...result,
    coreSource: core.source,
    coreHeader: core.header,
    coreSourceMap: generatedCSourceMap(core.source),
    hostIsolation: core.audit,
  };
}

module.exports = {
  analyzeKernel,
  auditKernels,
  emitKernelC,
  emitHostCore,
  explainFunction,
  explainKernel,
  operationStatistics,
};

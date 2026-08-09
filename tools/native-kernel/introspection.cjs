"use strict";

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { generateC } = require("./c-backend.cjs");
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
    provenance: fn.provenance,
    signature: {
      parameters: fn.params,
      returnType: fn.returnType,
    },
    dependencies: fn.dependencies || [],
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

async function emitKernelC(options) {
  const result = await analyzeKernel(options);
  const source = generateC(result.ir);
  return {
    ...result,
    cSource: source,
    cSourceMap: generatedCSourceMap(source),
  };
}

module.exports = {
  analyzeKernel,
  emitKernelC,
  explainFunction,
  explainKernel,
  operationStatistics,
};

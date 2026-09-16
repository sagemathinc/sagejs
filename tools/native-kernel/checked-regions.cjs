"use strict";

const {
  attachAndVerifyCheckedBoundsProofs,
} = require("./checked-bounds-proofs.cjs");
const {
  createFunctionGraphProofAuthority,
  createFunctionProofAuthority,
} = require("./structural-proof-authority.cjs");

/*
 * Checked regions are private copies of a closed integer call graph selected
 * by a guard at one ordinary tagged entry.  This first stage deliberately
 * preserves every arithmetic and bounds check in the copied graph.  It only
 * establishes the fail-closed representation, cloning, call rewriting, and
 * dispatch machinery on which independently verified proofs can rely.  An
 * optional, conservative Stage-B interval pass can then authorize direct
 * straight-line int64 arithmetic and buffer access.  Omitting capabilities
 * always retains the Stage-A behavior and every check.
 *
 * Declarations are compiler-owned capabilities, not portable IR.  The symbol
 * below is intentionally lost by JSON serialization, so cached or externally
 * edited IR cannot manufacture a private route.
 */

const CHECKED_REGION_AUTHORITY = Symbol("checked region authority");
const CHECKED_REGION_INT64_ARITHMETIC = Symbol(
  "checked region int64 arithmetic",
);
const CHECKED_REGION_BUFFER_ACCESS = Symbol("checked region buffer access");
const CHECKED_REGION_LOCAL_VARIANT = Symbol("checked region local variant");
const CHECKED_REGION_DIRECT_RESULT = Symbol("checked region direct result");
const CHECKED_REGION_DIRECT_CALL = "checkedRegionDirectCallProof";
const CHECKED_REGION_GUARDED_DIRECT_CALL =
  "checkedRegionGuardedDirectCallProof";
const CHECKED_REGION_DIRECT_RESULT_PROOF = "checkedRegionDirectResultProof";
const CHECKED_REGION_AFFINE_WHILE_LATCH_PROOF =
  "checkedRegionAffineWhileLatchProof";
const VIRTUAL_UINT64_VIEW_PROOF = "checkedRegionVirtualUInt64ViewProof";
const virtualUInt64ViewAuthority = createFunctionProofAuthority({
  name: "checked-region virtual UInt64 view",
  ignoredKeys: [
    "boundsProof",
    "checkedRegionDirectCallProof",
    "checkedRegionGuardedDirectCallProof",
    "checkedRegionDirectResultProof",
    "checkedRegionProof",
    "incrementProof",
    "provenance",
  ],
});
const graphVirtualUInt64ViewAuthority = createFunctionGraphProofAuthority({
  name: "checked-region graph virtual UInt64 view",
  ignoredKeys: [
    "boundsProof",
    "checkedRegionDirectCallProof",
    "checkedRegionGuardedDirectCallProof",
    "checkedRegionDirectResultProof",
    "checkedRegionProof",
    "incrementProof",
    "provenance",
  ],
});
const graphInt64ArithmeticAuthority = createFunctionGraphProofAuthority({
  name: "checked-region graph int64 arithmetic",
  ignoredKeys: [
    "boundsProof",
    "checkedRegionDirectCallProof",
    "checkedRegionGuardedDirectCallProof",
    "checkedRegionDirectResultProof",
    "checkedRegionProof",
    "incrementProof",
    "provenance",
  ],
});
const graphAffineWhileLatchAuthority = createFunctionGraphProofAuthority({
  name: "checked-region graph affine while latch",
  ignoredKeys: [
    "boundsProof",
    "checkedRegionDirectCallProof",
    "checkedRegionGuardedDirectCallProof",
    "checkedRegionDirectResultProof",
    "checkedRegionProof",
    "incrementProof",
    "provenance",
  ],
});
const directCallAuthority = createFunctionProofAuthority({
  name: "checked-region direct result call",
  ignoredKeys: [
    "boundsProof",
    "incrementProof",
    "provenance",
  ],
});
const summaryDirectCallAuthority = createFunctionGraphProofAuthority({
  name: "checked-region summarized direct result call",
  ignoredKeys: ["boundsProof", "incrementProof", "provenance"],
});
const guardedDirectCallAuthority = createFunctionProofAuthority({
  name: "checked-region guarded direct result call",
  ignoredKeys: [
    "boundsProof",
    "incrementProof",
    "provenance",
  ],
});
const directResultAuthority = createFunctionProofAuthority({
  name: "checked-region direct result function",
  ignoredKeys: [
    "boundsProof",
    "incrementProof",
    "provenance",
  ],
});
const SCHEMA = "sagejs-checked-private-region-v1";
const INT64_MINIMUM = -(1n << 63n);
const INT64_MAXIMUM = (1n << 63n) - 1n;
const UINT64_MAXIMUM = (1n << 64n) - 1n;
const CAPABILITIES = new Set([
  "int64-arithmetic",
  "direct-buffer-access",
  "verified-span-access",
  "virtual-fixed-uint64-views",
  "interval-view-access",
  "scalar-return-summaries",
]);

const BUFFER_TYPES = new Set([
  "Int64Buffer",
  "UInt64Buffer",
  "IntegerBuffer",
  "Float64Buffer",
]);

function fail(message) {
  throw new Error(`invalid checked private region: ${message}`);
}

function cIdentifier(name) {
  return String(name).replace(/[^A-Za-z0-9_]/g, "_");
}

function deepClone(value, seen = new Map()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  const copy = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value));
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    // Symbols are nonportable compiler capabilities (including verified
    // bounds authority).  A Stage-A clone must not inherit any of them.
    if (typeof key === "symbol") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if ("value" in descriptor) descriptor.value = deepClone(descriptor.value, seen);
    Object.defineProperty(copy, key, descriptor);
  }
  return copy;
}

function visitOperations(value, visitor, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (typeof value.kind === "string") visitor(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol" || key === "provenance") continue;
    visitOperations(value[key], visitor, seen);
  }
}

function parameterMap(fn) {
  return new Map(fn.params.map((parameter) => [parameter.name, parameter]));
}

function requireParameter(entry, name, type) {
  const parameter = parameterMap(entry).get(name);
  if (parameter === undefined) fail(`unknown entry parameter ${name}`);
  if (type !== undefined && parameter.type !== type) {
    fail(`${name} must have type ${type}`);
  }
  return parameter;
}

function normalizePredicate(predicate, entry) {
  if (predicate === null || typeof predicate !== "object") {
    fail("guard predicates must be objects");
  }
  const parameter = parameterMap(entry).get(predicate.parameter);
  if (parameter === undefined) fail(`unknown entry parameter ${predicate.parameter}`);
  if (predicate.kind === "buffer-min-length") {
    if (!BUFFER_TYPES.has(parameter.type)) {
      fail(`${predicate.parameter} is not a checked buffer`);
    }
    if (!Number.isSafeInteger(predicate.minimum) || predicate.minimum < 0) {
      fail("buffer minimum must be a nonnegative safe integer");
    }
    return Object.freeze({
      kind: predicate.kind,
      parameter: predicate.parameter,
      minimum: predicate.minimum,
      parameterType: parameter.type,
    });
  }
  if (predicate.kind === "buffer-max-length") {
    if (!BUFFER_TYPES.has(parameter.type)) {
      fail(`${predicate.parameter} is not a checked buffer`);
    }
    let maximum;
    try {
      maximum = BigInt(predicate.maximum);
    } catch (_error) {
      fail("buffer maximum must be a nonnegative uint64");
    }
    if (maximum < 0n || maximum > UINT64_MAXIMUM) {
      fail("buffer maximum must be a nonnegative uint64");
    }
    return Object.freeze({
      kind: predicate.kind,
      parameter: predicate.parameter,
      maximum: maximum.toString(),
      parameterType: parameter.type,
    });
  }
  if (["int64-range", "uint64-range", "integer-int64-range"].includes(
    predicate.kind,
  )) {
    const required = predicate.kind === "int64-range"
      ? "int64"
      : predicate.kind === "uint64-range" ? "uint64" : "Integer";
    if (parameter.type !== required) {
      fail(`${predicate.parameter} must have type ${required}`);
    }
    let minimum;
    let maximum;
    try {
      minimum = BigInt(predicate.minimum);
      maximum = BigInt(predicate.maximum);
    } catch (_error) {
      fail("scalar range endpoints must be integers");
    }
    const lower = predicate.kind === "uint64-range" ? 0n : -(1n << 63n);
    const upper = predicate.kind === "uint64-range"
      ? (1n << 64n) - 1n
      : (1n << 63n) - 1n;
    if (minimum < lower || maximum > upper || minimum > maximum) {
      fail(`invalid ${predicate.kind} endpoints`);
    }
    return Object.freeze({
      kind: predicate.kind,
      parameter: predicate.parameter,
      minimum: minimum.toString(),
      maximum: maximum.toString(),
      parameterType: parameter.type,
    });
  }
  fail(`unsupported guard predicate ${predicate.kind}`);
}

function normalizeGuard(predicates, entry) {
  if (!Array.isArray(predicates)) fail("guard must be an array");
  const products = new Map();
  const normalized = [];
  for (const predicate of predicates) {
    if (predicate?.kind !== "checked-nonnegative-int64-product") continue;
    if (typeof predicate.name !== "string" ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(predicate.name) ||
        products.has(predicate.name)) fail("invalid or duplicate product binding");
    requireParameter(entry, predicate.left, "int64");
    requireParameter(entry, predicate.right, "int64");
    const product = Object.freeze({
      kind: predicate.kind,
      name: predicate.name,
      left: predicate.left,
      right: predicate.right,
    });
    products.set(product.name, product);
  }
  normalized.push(...products.values());
  for (const predicate of predicates) {
    if (predicate?.kind === "checked-nonnegative-int64-product") {
      continue;
    }
    if ([
      "buffer-min-length-scalar",
      "buffer-min-length-affine",
      "buffer-min-length-product",
    ].includes(predicate?.kind)) {
      const buffer = requireParameter(entry, predicate.buffer);
      if (!BUFFER_TYPES.has(buffer.type)) {
        fail(`${predicate.buffer} is not a checked buffer`);
      }
      if (predicate.kind === "buffer-min-length-product") {
        if (!products.has(predicate.product)) {
          fail(`unknown product binding ${predicate.product}`);
        }
        normalized.push(Object.freeze({
          kind: predicate.kind,
          buffer: predicate.buffer,
          bufferType: buffer.type,
          product: predicate.product,
        }));
        continue;
      }
      requireParameter(entry, predicate.scalar, "int64");
      let offset = 0n;
      if (predicate.kind === "buffer-min-length-affine") {
        try {
          offset = BigInt(predicate.offset);
        } catch (_error) {
          fail("affine buffer offset must be an integer");
        }
        if (offset < 0n || offset > INT64_MAXIMUM) {
          fail("affine buffer offset must be a nonnegative int64");
        }
      }
      normalized.push(Object.freeze({
        kind: predicate.kind,
        buffer: predicate.buffer,
        bufferType: buffer.type,
        scalar: predicate.scalar,
        offset: offset.toString(),
      }));
      continue;
    }
    normalized.push(normalizePredicate(predicate, entry));
  }
  return Object.freeze(normalized);
}

function installCheckedRegionDeclarations(ir, declarations) {
  if (!Array.isArray(declarations)) fail("declarations must be an array");
  const installed = declarations.map((declaration) => {
    if (declaration === null || typeof declaration !== "object") {
      fail("declaration must be an object");
    }
    const value = {
      schema: SCHEMA,
      entry: declaration.entry,
      functions: Object.freeze([...(declaration.functions || [])]),
      capabilities: Object.freeze([...(declaration.capabilities || [])]),
      guard: Object.freeze([...(declaration.guard || [])].map((item) =>
        Object.freeze({ ...item })
      )),
      localVariants: Object.freeze([...(declaration.localVariants || [])].map(
        (variant) => Object.freeze({
          function: variant?.function,
          mode: variant?.mode,
          edges: Object.freeze([...(variant?.edges || [])].map((edge) =>
            Object.freeze({ ...edge })
          )),
          guard: Object.freeze([...(variant?.guard || [])].map((item) =>
            Object.freeze({ ...item })
          )),
          capabilities: Object.freeze([...(variant?.capabilities || [])]),
        }),
      )),
    };
    Object.defineProperty(value, CHECKED_REGION_AUTHORITY, { value: true });
    return Object.freeze(value);
  });
  Object.defineProperty(ir, "checkedRegions", {
    configurable: true,
    enumerable: true,
    value: Object.freeze(installed),
  });
  return ir;
}

function joinInterval(previous, next) {
  if (next === undefined) return previous;
  if (previous === undefined) return { ...next };
  return {
    minimum: previous.minimum < next.minimum ? previous.minimum : next.minimum,
    maximum: previous.maximum > next.maximum ? previous.maximum : next.maximum,
  };
}

function parameterExpression(name) {
  return `parameter:${name}`;
}

function constantExpression(value) {
  return `constant:${BigInt(value).toString()}`;
}

function binaryExpression(operation, left, right) {
  if (left === undefined || right === undefined) return undefined;
  if (["add", "mul"].includes(operation) && left > right) {
    [left, right] = [right, left];
  }
  return `${operation}(${left},${right})`;
}

function parseScalarExpression(expression) {
  if (typeof expression !== "string") return undefined;
  if (expression.startsWith("parameter:")) {
    const name = expression.slice("parameter:".length);
    return name.length > 0 ? { kind: "parameter", name } : undefined;
  }
  if (expression.startsWith("constant:")) {
    try {
      return { kind: "constant", value: BigInt(
        expression.slice("constant:".length),
      ) };
    } catch (_error) {
      return undefined;
    }
  }
  const open = expression.indexOf("(");
  if (open <= 0 || !expression.endsWith(")")) return undefined;
  const operation = expression.slice(0, open);
  if (!["add", "sub", "mul"].includes(operation)) return undefined;
  const contents = expression.slice(open + 1, -1);
  let depth = 0;
  let comma = -1;
  for (let index = 0; index < contents.length; index += 1) {
    if (contents[index] === "(") depth += 1;
    else if (contents[index] === ")") depth -= 1;
    else if (contents[index] === "," && depth === 0) {
      if (comma !== -1) return undefined;
      comma = index;
    }
    if (depth < 0) return undefined;
  }
  if (depth !== 0 || comma <= 0 || comma === contents.length - 1) {
    return undefined;
  }
  const left = parseScalarExpression(contents.slice(0, comma));
  const right = parseScalarExpression(contents.slice(comma + 1));
  return left === undefined || right === undefined
    ? undefined
    : { kind: "binary", operation, left, right };
}

function transformScalarExpression(expression, parameters) {
  const parsed = parseScalarExpression(expression);
  function transform(node) {
    if (node.kind === "parameter") return parameters.get(node.name);
    if (node.kind === "constant") return constantExpression(node.value);
    const left = transform(node.left);
    const right = transform(node.right);
    return binaryExpression(node.operation, left, right);
  }
  return parsed === undefined ? undefined : transform(parsed);
}

function scalarExpressionInterval(expression, parameters) {
  const parsed = parseScalarExpression(expression);
  function evaluate(node) {
    if (node.kind === "parameter") return parameters.get(node.name);
    if (node.kind === "constant") {
      return { minimum: node.value, maximum: node.value };
    }
    return intervalResult(node.operation, evaluate(node.left), evaluate(node.right));
  }
  return parsed === undefined ? undefined : evaluate(parsed);
}

function intersectSets(left, right) {
  return new Set(Array.from(left || []).filter((value) => right?.has(value)));
}

function intervalResult(operation, left, right) {
  if (left === undefined || right === undefined) return undefined;
  if (operation === "add") {
    return {
      minimum: left.minimum + right.minimum,
      maximum: left.maximum + right.maximum,
    };
  }
  if (operation === "sub") {
    return {
      minimum: left.minimum - right.maximum,
      maximum: left.maximum - right.minimum,
    };
  }
  if (operation === "mul") {
    const products = [
      left.minimum * right.minimum,
      left.minimum * right.maximum,
      left.maximum * right.minimum,
      left.maximum * right.maximum,
    ];
    return {
      minimum: products.reduce((a, b) => a < b ? a : b),
      maximum: products.reduce((a, b) => a > b ? a : b),
    };
  }
  return undefined;
}

function operationTargets(operation) {
  const targets = [];
  if (typeof operation.target === "string") targets.push(operation.target);
  for (const result of operation.results || []) targets.push(result.name);
  if (typeof operation.index === "string" &&
      operation.kind?.startsWith("loop.")) targets.push(operation.index);
  return targets;
}

function callGraph(variants, byName) {
  const edges = new Map();
  for (const fn of variants) {
    const callees = new Set();
    visitOperations(fn.body, (operation) => {
      if (operation.kind === "native.call" && byName.has(operation.function)) {
        callees.add(operation.function);
      }
    });
    edges.set(fn.name, Array.from(callees));
  }
  return edges;
}

function validateCapabilityInputs(variants, byName) {
  for (const fn of variants) {
    visitOperations(fn.body, (operation) => {
      if (["int64.constant", "uint64.constant"].includes(operation.kind)) {
        let value;
        try {
          value = BigInt(operation.value);
        } catch (_error) {
          fail(`${operation.kind} has a noninteger constant`);
        }
        const minimum = operation.kind === "int64.constant" ? INT64_MINIMUM : 0n;
        const maximum = operation.kind === "int64.constant"
          ? INT64_MAXIMUM : UINT64_MAXIMUM;
        if (value < minimum || value > maximum) {
          fail(`${operation.kind} constant is outside its scalar domain`);
        }
      }
      if (operation.kind !== "native.call" || !byName.has(operation.function)) {
        return;
      }
      const callee = byName.get(operation.function);
      if (!Array.isArray(operation.arguments) ||
          operation.arguments.length !== callee.params.length) {
        fail(`call to ${operation.function} has invalid arity`);
      }
      operation.arguments.forEach((argument, index) => {
        if (argument === null || typeof argument !== "object" ||
            typeof argument.name !== "string" ||
            argument.type !== callee.params[index].type) {
          fail(`call to ${operation.function} has invalid argument ${index}`);
        }
      });
      if (operation.returnType !== callee.returnType) {
        fail(`call to ${operation.function} has invalid return type`);
      }
    });
  }
}

function topologicalOrder(entry, edges) {
  const temporary = new Set();
  const permanent = new Set();
  const result = [];
  function visit(name) {
    if (permanent.has(name)) return;
    if (temporary.has(name)) fail("capability analysis does not admit recursion");
    temporary.add(name);
    for (const child of edges.get(name) || []) visit(child);
    temporary.delete(name);
    permanent.add(name);
    result.push(name);
  }
  visit(entry);
  return result.reverse();
}

function initialFacts(entry, guard) {
  const intervals = new Map();
  const buffers = new Map();
  const bufferMaximums = new Map();
  const expressions = new Map(entry.params
    .filter((parameter) => ["int64", "uint64"].includes(parameter.type))
    .map((parameter) => [parameter.name, parameterExpression(parameter.name)]));
  const rangeUpper = new Map();
  const bufferRelations = new Map();
  const products = new Map(guard
    .filter((predicate) =>
      predicate.kind === "checked-nonnegative-int64-product"
    )
    .map((predicate) => [predicate.name, binaryExpression(
      "mul",
      parameterExpression(predicate.left),
      parameterExpression(predicate.right),
    )]));
  const safeInt64Expressions = new Set(products.values());
  for (const predicate of guard) {
    if (predicate.kind === "buffer-min-length") {
      const current = buffers.get(predicate.parameter);
      const minimum = BigInt(predicate.minimum);
      if (current === undefined || minimum > current) {
        buffers.set(predicate.parameter, minimum);
      }
    } else if (predicate.kind === "buffer-max-length") {
      const current = bufferMaximums.get(predicate.parameter);
      const maximum = BigInt(predicate.maximum);
      if (current === undefined || maximum < current) {
        bufferMaximums.set(predicate.parameter, maximum);
      }
    } else if (["int64-range", "uint64-range"].includes(predicate.kind)) {
      const current = intervals.get(predicate.parameter);
      const minimum = BigInt(predicate.minimum);
      const maximum = BigInt(predicate.maximum);
      intervals.set(predicate.parameter, {
        minimum: current !== undefined && current.minimum > minimum
          ? current.minimum : minimum,
        maximum: current !== undefined && current.maximum < maximum
          ? current.maximum : maximum,
      });
    }
  }
  for (const predicate of guard.filter((candidate) =>
    candidate.kind === "checked-nonnegative-int64-product"
  )) {
    for (const name of [predicate.left, predicate.right]) {
      const current = intervals.get(name);
      intervals.set(name, {
        minimum: current === undefined || current.minimum < 0n
          ? 0n : current.minimum,
        maximum: current?.maximum ?? INT64_MAXIMUM,
      });
    }
  }
  for (const predicate of guard) {
    if ([
      "buffer-min-length-scalar",
      "buffer-min-length-affine",
      "buffer-min-length-product",
    ].includes(predicate.kind)) {
      let relation;
      let numericMinimum;
      if (predicate.kind === "buffer-min-length-product") {
        relation = products.get(predicate.product);
        const product = guard.find((candidate) =>
          candidate.kind === "checked-nonnegative-int64-product" &&
          candidate.name === predicate.product
        );
        const left = intervals.get(product.left);
        const right = intervals.get(product.right);
        if (left !== undefined && right !== undefined) {
          numericMinimum = left.minimum * right.minimum;
        }
      } else {
        const scalar = parameterExpression(predicate.scalar);
        const offset = BigInt(predicate.offset);
        relation = offset === 0n
          ? scalar
          : binaryExpression("add", scalar, constantExpression(offset));
        const scalarInterval = intervals.get(predicate.scalar);
        if (scalarInterval !== undefined) {
          numericMinimum = scalarInterval.minimum + offset;
        }
      }
      if (!bufferRelations.has(predicate.buffer)) {
        bufferRelations.set(predicate.buffer, new Set());
      }
      bufferRelations.get(predicate.buffer).add(relation);
      if (numericMinimum !== undefined) {
        const current = buffers.get(predicate.buffer);
        if (current === undefined || numericMinimum > current) {
          buffers.set(predicate.buffer, numericMinimum);
        }
      }
    }
  }
  // Exact Integer parameters deliberately remain unknown in this first
  // fixed-width theorem, even when the entry guard proves an int64 range.
  return {
    intervals,
    buffers,
    bufferMaximums,
    expressions,
    rangeUpper,
    bufferRelations,
    safeInt64Expressions,
    summaryDependencies: new Set(),
    scalarBounds: new Map(),
    pathConditions: [],
    entry: entry.name,
  };
}

function mergeFacts(target, incoming) {
  if (!target.initialized) {
    target.intervals = new Map(incoming.intervals);
    target.buffers = new Map(incoming.buffers);
    target.bufferMaximums = new Map(incoming.bufferMaximums || []);
    target.expressions = new Map(incoming.expressions);
    target.rangeUpper = new Map(incoming.rangeUpper);
    target.bufferRelations = new Map(Array.from(
      incoming.bufferRelations,
      ([name, relations]) => [name, new Set(relations)],
    ));
    target.safeInt64Expressions = new Set(incoming.safeInt64Expressions);
    target.summaryDependencies = new Set(incoming.summaryDependencies || []);
    target.scalarBounds = new Map(incoming.scalarBounds || []);
    target.pathConditions = [...(incoming.pathConditions || [])];
    target.initialized = true;
    return true;
  }
  let changed = false;
  for (const name of Array.from(target.intervals.keys())) {
    if (incoming.intervals.has(name)) continue;
    target.intervals.delete(name);
    changed = true;
  }
  for (const [name, interval] of incoming.intervals) {
    if (!target.intervals.has(name)) continue;
    const joined = joinInterval(target.intervals.get(name), interval);
    const before = target.intervals.get(name);
    if (before === undefined || before.minimum !== joined.minimum ||
        before.maximum !== joined.maximum) {
      target.intervals.set(name, joined);
      changed = true;
    }
  }
  for (const name of Array.from(target.buffers.keys())) {
    if (incoming.buffers.has(name)) continue;
    target.buffers.delete(name);
    changed = true;
  }
  for (const [name, minimum] of incoming.buffers) {
    const before = target.buffers.get(name);
    if (before === undefined) continue;
    // A fact shared by all callers is only as strong as the smallest lower
    // bound supplied by any caller.
    const joined = minimum < before ? minimum : before;
    if (joined !== before) {
      target.buffers.set(name, joined);
      changed = true;
    }
  }
  for (const name of Array.from(target.bufferMaximums?.keys() || [])) {
    if (incoming.bufferMaximums?.has(name)) continue;
    target.bufferMaximums.delete(name);
    changed = true;
  }
  for (const [name, maximum] of incoming.bufferMaximums || []) {
    const before = target.bufferMaximums.get(name);
    if (before === undefined) continue;
    // A shared upper bound must admit every caller, hence the larger bound.
    const joined = maximum > before ? maximum : before;
    if (joined !== before) {
      target.bufferMaximums.set(name, joined);
      changed = true;
    }
  }
  for (const name of Array.from(target.expressions.keys())) {
    if (target.expressions.get(name) !== incoming.expressions.get(name)) {
      target.expressions.delete(name);
      changed = true;
    }
  }
  for (const name of Array.from(target.rangeUpper.keys())) {
    if (target.rangeUpper.get(name) !== incoming.rangeUpper.get(name)) {
      target.rangeUpper.delete(name);
      changed = true;
    }
  }
  for (const name of Array.from(target.bufferRelations.keys())) {
    const relations = intersectSets(
      target.bufferRelations.get(name),
      incoming.bufferRelations.get(name),
    );
    if (relations.size === 0) {
      target.bufferRelations.delete(name);
      changed = true;
    } else if (relations.size !== target.bufferRelations.get(name).size) {
      target.bufferRelations.set(name, relations);
      changed = true;
    }
  }
  const safeExpressions = intersectSets(
    target.safeInt64Expressions,
    incoming.safeInt64Expressions,
  );
  if (safeExpressions.size !== target.safeInt64Expressions.size) {
    target.safeInt64Expressions = safeExpressions;
    changed = true;
  }
  for (const dependency of incoming.summaryDependencies || []) {
    if (!target.summaryDependencies.has(dependency)) {
      target.summaryDependencies.add(dependency);
      changed = true;
    }
  }
  for (const name of Array.from(target.scalarBounds?.keys() || [])) {
    if (JSON.stringify(target.scalarBounds.get(name)) !==
        JSON.stringify(incoming.scalarBounds?.get(name))) {
      target.scalarBounds.delete(name);
      changed = true;
    }
  }
  const sharedConditions = (target.pathConditions || []).filter(condition =>
    (incoming.pathConditions || []).some(candidate =>
      JSON.stringify(candidate) === JSON.stringify(condition)
    )
  );
  if (sharedConditions.length !== (target.pathConditions || []).length) {
    target.pathConditions = sharedConditions;
    changed = true;
  }
  return changed;
}

function cloneState(state) {
  return {
    intervals: new Map(Array.from(state.intervals, ([name, interval]) => [
      name,
      { ...interval },
    ])),
    buffers: new Map(state.buffers),
    bufferMaximums: new Map(state.bufferMaximums || []),
    expressions: new Map(state.expressions),
    rangeUpper: new Map(state.rangeUpper),
    bufferRelations: new Map(Array.from(
      state.bufferRelations,
      ([name, relations]) => [name, new Set(relations)],
    )),
    safeInt64Expressions: new Set(state.safeInt64Expressions),
    summaryDependencies: new Set(state.summaryDependencies || []),
    scalarBounds: new Map(Array.from(state.scalarBounds || [], ([name, bounds]) =>
      [name, bounds.map((bound) => ({ ...bound }))]
    )),
    pathConditions: [...(state.pathConditions || [])].map(condition => ({
      ...condition,
    })),
  };
}

function joinStates(left, right) {
  const joined = {
    intervals: new Map(), buffers: new Map(), bufferMaximums: new Map(),
  };
  joined.expressions = new Map();
  joined.rangeUpper = new Map();
  joined.bufferRelations = new Map();
  joined.safeInt64Expressions = intersectSets(
    left.safeInt64Expressions,
    right.safeInt64Expressions,
  );
  joined.summaryDependencies = new Set([
    ...(left.summaryDependencies || []),
    ...(right.summaryDependencies || []),
  ]);
  joined.scalarBounds = new Map();
  joined.pathConditions = (left.pathConditions || []).filter(condition =>
    (right.pathConditions || []).some(candidate =>
      JSON.stringify(candidate) === JSON.stringify(condition)
    )
  );
  for (const [name, bounds] of left.scalarBounds || []) {
    const other = right.scalarBounds?.get(name);
    if (other !== undefined) {
      const combined = [
        ...bounds.map((bound) => ({ ...bound })),
        ...other.map((bound) => ({ ...bound })),
      ];
      joined.scalarBounds.set(name, combined.filter((bound, index) =>
        combined.findIndex(candidate =>
          JSON.stringify(candidate) === JSON.stringify(bound)
        ) === index
      ));
    }
  }
  for (const [name, interval] of left.intervals) {
    const other = right.intervals.get(name);
    if (other !== undefined) {
      joined.intervals.set(name, joinInterval(interval, other));
    }
  }
  for (const [name, minimum] of left.buffers) {
    const other = right.buffers.get(name);
    if (other !== undefined) {
      joined.buffers.set(name, minimum < other ? minimum : other);
    }
  }
  for (const [name, maximum] of left.bufferMaximums || []) {
    const other = right.bufferMaximums?.get(name);
    if (other !== undefined) {
      joined.bufferMaximums.set(name, maximum > other ? maximum : other);
    }
  }
  for (const [name, expression] of left.expressions) {
    if (right.expressions.get(name) === expression) {
      joined.expressions.set(name, expression);
    }
  }
  for (const [name, expression] of left.rangeUpper) {
    if (right.rangeUpper.get(name) === expression) {
      joined.rangeUpper.set(name, expression);
    }
  }
  for (const [name, relations] of left.bufferRelations) {
    const intersection = intersectSets(relations, right.bufferRelations.get(name));
    if (intersection.size > 0) joined.bufferRelations.set(name, intersection);
  }
  return joined;
}

function assignedNames(statements) {
  const assigned = new Set();
  visitOperations(statements || [], (operation) => {
    for (const target of operationTargets(operation)) assigned.add(target);
    if (operation.kind?.startsWith("loop.") &&
        typeof operation.iterator === "string") assigned.add(operation.iterator);
  });
  return assigned;
}

function operationReferencesName(operation, name) {
  const ignored = new Set([
    "alternative", "body", "condition", "id", "kind", "origins",
    "provenance", "right", "target",
  ]);
  function contains(value) {
    if (value === name) return true;
    if (value === null || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(contains);
    return Object.entries(value).some(([key, child]) =>
      !ignored.has(key) && contains(child)
    );
  }
  return Object.entries(operation).some(([key, value]) =>
    !ignored.has(key) && contains(value)
  );
}

function fixedIntegerInputsAt(fn, entryState, stopIndex) {
  const values = new Map();
  for (const [definitionIndex, operation] of (fn.body || []).entries()) {
    if (definitionIndex >= stopIndex) break;
    for (const target of assignedNames([operation])) values.delete(target);
    if ([
      "if", "while", "loop.range", "loop.range_exact", "loop.range_int64",
      "bool.short_circuit", "integer.vector.scope", "integer.matrix.scope",
      "integer.arena.scope",
    ].includes(operation.kind)) continue;
    if (["integer.constant", "int64.constant"].includes(operation.kind)) {
      let value;
      try {
        value = BigInt(operation.value);
      } catch (_error) {
        continue;
      }
      values.set(operation.target, {
        kind: "constant",
        minimum: value,
        maximum: value,
        expression: value.toString(),
        definitionIndex,
      });
    } else if (operation.kind === "integer.from_int64") {
      const interval = entryState.intervals.get(operation.source);
      if (interval !== undefined) {
        values.set(operation.target, {
          kind: "int64",
          minimum: interval.minimum,
          maximum: interval.maximum,
          expression: operation.source,
          definitionIndex,
        });
      }
    } else if (operation.kind === "integer.copy") {
      const value = values.get(operation.source);
      if (value !== undefined) {
        values.set(operation.target, { ...value, definitionIndex });
      }
    }
  }
  return values;
}

function virtualFixedUInt64ViewGroups(
  fn,
  entryState,
  { allowFixed = true } = {},
) {
  const operations = [];
  visitOperations(fn.body, (operation) => operations.push(operation));
  const assignments = new Map();
  for (const operation of operations) {
    const targets = operationTargets(operation);
    if (operation.kind?.startsWith("loop.") &&
        typeof operation.iterator === "string") targets.push(operation.iterator);
    for (const target of targets) {
      assignments.set(target, (assignments.get(target) || 0) + 1);
    }
  }
  const groups = [];
  const groupedViews = new Set();
  for (const [viewIndex, view] of fn.body.entries()) {
    if (!allowFixed) break;
    if (view.kind !== "uint64.buffer.view") continue;
    const inputs = fixedIntegerInputsAt(fn, entryState, viewIndex);
    const start = inputs.get(view.start);
    const length = inputs.get(view.length);
    const rootMinimum = entryState.buffers.get(view.buffer);
    if (start === undefined || length === undefined || rootMinimum === undefined ||
        assignments.has(view.buffer) ||
        (start.kind === "int64" && assignments.has(start.expression)) ||
        assignments.get(view.start) !== 1 || assignments.get(view.length) !== 1 ||
        start.definitionIndex >= viewIndex || length.definitionIndex >= viewIndex ||
        length.minimum !== length.maximum || start.minimum < 0n ||
        length.minimum < 0n || start.maximum > INT64_MAXIMUM ||
        length.maximum > INT64_MAXIMUM || start.maximum > rootMinimum ||
        length.maximum > rootMinimum - start.maximum) continue;
    const aliases = new Set([view.target]);
    const aliasDefinition = new Map([[view.target, viewIndex]]);
    for (let index = viewIndex + 1; index < fn.body.length; index += 1) {
      const operation = fn.body[index];
      if (operation.kind !== "uint64.buffer.copy" ||
          !aliases.has(operation.source) || aliases.has(operation.target)) continue;
      aliases.add(operation.target);
      aliasDefinition.set(operation.target, index);
    }
    if (Array.from(aliases).some((name) => assignments.get(name) !== 1)) continue;
    let valid = true;
    for (const [topLevelIndex, topLevel] of fn.body.entries()) {
      visitOperations([topLevel], (operation) => {
        for (const name of aliases) {
          if (!operationReferencesName(operation, name)) continue;
          const dominated = topLevelIndex >= aliasDefinition.get(name);
          const allowed = dominated && ((
            operation === topLevel &&
            operation.kind === "uint64.buffer.copy" &&
            aliases.has(operation.source) && aliases.has(operation.target)
          ) || (
            [
              "uint64.buffer.get", "uint64.buffer.set", "uint64.buffer.length",
            ].includes(operation.kind) && operation.buffer === name
          ));
          if (!allowed) valid = false;
        }
      });
    }
    if (!valid) continue;
    groups.push({
      aliases,
      fact: Object.freeze({
        authority: "checked-region-virtual-fixed-uint64-view-v1",
        mode: "fixed",
        root: view.buffer,
        viewTarget: view.target,
        startKind: start.kind,
        startExpression: start.expression,
        startMinimum: start.minimum.toString(),
        startMaximum: start.maximum.toString(),
        length: length.minimum.toString(),
        rootMinimumLength: rootMinimum.toString(),
        viewOperation: view.id,
      }),
      view,
    });
    groupedViews.add(view);
  }
  // A checked view construction is itself sufficient authority to replace
  // the descriptor when the view remains local and nonescaping.  Unlike the
  // fixed theorem above, this form retains the ordinary validation at the
  // construction program point and snapshots the resulting data pointer and
  // logical length.  Limit the first generic slice to direct parameter roots;
  // nested virtual roots and structured view construction remain checked.
  const parameterTypes = new Map((fn.params || []).map(value => [
    value.name, value.type,
  ]));
  for (const [viewIndex, view] of fn.body.entries()) {
    if (view.kind !== "uint64.buffer.view" || groupedViews.has(view) ||
        parameterTypes.get(view.buffer) !== "UInt64Buffer") continue;
    const aliases = new Set([view.target]);
    const aliasDefinition = new Map([[view.target, viewIndex]]);
    for (let index = viewIndex + 1; index < fn.body.length; index += 1) {
      const operation = fn.body[index];
      if (operation.kind !== "uint64.buffer.copy" ||
          !aliases.has(operation.source) || aliases.has(operation.target)) continue;
      aliases.add(operation.target);
      aliasDefinition.set(operation.target, index);
    }
    if (Array.from(aliases).some((name) => assignments.get(name) !== 1)) continue;
    let valid = true;
    for (const [topLevelIndex, topLevel] of fn.body.entries()) {
      visitOperations([topLevel], (operation) => {
        for (const name of aliases) {
          if (!operationReferencesName(operation, name)) continue;
          const dominated = topLevelIndex >= aliasDefinition.get(name);
          const allowed = dominated && ((
            operation === topLevel &&
            operation.kind === "uint64.buffer.copy" &&
            aliases.has(operation.source) && aliases.has(operation.target)
          ) || (
            [
              "uint64.buffer.get", "uint64.buffer.set", "uint64.buffer.length",
            ].includes(operation.kind) && operation.buffer === name
          ));
          if (!allowed) valid = false;
        }
      });
    }
    if (!valid) continue;
    const fixedLength = fixedIntegerInputsAt(fn, entryState, viewIndex)
      .get(view.length);
    const logicalLength = fixedLength !== undefined &&
        fixedLength.minimum === fixedLength.maximum &&
        fixedLength.minimum >= 0n && fixedLength.maximum <= INT64_MAXIMUM
      ? fixedLength.minimum.toString()
      : undefined;
    groups.push({
      aliases,
      fact: Object.freeze({
        authority: "checked-region-virtual-fixed-uint64-view-v1",
        mode: "validated",
        root: view.buffer,
        viewTarget: view.target,
        viewOperation: view.id,
        ...(logicalLength === undefined ? {} : { logicalLength }),
      }),
      view,
    });
  }
  return groups;
}

function summaryIndependentValidatedViewState(state) {
  return {
    ...state,
    intervals: new Map(),
    buffers: new Map(),
    bufferMaximums: new Map(),
    expressions: new Map(),
    rangeUpper: new Map(),
    bufferRelations: new Map(),
    safeInt64Expressions: new Set(),
    summaryDependencies: new Set(),
    scalarBounds: new Map(),
    pathConditions: [],
  };
}

function attachVirtualFixedUInt64Views(
  fn,
  entryState,
  enabled,
  intervalViewAccesses = new Map(),
  graphFunctions,
  pendingGraphAuthorizations = [],
) {
  if (!enabled.has("virtual-fixed-uint64-views")) return;
  const authorizations = [];
  for (const { aliases, fact: localFact, view } of virtualFixedUInt64ViewGroups(
    fn,
    entryState,
  )) {
    const root = graphFunctions === undefined
      ? undefined
      : checkedRegionGraphRoot(graphFunctions);
    const graphFixed = localFact.mode === "fixed" && root !== undefined;
    const fact = graphFixed
      ? Object.freeze({
        ...localFact,
        authority: "checked-region-graph-virtual-fixed-uint64-view-v1",
        graphMembers: Object.freeze(graphFunctions.map(member => member.name)),
        rootEntry: root.entry,
        rootVariantEntry: root.variantEntry,
      })
      : localFact;
    const viewClaim = Object.freeze({ ...fact, role: "view", target: view.target });
    view[VIRTUAL_UINT64_VIEW_PROOF] = viewClaim;
    authorizations.push([view, viewClaim]);
    visitOperations(fn.body, (operation) => {
      if (operation.kind === "uint64.buffer.copy" &&
          aliases.has(operation.source) && aliases.has(operation.target)) {
        const claim = Object.freeze({
          ...fact,
          role: "alias",
          source: operation.source,
          target: operation.target,
        });
        operation[VIRTUAL_UINT64_VIEW_PROOF] = claim;
        authorizations.push([operation, claim]);
      } else if ([
        "uint64.buffer.get", "uint64.buffer.set", "uint64.buffer.length",
      ].includes(operation.kind) && aliases.has(operation.buffer)) {
        const interval = intervalViewAccesses.get(operation);
        const claim = Object.freeze({
          ...fact,
          role: "access",
          accessKind: operation.kind,
          buffer: operation.buffer,
          operation: operation.id,
          ...(interval === undefined ? {} : {
            logicalIndexProof: Object.freeze({ ...interval }),
          }),
        });
        operation[VIRTUAL_UINT64_VIEW_PROOF] = claim;
        authorizations.push([operation, claim]);
      }
    });
  }
  // All claims in this function are one structural proof unit. Authorize only
  // after attaching every claim, so deleting or changing any one claim
  // invalidates descriptor elimination and every rewritten access together.
  for (const [operation, claim] of authorizations) {
    if (claim.authority ===
        "checked-region-graph-virtual-fixed-uint64-view-v1") {
      pendingGraphAuthorizations.push({
        functions: graphFunctions,
        owner: fn,
        operation,
        claim,
      });
    } else {
      virtualUInt64ViewAuthority.authorize(fn, operation, claim);
    }
  }
}

function checkedRegionGraphFunctions(owner, variants) {
  const region = owner.checkedRegionVariant?.region;
  if (region === undefined) return undefined;
  const members = variants.filter(candidate =>
    candidate.checkedRegionVariant?.region === region
  );
  if (!members.includes(owner)) return undefined;
  return Object.freeze([
    owner,
    ...members.filter(candidate => candidate !== owner)
      .sort((left, right) => left.name.localeCompare(right.name)),
  ]);
}

function checkedRegionGraphRoot(functions) {
  if (!Array.isArray(functions) || functions.length === 0) return undefined;
  const roots = functions.filter(fn =>
    fn?.checkedRegionGraphRoot?.authority ===
      "checked-region-graph-root-v1"
  );
  if (roots.length !== 1) return undefined;
  const owner = roots[0];
  const root = owner.checkedRegionGraphRoot;
  if (owner.checkedRegionVariant?.original !== root.entry ||
      owner.name !== root.variantEntry || !Array.isArray(root.guard) ||
      root.guard.length === 0 || functions.some(fn =>
        fn?.checkedRegionVariant?.region !== owner.checkedRegionVariant?.region
      )) return undefined;
  return root;
}

function rangeIteratorInterval(operation, state) {
  const start = state.intervals.get(operation.start);
  const stop = state.intervals.get(operation.stop);
  const step = state.intervals.get(operation.step);
  if (start === undefined || stop === undefined || step === undefined) {
    return undefined;
  }
  let interval;
  if (step.minimum > 0n) {
    interval = {
      minimum: start.minimum,
      maximum: stop.maximum - 1n,
    };
  } else if (step.maximum < 0n) {
    interval = {
      minimum: stop.minimum + 1n,
      maximum: start.maximum,
    };
  } else {
    return undefined;
  }
  if (interval.minimum > interval.maximum ||
      interval.minimum < INT64_MINIMUM ||
      interval.maximum > INT64_MAXIMUM) return undefined;
  return interval;
}

function functionValueType(fn, name) {
  return [...fn.params, ...fn.locals].find(value => value.name === name)?.type;
}

function comparisonCondition(operation, fn) {
  const value = operation.condition?.value;
  if (typeof value !== "string") return undefined;
  const operations = operation.condition?.operations || [];
  const comparison = operations.at(-1);
  if (!["int64.compare", "uint64.compare"].includes(comparison?.kind) ||
      comparison.target !== value || functionValueType(fn, value) !== "bool") {
    return undefined;
  }
  const operandType = comparison.kind === "int64.compare" ? "int64" : "uint64";
  return functionValueType(fn, comparison.left) === operandType &&
      functionValueType(fn, comparison.right) === operandType
    ? comparison
    : undefined;
}

function reversedComparison(operation) {
  return ({ lt: "gt", le: "ge", gt: "lt", ge: "le", eq: "eq", ne: "ne" })[
    operation
  ];
}

function negatedComparison(operation) {
  return ({ lt: "ge", le: "gt", gt: "le", ge: "lt", eq: "ne", ne: "eq" })[
    operation
  ];
}

function declaredScalarDomain(fn, name) {
  const type = functionValueType(fn, name);
  if (type === "int64") {
    return { minimum: INT64_MINIMUM, maximum: INT64_MAXIMUM };
  }
  if (type === "uint64") {
    return { minimum: 0n, maximum: UINT64_MAXIMUM };
  }
  return undefined;
}

function seedRequiredComparisonConstants(condition, comparison, state) {
  const operands = new Set([comparison.left, comparison.right]);
  const producers = new Map(Array.from(operands, name => [name, []]));
  visitOperations(condition?.operations || [], (operation) => {
    if (operands.has(operation.target)) {
      producers.get(operation.target).push(operation);
    }
  });
  const comparisonLocation = operationListLocation(
    condition?.operations, comparison,
  );
  for (const [name, definitions] of producers) {
    if (definitions.length !== 1 || comparisonLocation === undefined) continue;
    const [operation] = definitions;
    const producerLocation = operationListLocation(
      condition?.operations, operation,
    );
    if (producerLocation === undefined ||
        producerLocation.statements !== comparisonLocation.statements ||
        producerLocation.index >= comparisonLocation.index ||
        !["int64.constant", "uint64.constant"].includes(operation.kind)) {
      continue;
    }
    try {
      const value = BigInt(operation.value);
      state.intervals.set(name, { minimum: value, maximum: value });
      state.expressions.set(name, constantExpression(value));
    } catch (_error) {
      // Malformed constants remain unknown and cannot refine a path.
    }
  }
}

function refinedInterval(interval, operation, constant) {
  let minimum = interval.minimum;
  let maximum = interval.maximum;
  if (operation === "lt") maximum = maximum < constant - 1n
    ? maximum : constant - 1n;
  else if (operation === "le") maximum = maximum < constant
    ? maximum : constant;
  else if (operation === "gt") minimum = minimum > constant + 1n
    ? minimum : constant + 1n;
  else if (operation === "ge") minimum = minimum > constant
    ? minimum : constant;
  else if (operation === "eq") {
    minimum = minimum > constant ? minimum : constant;
    maximum = maximum < constant ? maximum : constant;
  } else if (operation === "ne") {
    // A convex interval can represent exclusion only at an endpoint.
    if (minimum === constant) minimum += 1n;
    else if (maximum === constant) maximum -= 1n;
  } else {
    return undefined;
  }
  return minimum <= maximum ? { minimum, maximum } : undefined;
}

function refineConditionState(operation, state, truth, fn, structured = true) {
  const comparison = comparisonCondition(operation, fn);
  if (comparison === undefined) {
    const result = cloneState(state);
    if (structured) {
      const conditionAssignments = assignedNames(
        operation.condition?.operations || [],
      );
      const requiredComparisons = truth
        ? requiredTrueComparisons(operation.condition)
        : requiredFalseComparisons(operation.condition);
      for (const required of requiredComparisons) {
        for (const name of [required.left, required.right]) {
          if (!conditionAssignments.has(name)) continue;
          result.intervals.delete(name);
          result.expressions.delete(name);
          result.rangeUpper.delete(name);
          result.scalarBounds.delete(name);
        }
        seedRequiredComparisonConstants(operation.condition, required, result);
        const refined = refineConditionState({
          condition: { operations: [required], value: required.target },
        }, result, truth, fn, false);
        Object.assign(result, refined);
      }
    }
    return result;
  }
  const left = state.intervals.get(comparison.left) ||
    declaredScalarDomain(fn, comparison.left);
  const right = state.intervals.get(comparison.right) ||
    declaredScalarDomain(fn, comparison.right);
  let pathRelation = comparison.operation;
  if (!truth) pathRelation = negatedComparison(pathRelation);
  let name;
  let constant;
  let relation = comparison.operation;
  if (left !== undefined && right !== undefined &&
      right.minimum === right.maximum) {
    name = comparison.left;
    constant = right.minimum;
  } else if (right !== undefined && left !== undefined &&
      left.minimum === left.maximum) {
    name = comparison.right;
    constant = left.minimum;
    relation = reversedComparison(relation);
  } else {
    const result = cloneState(state);
    let pathRelation = comparison.operation;
    if (!truth) pathRelation = negatedComparison(pathRelation);
    const leftExpression = state.expressions.get(comparison.left);
    const rightExpression = state.expressions.get(comparison.right);
    if (pathRelation !== undefined && leftExpression !== undefined &&
        rightExpression !== undefined) {
      result.pathConditions.push({
        left: leftExpression,
        operation: pathRelation,
        right: rightExpression,
      });
    }
    return result;
  }
  if (relation === undefined) return cloneState(state);
  if (!truth) relation = negatedComparison(relation);
  if (relation === undefined) return cloneState(state);
  const interval = state.intervals.get(name) || declaredScalarDomain(fn, name);
  if (interval === undefined) return cloneState(state);
  const refined = refinedInterval(interval, relation, constant);
  const result = cloneState(state);
  const leftExpression = state.expressions.get(comparison.left);
  const rightExpression = state.expressions.get(comparison.right);
  if (pathRelation !== undefined && leftExpression !== undefined &&
      rightExpression !== undefined) {
    result.pathConditions.push({
      left: leftExpression,
      operation: pathRelation,
      right: rightExpression,
    });
  }
  // An impossible arm contributes no useful fact without an explicit bottom
  // state. Keeping its incoming facts is conservative.
  if (refined !== undefined) result.intervals.set(name, refined);
  return result;
}

function scalarComparisonPossibility(comparison, state, fn) {
  const left = state.intervals.get(comparison.left) ||
    declaredScalarDomain(fn, comparison.left);
  const right = state.intervals.get(comparison.right) ||
    declaredScalarDomain(fn, comparison.right);
  if (left === undefined || right === undefined) {
    return { truth: true, falsity: true };
  }
  let alwaysTrue = false;
  let alwaysFalse = false;
  if (comparison.operation === "lt") {
    alwaysTrue = left.maximum < right.minimum;
    alwaysFalse = left.minimum >= right.maximum;
  } else if (comparison.operation === "le") {
    alwaysTrue = left.maximum <= right.minimum;
    alwaysFalse = left.minimum > right.maximum;
  } else if (comparison.operation === "gt") {
    alwaysTrue = left.minimum > right.maximum;
    alwaysFalse = left.maximum <= right.minimum;
  } else if (comparison.operation === "ge") {
    alwaysTrue = left.minimum >= right.maximum;
    alwaysFalse = left.maximum < right.minimum;
  } else if (comparison.operation === "eq") {
    alwaysTrue = left.minimum === left.maximum &&
      right.minimum === right.maximum && left.minimum === right.minimum;
    alwaysFalse = left.maximum < right.minimum || right.maximum < left.minimum;
  } else if (comparison.operation === "ne") {
    alwaysTrue = left.maximum < right.minimum || right.maximum < left.minimum;
    alwaysFalse = left.minimum === left.maximum &&
      right.minimum === right.maximum && left.minimum === right.minimum;
  }
  return { truth: !alwaysFalse, falsity: !alwaysTrue };
}

function comparisonPossibility(operation, state, fn) {
  const comparison = comparisonCondition(operation, fn);
  if (comparison !== undefined) {
    return scalarComparisonPossibility(comparison, state, fn);
  }
  let truth = true;
  for (const required of requiredTrueComparisons(operation.condition)) {
    const seeded = cloneState(state);
    seedRequiredComparisonConstants(operation.condition, required, seeded);
    if (!scalarComparisonPossibility(required, seeded, fn).truth) {
      truth = false;
      break;
    }
  }
  let falsity = true;
  for (const required of requiredFalseComparisons(operation.condition)) {
    const seeded = cloneState(state);
    seedRequiredComparisonConstants(operation.condition, required, seeded);
    if (!scalarComparisonPossibility(required, seeded, fn).falsity) {
      falsity = false;
      break;
    }
  }
  return { truth, falsity };
}

function statementOutcomes(statements) {
  let outcomes = new Set(["fallthrough"]);
  for (const operation of statements || []) {
    if (!outcomes.has("fallthrough")) break;
    outcomes.delete("fallthrough");
    if (operation.kind === "raise") {
      outcomes.add("raise");
    } else if (operation.kind === "return") {
      outcomes.add("other-termination");
    } else if (operation.kind === "if") {
      for (const outcome of statementOutcomes(operation.body)) {
        outcomes.add(outcome);
      }
      for (const outcome of statementOutcomes(operation.alternative)) {
        outcomes.add(outcome);
      }
    } else {
      outcomes.add("fallthrough");
    }
  }
  return outcomes;
}

function statementsCanFallThrough(statements) {
  return statementOutcomes(statements).has("fallthrough");
}

function invalidateNestedCalls(operation, context) {
  if (context.facts === undefined) return;
  visitOperations(operation, (nested) => {
    if (nested.kind !== "native.call" ||
        !context.byName.has(nested.function)) return;
    const unknown = {
      intervals: new Map(),
      buffers: new Map(),
      bufferMaximums: new Map(),
      expressions: new Map(),
      rangeUpper: new Map(),
      bufferRelations: new Map(),
      safeInt64Expressions: new Set(),
      summaryDependencies: new Set(),
      scalarBounds: new Map(),
      pathConditions: [],
    };
    mergeFacts(context.facts.get(nested.function), unknown);
  });
}

function requiredTrueComparisons(condition) {
  const producers = new Map();
  visitOperations(condition?.operations || [], (operation) => {
    if (typeof operation.target === "string") {
      producers.set(operation.target, operation);
    }
  });
  function collect(name) {
    const producer = producers.get(name);
    if (["int64.compare", "uint64.compare"].includes(producer?.kind)) {
      return [producer];
    }
    if (producer?.kind === "bool.short_circuit" &&
        producer.operation === "and") {
      return [
        ...collect(producer.left),
        ...collect(producer.right?.value),
      ];
    }
    return [];
  }
  return collect(condition?.value);
}

function requiredFalseComparisons(condition) {
  const producers = new Map();
  visitOperations(condition?.operations || [], (operation) => {
    if (typeof operation.target === "string") {
      producers.set(operation.target, operation);
    }
  });
  function collect(name) {
    const producer = producers.get(name);
    if (["int64.compare", "uint64.compare"].includes(producer?.kind)) {
      return [producer];
    }
    if (producer?.kind === "bool.short_circuit" &&
        producer.operation === "or") {
      return [
        ...collect(producer.left),
        ...collect(producer.right?.value),
      ];
    }
    return [];
  }
  return collect(condition?.value);
}

function operationListLocation(statements, target) {
  for (const [index, operation] of (statements || []).entries()) {
    if (operation === target) return { statements, index };
    const nestedLists = [
      operation.body,
      operation.alternative,
      operation.condition?.operations,
      operation.right?.operations,
    ];
    for (const nested of nestedLists) {
      const location = operationListLocation(nested, target);
      if (location !== undefined) return location;
    }
  }
  return undefined;
}

/*
 * Prove the small but performance-critical pattern
 *
 *     while buffer[index] == 0:
 *         index += 1
 *         companion_0 += constant_0
 *         ...
 *
 * from one checked latch and a guarded maximum buffer length. Python signed
 * indexing admits exactly [-length, length - 1], so the checked latch bounds
 * the number of successful iterations by twice the maximum length. The
 * recognizer intentionally admits only a flat sequence of literal/self
 * updates. Any extra operation, aliasing write, reordered producer, call, or
 * control transfer makes the theorem unavailable.
 */
function affineCheckedWhileShape(operation, state, fn) {
  if (operation.kind !== "while" ||
      operation.condition?.operations?.length !== 3 ||
      !Array.isArray(operation.body) || operation.body.length === 0 ||
      operation.body.length % 2 !== 0) return undefined;
  const [access, zero, comparison] = operation.condition.operations;
  let zeroValue;
  try {
    zeroValue = BigInt(zero.value);
  } catch (_error) {
    return undefined;
  }
  if (access.kind !== "uint64.buffer.get" ||
      access.bufferType !== "UInt64Buffer" || access.indexType !== "int64" ||
      zero.kind !== "uint64.constant" || zeroValue !== 0n ||
      comparison.kind !== "uint64.compare" || comparison.operation !== "eq" ||
      comparison.left !== access.target || comparison.right !== zero.target ||
      operation.condition.value !== comparison.target ||
      functionValueType(fn, access.index) !== "int64") return undefined;
  const bufferMaximum = state.bufferMaximums?.get(access.buffer);
  if (bufferMaximum === undefined || bufferMaximum <= 0n) return undefined;
  const maximumIterations = 2n * bufferMaximum;
  if (maximumIterations > INT64_MAXIMUM) return undefined;

  const updates = [];
  const targets = new Set();
  for (let index = 0; index < operation.body.length; index += 2) {
    const literal = operation.body[index];
    const update = operation.body[index + 1];
    if (literal.kind !== "int64.constant" ||
        update.kind !== "int64.binary" ||
        !["add", "sub"].includes(update.operation) ||
        update.left !== update.target || update.right !== literal.target ||
        targets.has(update.target) ||
        functionValueType(fn, update.target) !== "int64") return undefined;
    let value;
    try {
      value = BigInt(literal.value);
    } catch (_error) {
      return undefined;
    }
    if (value < 0n || value > INT64_MAXIMUM) return undefined;
    const delta = update.operation === "add" ? value : -value;
    targets.add(update.target);
    updates.push({ literal, update, delta });
  }
  const anchor = updates.find(item => item.update.target === access.index);
  if (anchor === undefined || anchor.delta !== 1n) return undefined;

  const results = [];
  for (const item of updates) {
    let operationMinimum;
    let operationMaximum;
    let postMinimum;
    let postMaximum;
    if (item === anchor) {
      operationMinimum = -bufferMaximum + 1n;
      operationMaximum = bufferMaximum;
      // A continuing path has just observed a successful, false latch.
      postMinimum = -bufferMaximum;
      postMaximum = bufferMaximum - 1n;
    } else {
      const entry = state.intervals.get(item.update.target);
      if (entry === undefined) return undefined;
      const firstMinimum = entry.minimum + item.delta;
      const firstMaximum = entry.maximum + item.delta;
      const lastMinimum = entry.minimum + maximumIterations * item.delta;
      const lastMaximum = entry.maximum + maximumIterations * item.delta;
      operationMinimum = firstMinimum < lastMinimum
        ? firstMinimum : lastMinimum;
      operationMaximum = firstMaximum > lastMaximum
        ? firstMaximum : lastMaximum;
      postMinimum = entry.minimum < lastMinimum ? entry.minimum : lastMinimum;
      postMaximum = entry.maximum > lastMaximum ? entry.maximum : lastMaximum;
    }
    if (operationMinimum < INT64_MINIMUM ||
        operationMaximum > INT64_MAXIMUM ||
        postMinimum < INT64_MINIMUM || postMaximum > INT64_MAXIMUM) {
      return undefined;
    }
    results.push({
      ...item,
      operationMinimum,
      operationMaximum,
      postMinimum,
      postMaximum,
    });
  }
  return {
    access,
    bufferMaximum,
    maximumIterations,
    results,
  };
}

function analyzeAffineCheckedWhile(operation, entryState, context) {
  if (!context.enabled.has("int64-arithmetic")) return undefined;
  const shape = affineCheckedWhileShape(
    operation, entryState, context.currentFunction,
  );
  if (shape === undefined) return undefined;
  const dependencies = Object.freeze([
    ...(entryState.summaryDependencies || []),
  ].sort());
  const operationIds = Object.freeze(shape.results.map(item => item.update.id));
  for (const item of shape.results) {
    const claim = Object.freeze({
      authority: "checked-region-int64-affine-while-v1",
      operation: item.update.id,
      loop: operation.id,
      latch: shape.access.id,
      buffer: shape.access.buffer,
      index: shape.access.index,
      bufferMaximum: shape.bufferMaximum.toString(),
      maximumIterations: shape.maximumIterations.toString(),
      delta: item.delta.toString(),
      minimum: item.operationMinimum.toString(),
      maximum: item.operationMaximum.toString(),
      summaryDependencies: dependencies,
    });
    item.update.checkedRegionProof = claim;
    Object.defineProperty(item.update, CHECKED_REGION_INT64_ARITHMETIC, {
      value: true,
    });
  }
  shape.access[CHECKED_REGION_AFFINE_WHILE_LATCH_PROOF] = Object.freeze({
    authority: "checked-region-affine-while-latch-v1",
    loop: operation.id,
    access: shape.access.id,
    buffer: shape.access.buffer,
    index: shape.access.index,
    bufferMaximum: shape.bufferMaximum.toString(),
    maximumIterations: shape.maximumIterations.toString(),
    operations: operationIds,
    summaryDependencies: dependencies,
  });
  const result = cloneState(entryState);
  for (const item of shape.results) {
    result.intervals.set(item.update.target, {
      minimum: item.postMinimum,
      maximum: item.postMaximum,
    });
    result.expressions.delete(item.update.target);
    result.rangeUpper.delete(item.update.target);
    result.scalarBounds.delete(item.update.target);
  }
  return result;
}

function scalarWhileShape(operation, state, fn) {
  if (operation.kind !== "while") return undefined;
  let hasControlTransfer = false;
  visitOperations(operation.body, (nested) => {
    if (["loop.break", "loop.continue", "return", "raise"].includes(
      nested.kind,
    )) hasControlTransfer = true;
  });
  if (hasControlTransfer) return undefined;
  const bodyAssignments = assignedNames(operation.body);
  const conditionAssignments = assignedNames(
    operation.condition?.operations || [],
  );
  for (const comparison of requiredTrueComparisons(operation.condition)) {
    if (comparison.kind !== "int64.compare" ||
        !["ge", "gt"].includes(comparison.operation)) continue;
    const threshold = state.intervals.get(comparison.right);
    if (threshold === undefined || threshold.minimum !== threshold.maximum ||
        functionValueType(fn, comparison.left) !== "int64") continue;
    const thresholdProducers = [];
    visitOperations(operation.condition?.operations || [], (nested) => {
      if (operationTargets(nested).includes(comparison.right)) {
        thresholdProducers.push(nested);
      }
    });
    const thresholdLocation = operationListLocation(
      operation.condition?.operations, comparison,
    );
    const producerLocation = thresholdProducers.length === 1
      ? operationListLocation(
        operation.condition?.operations, thresholdProducers[0],
      )
      : undefined;
    const literalThreshold = thresholdProducers.length === 1 &&
      thresholdProducers[0].kind === "int64.constant" &&
      producerLocation !== undefined && thresholdLocation !== undefined &&
      producerLocation.statements === thresholdLocation.statements &&
      producerLocation.index < thresholdLocation.index;
    if (bodyAssignments.has(comparison.right) ||
        (conditionAssignments.has(comparison.right) && !literalThreshold) ||
        (!conditionAssignments.has(comparison.right) &&
          thresholdProducers.length !== 0)) continue;
    const writes = [];
    visitOperations(operation.body, (nested) => {
      if (operationTargets(nested).includes(comparison.left)) writes.push(nested);
    });
    const updates = operation.body.filter(nested =>
      nested.kind === "int64.binary" && nested.operation === "sub" &&
      nested.target === comparison.left && nested.left === comparison.left
    );
    if (assignedNames(operation.condition?.operations || [])
      .has(comparison.left)) continue;
    if (writes.length !== 1 || writes[0] !== updates[0]) continue;
    if (updates.length !== 1) continue;
    let step = state.intervals.get(updates[0].right);
    const stepWrites = [];
    visitOperations(operation.body, (nested) => {
      if (operationTargets(nested).includes(updates[0].right)) {
        stepWrites.push(nested);
      }
    });
    if (step !== undefined && (stepWrites.length > 0 ||
        conditionAssignments.has(updates[0].right))) continue;
    if (step === undefined) {
      const constants = operation.body.filter(nested =>
        nested.kind === "int64.constant" &&
        nested.target === updates[0].right
      );
      if (constants.length === 1 && stepWrites.length === 1 &&
          stepWrites[0] === constants[0] &&
          operation.body.indexOf(constants[0]) < operation.body.indexOf(updates[0])) {
        try {
          const value = BigInt(constants[0].value);
          step = { minimum: value, maximum: value };
        } catch (_error) {
          step = undefined;
        }
      }
    }
    if (step === undefined || step.minimum !== step.maximum ||
        step.minimum <= 0n) continue;
    return {
      variable: comparison.left,
      threshold: threshold.minimum,
      step: step.minimum,
      entryExpression: state.expressions.get(comparison.left),
    };
  }
  return undefined;
}

function abstractStatesEqual(left, right) {
  function mapsEqual(a, b, equal) {
    return a.size === b.size && Array.from(a).every(([name, value]) =>
      b.has(name) && equal(value, b.get(name))
    );
  }
  const intervalsEqual = (a, b) =>
    a.minimum === b.minimum && a.maximum === b.maximum;
  const setsEqual = (a, b) => a.size === b.size &&
    Array.from(a).every(value => b.has(value));
  return mapsEqual(left.intervals, right.intervals, intervalsEqual) &&
    mapsEqual(left.buffers, right.buffers, (a, b) => a === b) &&
    mapsEqual(
      left.bufferMaximums || new Map(),
      right.bufferMaximums || new Map(),
      (a, b) => a === b,
    ) &&
    mapsEqual(left.expressions, right.expressions, (a, b) => a === b) &&
    mapsEqual(left.rangeUpper, right.rangeUpper, (a, b) => a === b) &&
    mapsEqual(left.bufferRelations, right.bufferRelations, setsEqual) &&
    mapsEqual(left.scalarBounds, right.scalarBounds, (a, b) =>
      JSON.stringify(a) === JSON.stringify(b)
    ) && setsEqual(left.safeInt64Expressions, right.safeInt64Expressions) &&
    setsEqual(left.summaryDependencies, right.summaryDependencies) &&
    JSON.stringify(left.pathConditions) === JSON.stringify(right.pathConditions);
}

function analyzeScalarWhile(operation, entryState, context) {
  const conditionedEntry = analyzeStatements(
    operation.condition?.operations,
    cloneState(entryState),
    { ...context, enabled: new Set(), facts: undefined, callFacts: undefined },
  );
  const shape = scalarWhileShape(
    operation, conditionedEntry, context.currentFunction,
  );
  if (shape === undefined) return undefined;
  let head = cloneState(entryState);
  let converged = false;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const conditioned = analyzeStatements(
      operation.condition?.operations,
      cloneState(head),
      { ...context, enabled: new Set(), facts: undefined, callFacts: undefined },
    );
    let truth = cloneState(conditioned);
    for (const comparison of requiredTrueComparisons(operation.condition)) {
      truth = refineConditionState({
        condition: { operations: [comparison], value: comparison.target },
      }, truth, true, context.currentFunction, false);
    }
    const body = analyzeStatements(operation.body, truth, {
      ...context,
      enabled: new Set(),
      facts: undefined,
      callFacts: undefined,
    });
    const next = joinStates(entryState, body);
    if (abstractStatesEqual(head, next)) {
      head = next;
      converged = true;
      break;
    }
    head = next;
  }
  if (!converged) return undefined;

  // Record callees and proof inputs once from the converged invariant. The
  // speculative fixed-point iterations above deliberately had no authority
  // side effects.
  const conditioned = analyzeStatements(
    operation.condition?.operations, cloneState(head), context,
  );
  let truth = cloneState(conditioned);
  for (const comparison of requiredTrueComparisons(operation.condition)) {
    truth = refineConditionState({
      condition: { operations: [comparison], value: comparison.target },
    }, truth, true, context.currentFunction, false);
  }
  analyzeStatements(operation.body, truth, context);

  const entryInterval = entryState.intervals.get(shape.variable);
  if (entryInterval !== undefined && shape.entryExpression !== undefined) {
    const lower = shape.threshold - shape.step;
    head.scalarBounds.set(shape.variable, [{
      minimum: constantExpression(
        entryInterval.minimum < lower ? entryInterval.minimum : lower,
      ),
      maximum: shape.entryExpression,
    }]);
  }
  return head;
}

function forgetScalarAndBufferFacts(state, names) {
  for (const name of names) {
    state.intervals.delete(name);
    state.buffers.delete(name);
    state.bufferMaximums?.delete(name);
    state.expressions.delete(name);
    state.rangeUpper.delete(name);
    state.bufferRelations.delete(name);
    state.scalarBounds.delete(name);
  }
}

function unsupportedWhileLocalSeed(operation, entryState) {
  const assigned = assignedNames([operation]);
  return {
    intervals: new Map(Array.from(entryState.intervals).filter(([name]) =>
      !assigned.has(name)
    ).map(([name, interval]) => [name, { ...interval }])),
    buffers: new Map(Array.from(entryState.buffers).filter(([name]) =>
      !assigned.has(name)
    )),
    bufferMaximums: new Map(Array.from(
      entryState.bufferMaximums || [],
    ).filter(([name]) => !assigned.has(name))),
    expressions: new Map(),
    rangeUpper: new Map(),
    bufferRelations: new Map(),
    safeInt64Expressions: new Set(),
    summaryDependencies: new Set(entryState.summaryDependencies || []),
    scalarBounds: new Map(),
    pathConditions: [],
  };
}

function analyzeUnsupportedWhileInvariantCalls(operation, entryState, context) {
  if (context.facts === undefined) return;
  // Model one arbitrary iteration solely to propagate facts into nested
  // callees.  Every name assigned anywhere in the loop is unknown at the
  // iteration head; consequently only immutable outer facts and values
  // reconstructed from them inside this iteration can reach a call.  The
  // resulting state is discarded and cannot cross the backedge or loop exit.
  const seed = unsupportedWhileLocalSeed(operation, entryState);
  const conditioned = analyzeStatements(
    operation.condition?.operations,
    cloneState(seed),
    {
      ...context,
      activeRange: undefined,
      callFacts: undefined,
      directResultCallees: undefined,
      enabled: new Set(),
      scalarSummaries: new Map(),
    },
  );
  analyzeStatements(
    operation.body,
    conditioned,
    {
      ...context,
      activeRange: undefined,
      callFacts: undefined,
      directResultCallees: undefined,
      enabled: new Set(),
      scalarSummaries: new Map(),
    },
  );
}

function analyzeUnsupportedWhileSuccessChains(operation, entryState, context) {
  // This is deliberately not a loop analysis. It admits only a contiguous
  // successful scalar call, its pure forwarding copies, and a direct-result
  // consumer in the same statement list. The local state never crosses a
  // branch, backedge, break, loop exit, or unrelated operation.
  if (context.callFacts === undefined ||
      context.directResultCallees === undefined) return;
  const seed = unsupportedWhileLocalSeed(operation, entryState);
  function scan(statements) {
    for (let index = 0; index < (statements || []).length; index += 1) {
      const producer = statements[index];
      if (producer.kind === "native.call" &&
          context.scalarSummaries?.has(producer.function) &&
          typeof producer.target === "string" &&
          ["int64", "uint64"].includes(producer.returnType)) {
        let forwarded = producer.target;
        const forwarders = [];
        let cursor = index + 1;
        while (cursor < statements.length) {
          const candidate = statements[cursor];
          if (candidate.kind !== `${producer.returnType}.copy` ||
              candidate.source !== forwarded ||
              typeof candidate.target !== "string" ||
              functionValueType(context.currentFunction, candidate.target) !==
                producer.returnType) break;
          forwarders.push(candidate);
          forwarded = candidate.target;
          cursor += 1;
        }
        const consumer = statements[cursor];
        const matchingArguments = consumer?.kind === "native.call"
          ? consumer.arguments.filter(argument =>
            argument.name === forwarded && argument.type === producer.returnType
          )
          : [];
        if (forwarders.length > 0 && consumer?.kind === "native.call" &&
            context.directResultCallees.has(consumer.function) &&
            matchingArguments.length === 1) {
          const localCallFacts = new Map();
          analyzeStatements(
            statements.slice(index, cursor + 1), cloneState(seed), {
              ...context,
              activeRange: undefined,
              enabled: new Set(),
              facts: undefined,
              callFacts: localCallFacts,
            },
          );
          const fact = localCallFacts.get(consumer);
          if (fact !== undefined) {
            context.callFacts.set(consumer, {
              ...fact,
              localSuccessProof: Object.freeze({
                authority: "checked-region-unsupported-loop-local-success-v1",
                loop: operation.id,
                producer: producer.id,
                forwarders: Object.freeze(forwarders.map(value => value.id)),
                consumer: consumer.id,
              }),
            });
          }
        }
      }
      if (producer.kind === "while") {
        analyzeUnsupportedWhileSuccessChains(producer, seed, context);
      } else if (["if", "loop.range_int64"].includes(producer.kind)) {
        for (const nested of [producer.body, producer.alternative]) {
          if (Array.isArray(nested)) scan(nested);
        }
      }
    }
  }
  scan(operation.body);
}

function analyzeStatements(statements, state, context) {
  for (const operation of statements || []) {
    if (operation.kind === "if") {
      const conditioned = analyzeStatements(
        operation.condition?.operations,
        cloneState(state),
        context,
      );
      const possibility = context.pruneImpossibleBranches === true
        ? comparisonPossibility(operation, conditioned, context.currentFunction)
        : { truth: true, falsity: true };
      const body = possibility.truth
        ? analyzeStatements(
          operation.body,
          refineConditionState(
            operation, conditioned, true, context.currentFunction,
          ),
          context,
        )
        : undefined;
      const alternative = possibility.falsity
        ? analyzeStatements(
          operation.alternative,
          refineConditionState(
            operation, conditioned, false, context.currentFunction,
          ),
          context,
        )
        : undefined;
      if (body === undefined) {
        state = alternative;
        continue;
      }
      if (alternative === undefined) {
        state = body;
        continue;
      }
      const bodyContinues = statementsCanFallThrough(operation.body);
      const alternativeContinues = statementsCanFallThrough(
        operation.alternative,
      );
      if (!bodyContinues && alternativeContinues) state = alternative;
      else if (!alternativeContinues && bodyContinues) state = body;
      else state = joinStates(body, alternative);
      continue;
    }
    if (operation.kind === "bool.short_circuit") {
      const executed = analyzeStatements(
        operation.right?.operations,
        cloneState(state),
        context,
      );
      state = joinStates(state, executed);
      for (const target of operationTargets(operation)) {
        state.intervals.delete(target);
        state.buffers.delete(target);
        state.bufferMaximums?.delete(target);
        state.expressions.delete(target);
        state.rangeUpper.delete(target);
        state.bufferRelations.delete(target);
        state.scalarBounds.delete(target);
      }
      continue;
    }
    if (operation.kind === "loop.range_int64") {
      const assigned = assignedNames(operation.body);
      const bodyState = cloneState(state);
      for (const name of assigned) {
        bodyState.intervals.delete(name);
        bodyState.buffers.delete(name);
        bodyState.bufferMaximums?.delete(name);
        bodyState.expressions.delete(name);
        bodyState.rangeUpper.delete(name);
        bodyState.bufferRelations.delete(name);
        bodyState.scalarBounds.delete(name);
      }
      bodyState.intervals.delete(operation.index);
      bodyState.buffers.delete(operation.index);
      bodyState.bufferMaximums?.delete(operation.index);
      bodyState.expressions.delete(operation.index);
      bodyState.rangeUpper.delete(operation.index);
      bodyState.bufferRelations.delete(operation.index);
      bodyState.scalarBounds.delete(operation.index);
      if (operation.iterator !== undefined) {
        bodyState.intervals.delete(operation.iterator);
        bodyState.buffers.delete(operation.iterator);
        bodyState.bufferMaximums?.delete(operation.iterator);
        bodyState.expressions.delete(operation.iterator);
        bodyState.rangeUpper.delete(operation.iterator);
        bodyState.bufferRelations.delete(operation.iterator);
        bodyState.scalarBounds.delete(operation.iterator);
      }
      const mutatesBound = [operation.start, operation.stop, operation.step]
        .some((name) => assigned.has(name));
      const mutatesIterator = operation.iterator !== undefined &&
        assigned.has(operation.iterator);
      const iterator = mutatesBound || mutatesIterator
        ? undefined
        : rangeIteratorInterval(operation, state);
      if (iterator !== undefined && !assigned.has(operation.index)) {
        bodyState.intervals.set(operation.index, iterator);
      }
      const unitStep = state.intervals.get(operation.step);
      const activeRange = iterator !== undefined &&
          !assigned.has(operation.index) &&
          unitStep?.minimum === unitStep?.maximum &&
          (unitStep.minimum === 1n || unitStep.minimum === -1n)
        ? {
          operation: operation.id,
          index: operation.index,
          step: unitStep.minimum,
          start: { ...state.intervals.get(operation.start) },
          stop: { ...state.intervals.get(operation.stop) },
          interval: { ...iterator },
        }
        : undefined;
      const start = state.intervals.get(operation.start);
      const step = state.intervals.get(operation.step);
      const upper = state.expressions.get(operation.stop);
      if (!mutatesBound && !assigned.has(operation.index) &&
          start?.minimum >= 0n && step?.minimum > 0n &&
          upper !== undefined) {
        bodyState.rangeUpper.set(operation.index, upper);
      }
      analyzeStatements(operation.body, bodyState, {
        ...context,
        activeRange,
      });
      assigned.add(operation.index);
      if (operation.iterator !== undefined) assigned.add(operation.iterator);
      for (const name of assigned) {
        state.intervals.delete(name);
        state.buffers.delete(name);
        state.bufferMaximums?.delete(name);
        state.expressions.delete(name);
        state.rangeUpper.delete(name);
        state.bufferRelations.delete(name);
        state.scalarBounds.delete(name);
      }
      continue;
    }
    if (operation.kind === "while" &&
        context.enabled.has("int64-arithmetic")) {
      const affineState = analyzeAffineCheckedWhile(operation, state, context);
      if (affineState !== undefined) {
        state = affineState;
        continue;
      }
    }
    if (operation.kind === "while" &&
        (context.scalarSummaryAnalysis === true ||
          context.enabled.has("scalar-return-summaries"))) {
      const loopState = analyzeScalarWhile(operation, state, context);
      if (loopState !== undefined) {
        state = loopState;
        continue;
      }
    }
    if (operation.kind === "while") {
      // Whole-loop facts remain unavailable.  A separate pass may propagate
      // only immutable outer facts and values reconstructed within one
      // arbitrary iteration into nested callees; no resulting state crosses
      // the backedge, join, or loop exit.
      if (context.propagateUnsupportedLoopInvariants === true) {
        analyzeUnsupportedWhileInvariantCalls(operation, state, context);
      } else {
        invalidateNestedCalls(operation, context);
      }
      analyzeUnsupportedWhileSuccessChains(operation, state, context);
      const assigned = assignedNames([operation]);
      forgetScalarAndBufferFacts(state, assigned);
      continue;
    }
    if ([
      "loop.range", "loop.range_exact", "integer.vector.scope",
      "integer.matrix.scope", "integer.arena.scope",
    ].includes(operation.kind)) {
      // Resource scopes and non-fixed-width iterators retain the older fully
      // opaque treatment.  They are not part of the local-success theorem.
      invalidateNestedCalls(operation, context);
      forgetScalarAndBufferFacts(state, assignedNames([operation]));
      continue;
    }

    if (operation.kind === "return" && context.returnFacts !== undefined) {
      context.returnFacts.push(Object.freeze({
        interval: state.intervals.get(operation.value),
        expression: state.expressions.get(operation.value),
        bounds: state.scalarBounds.get(operation.value)?.map(bound =>
          Object.freeze({
            ...bound,
            conditions: Object.freeze([
              ...(bound.conditions || []),
              ...(state.pathConditions || []),
            ].map(condition => Object.freeze({ ...condition }))),
          })
        ),
        conditions: new Set((state.pathConditions || []).map(condition =>
          JSON.stringify(condition)
        )),
        dependencies: new Set(state.summaryDependencies || []),
      }));
    }

    const previous = cloneState(state);
    for (const target of operationTargets(operation)) {
      state.intervals.delete(target);
      state.buffers.delete(target);
      state.bufferMaximums?.delete(target);
      state.expressions.delete(target);
      state.rangeUpper.delete(target);
      state.bufferRelations.delete(target);
      state.scalarBounds.delete(target);
    }
    if (["int64.constant", "uint64.constant"].includes(operation.kind)) {
      const value = BigInt(operation.value);
      state.intervals.set(operation.target, { minimum: value, maximum: value });
      state.expressions.set(operation.target, constantExpression(value));
    } else if (["int64.copy", "uint64.copy"].includes(operation.kind)) {
      const value = previous.intervals.get(operation.source);
      if (value !== undefined) state.intervals.set(operation.target, { ...value });
      const expression = previous.expressions.get(operation.source);
      if (expression !== undefined) state.expressions.set(operation.target, expression);
      const upper = previous.rangeUpper.get(operation.source);
      if (upper !== undefined) state.rangeUpper.set(operation.target, upper);
      const bounds = previous.scalarBounds.get(operation.source);
      if (bounds !== undefined) {
        state.scalarBounds.set(operation.target, bounds.map(bound => ({ ...bound })));
      }
    } else if (["uint64.buffer.copy", "int64.buffer.copy"].includes(
      operation.kind,
    )) {
      const minimum = previous.buffers.get(operation.source);
      if (minimum !== undefined) state.buffers.set(operation.target, minimum);
      const maximum = previous.bufferMaximums?.get(operation.source);
      if (maximum !== undefined) {
        state.bufferMaximums.set(operation.target, maximum);
      }
      const relations = previous.bufferRelations.get(operation.source);
      if (relations !== undefined) {
        state.bufferRelations.set(operation.target, new Set(relations));
      }
    } else if (operation.kind === "int64.binary" &&
        ["add", "sub", "mul"].includes(operation.operation)) {
      const expression = binaryExpression(
        operation.operation,
        previous.expressions.get(operation.left),
        previous.expressions.get(operation.right),
      );
      const result = intervalResult(
        operation.operation,
        previous.intervals.get(operation.left),
        previous.intervals.get(operation.right),
      );
      const intervalSafe = result !== undefined &&
        result.minimum >= INT64_MINIMUM && result.maximum <= INT64_MAXIMUM;
      const relationalSafe = expression !== undefined &&
        previous.safeInt64Expressions.has(expression);
      if (intervalSafe || relationalSafe) {
        const provedRange = intervalSafe
          ? result
          : { minimum: 0n, maximum: INT64_MAXIMUM };
        state.intervals.set(operation.target, provedRange);
        if (context.enabled.has("int64-arithmetic") &&
            (context.directResult === true ||
              previous.summaryDependencies.size === 0)) {
          operation.checkedRegionProof = Object.freeze({
            authority: "checked-region-int64-interval-v1",
            operation: operation.id,
            minimum: provedRange.minimum.toString(),
            maximum: provedRange.maximum.toString(),
            ...(relationalSafe ? { relation: expression } : {}),
          });
          Object.defineProperty(operation, CHECKED_REGION_INT64_ARITHMETIC, {
            value: true,
          });
        }
      }
      if (expression !== undefined) state.expressions.set(operation.target, expression);
    } else if (context.directResult === true &&
        operation.kind === "range.validate_step" &&
        operation.stepType === "int64") {
      const step = previous.intervals.get(operation.step);
      if (step !== undefined && (step.maximum < 0n || step.minimum > 0n)) {
        operation.checkedRegionProof = Object.freeze({
          authority: "checked-region-nonzero-int64-step-v1",
          operation: operation.id,
          step: operation.step,
          minimum: step.minimum.toString(),
          maximum: step.maximum.toString(),
        });
      }
    }

    if ([
      "uint64.buffer.get",
      "uint64.buffer.set",
      "int64.buffer.get",
      "int64.buffer.set",
    ].includes(operation.kind)) {
      const index = previous.intervals.get(operation.index);
      const minimumLength = previous.buffers.get(operation.buffer);
      const relational = previous.rangeUpper.get(operation.index);
      const relationships = previous.bufferRelations.get(operation.buffer);
      const intervalProof = index !== undefined && minimumLength !== undefined &&
        index.minimum >= 0n && index.maximum < minimumLength &&
        index.maximum <= UINT64_MAXIMUM;
      const relationalProof = relational !== undefined &&
        relationships?.has(relational);
      const virtual = context.virtualViewAliases?.get(operation.buffer);
      const logicalLength = virtual?.fact.mode === "fixed"
        ? virtual.fact.length
        : virtual?.fact.logicalLength;
      const range = context.activeRange;
      if (context.enabled.has("interval-view-access") &&
          (context.directResult === true ||
            previous.summaryDependencies.size === 0) &&
          operation.indexType === "int64" && index !== undefined &&
          logicalLength !== undefined && range !== undefined &&
          range.index === operation.index && index.minimum >= 0n &&
          index.maximum < BigInt(logicalLength)) {
        context.intervalViewAccesses.set(operation, Object.freeze({
          authority: "checked-region-virtual-view-range-v1",
          accessOperation: operation.id,
          viewOperation: virtual.fact.viewOperation,
          rangeOperation: range.operation,
          buffer: operation.buffer,
          index: operation.index,
          step: range.step.toString(),
          startMinimum: range.start.minimum.toString(),
          startMaximum: range.start.maximum.toString(),
          stopMinimum: range.stop.minimum.toString(),
          stopMaximum: range.stop.maximum.toString(),
          indexMinimum: index.minimum.toString(),
          indexMaximum: index.maximum.toString(),
          logicalLength,
        }));
      }
      if (context.enabled.has("direct-buffer-access") &&
          (context.directResult === true ||
            previous.summaryDependencies.size === 0) &&
          (intervalProof || relationalProof)) {
        operation.checkedRegionProof = Object.freeze({
          authority: "checked-region-buffer-interval-v1",
          operation: operation.id,
          accessKind: operation.kind,
          buffer: operation.buffer,
          bufferType: operation.bufferType,
          index: operation.index,
          indexType: operation.indexType,
          ...(intervalProof ? {
            indexMinimum: index.minimum.toString(),
            indexMaximum: index.maximum.toString(),
            bufferMinimumLength: minimumLength.toString(),
          } : {
            relation: relational,
          }),
        });
        Object.defineProperty(operation, CHECKED_REGION_BUFFER_ACCESS, {
          value: true,
        });
      }
    }

    if (operation.kind === "native.call" &&
        context.byName.has(operation.function)) {
      const callee = context.byName.get(operation.function);
      const incoming = {
        intervals: new Map(),
        buffers: new Map(),
        bufferMaximums: new Map(),
        expressions: new Map(),
        rangeUpper: new Map(),
        bufferRelations: new Map(),
        safeInt64Expressions: new Set(previous.safeInt64Expressions),
        summaryDependencies: new Set(previous.summaryDependencies || []),
        scalarBounds: new Map(),
        pathConditions: [],
      };
      operation.arguments.forEach((argument, index) => {
        const parameter = callee.params[index];
        const interval = previous.intervals.get(argument.name);
        const minimum = previous.buffers.get(argument.name);
        const maximum = previous.bufferMaximums?.get(argument.name);
        const expression = previous.expressions.get(argument.name);
        const upper = previous.rangeUpper.get(argument.name);
        const relationships = previous.bufferRelations.get(argument.name);
        if (interval !== undefined) incoming.intervals.set(parameter.name, interval);
        if (minimum !== undefined) incoming.buffers.set(parameter.name, minimum);
        if (maximum !== undefined) {
          incoming.bufferMaximums.set(parameter.name, maximum);
        }
        if (expression !== undefined) incoming.expressions.set(parameter.name, expression);
        if (upper !== undefined) incoming.rangeUpper.set(parameter.name, upper);
        if (relationships !== undefined) {
          incoming.bufferRelations.set(parameter.name, new Set(relationships));
        }
      });
      if (context.callFacts !== undefined) {
        context.callFacts.set(operation, {
          callee: callee.name,
          state: cloneState(incoming),
          caller: context.currentFunction,
        });
      }
      if (context.facts?.has(callee.name)) {
        const changed = mergeFacts(context.facts.get(callee.name), incoming);
        if (changed) context.changedFacts?.add(callee.name);
      }
      const summary = context.scalarSummaries?.get(callee.name);
      if (summary !== undefined && scalarSummaryCallShape(
        context.currentFunction, operation, callee,
      )) {
        const intervalParameters = new Map();
        const expressionParameters = new Map();
        operation.arguments.forEach((argument, index) => {
          const parameter = callee.params[index].name;
          intervalParameters.set(parameter, previous.intervals.get(argument.name));
          expressionParameters.set(
            parameter, previous.expressions.get(argument.name),
          );
        });
        const instantiated = [];
        let interval;
        let summaryUsable = true;
        for (const resultCase of summary.cases || []) {
          const caseIntervals = new Map(Array.from(
            intervalParameters,
            ([name, value]) => [name, value === undefined ? undefined : { ...value }],
          ));
          let casePossible = true;
          for (const condition of resultCase.conditions || []) {
            const left = parseScalarExpression(condition.left);
            const right = scalarExpressionInterval(condition.right, caseIntervals);
            if (left?.kind !== "parameter" || right === undefined ||
                caseIntervals.get(left.name) === undefined) continue;
            const current = caseIntervals.get(left.name);
            let maximum = current.maximum;
            let minimum = current.minimum;
            if (condition.operation === "lt") {
              maximum = maximum < right.maximum - 1n
                ? maximum : right.maximum - 1n;
            } else if (condition.operation === "le") {
              maximum = maximum < right.maximum ? maximum : right.maximum;
            } else if (condition.operation === "gt") {
              minimum = minimum > right.minimum + 1n
                ? minimum : right.minimum + 1n;
            } else if (condition.operation === "ge") {
              minimum = minimum > right.minimum ? minimum : right.minimum;
            } else if (condition.operation === "eq") {
              minimum = minimum > right.minimum ? minimum : right.minimum;
              maximum = maximum < right.maximum ? maximum : right.maximum;
            }
            if (minimum > maximum) {
              casePossible = false;
              break;
            }
            caseIntervals.set(left.name, { minimum, maximum });
          }
          if (!casePossible) continue;
          const minimum = scalarExpressionInterval(
            resultCase.minimum, caseIntervals,
          );
          const maximum = scalarExpressionInterval(
            resultCase.maximum, caseIntervals,
          );
          if (minimum === undefined || maximum === undefined) {
            summaryUsable = false;
            break;
          }
          const domainMinimum = ["bool", "uint64"].includes(summary.returnType)
            ? 0n : INT64_MINIMUM;
          const domainMaximum = summary.returnType === "bool"
            ? 1n
            : summary.returnType === "uint64" ? UINT64_MAXIMUM : INT64_MAXIMUM;
          // Scalar arithmetic is checked. A successful return is necessarily
          // inside its declared fixed-width domain, even when the coarse
          // expression interval also includes inputs that would have failed.
          const numeric = {
            minimum: minimum.minimum < domainMinimum
              ? domainMinimum : minimum.minimum,
            maximum: maximum.maximum > domainMaximum
              ? domainMaximum : maximum.maximum,
          };
          if (numeric.minimum > numeric.maximum) continue;
          interval = joinInterval(interval, numeric);
          const symbolicMinimum = transformScalarExpression(
            resultCase.minimum, expressionParameters,
          );
          const symbolicMaximum = transformScalarExpression(
            resultCase.maximum, expressionParameters,
          );
          if (symbolicMinimum !== undefined && symbolicMaximum !== undefined) {
            instantiated.push({
              minimum: symbolicMinimum,
              maximum: symbolicMaximum,
              conditions: (resultCase.conditions || []).map(condition => ({
                left: transformScalarExpression(
                  condition.left, expressionParameters,
                ),
                operation: condition.operation,
                right: transformScalarExpression(
                  condition.right, expressionParameters,
                ),
              })).filter(condition =>
                condition.left !== undefined && condition.right !== undefined
              ),
            });
          }
        }
        if (!summaryUsable) {
          interval = undefined;
          instantiated.length = 0;
        }
        let expression;
        if (instantiated.length === 1 &&
            instantiated[0].minimum === instantiated[0].maximum) {
          expression = instantiated[0].minimum;
        }
        if (interval !== undefined) {
          state.intervals.set(operation.target, { ...interval });
        }
        if (expression !== undefined) {
          state.expressions.set(operation.target, expression);
        }
        if (instantiated.length > 0) {
          state.scalarBounds.set(operation.target, instantiated);
        }
        state.summaryDependencies.add(callee.name);
        for (const dependency of summary.dependencies) {
          state.summaryDependencies.add(dependency);
        }
      }
    }
  }
  return state;
}

function factsImplyGuardPredicate(state, predicate) {
  if (["int64-range", "uint64-range"].includes(predicate.kind)) {
    const interval = state.intervals.get(predicate.parameter);
    return interval !== undefined &&
      interval.minimum >= BigInt(predicate.minimum) &&
      interval.maximum <= BigInt(predicate.maximum);
  }
  if (predicate.kind === "buffer-min-length") {
    const minimum = state.buffers.get(predicate.parameter);
    return minimum !== undefined && minimum >= BigInt(predicate.minimum);
  }
  if (predicate.kind === "buffer-max-length") {
    const maximum = state.bufferMaximums?.get(predicate.parameter);
    return maximum !== undefined && maximum <= BigInt(predicate.maximum);
  }
  // Relational guards remain runtime predicates unless a dedicated theorem
  // proves them. Keeping them residual is conservative and avoids treating a
  // stored expression identity as a validated view span.
  return false;
}

function factsImplyGuard(state, guard) {
  return guard.every((predicate) =>
    factsImplyGuardPredicate(state, predicate)
  );
}

function residualGuard(state, guard) {
  const residual = new Set(guard.filter((predicate) =>
    !factsImplyGuardPredicate(state, predicate)
  ));
  const requiredProducts = new Set(Array.from(residual)
    .filter((predicate) => predicate.kind === "buffer-min-length-product")
    .map((predicate) => predicate.product));
  return Object.freeze(guard.filter((predicate) =>
    residual.has(predicate) ||
    (predicate.kind === "checked-nonnegative-int64-product" &&
      requiredProducts.has(predicate.name))
  ));
}

function allUInt64ViewsAreFixed(fn, state) {
  const views = [];
  visitOperations(fn.body, (operation) => {
    if (operation.kind === "uint64.buffer.view") views.push(operation);
  });
  if (views.length === 0) return true;
  const groups = virtualFixedUInt64ViewGroups(fn, state);
  const fixed = new Set(groups
    .filter((group) => group.fact.mode === "fixed")
    .map((group) => group.view));
  return views.every((view) => fixed.has(view));
}

function directDeadExactNames(fn) {
  const dead = new Set();
  visitOperations(fn.body, (operation) => {
    if (operation.kind !== "uint64.buffer.view" ||
        operation[VIRTUAL_UINT64_VIEW_PROOF]?.mode !== "fixed") return;
    dead.add(operation.start);
    dead.add(operation.length);
  });
  let changed = true;
  while (changed) {
    changed = false;
    visitOperations(fn.body, (operation) => {
      if (typeof operation.target !== "string" ||
          !dead.has(operation.target)) return;
      if (["integer.copy", "integer.from_int64"].includes(operation.kind) &&
          !dead.has(operation.source)) {
        const local = fn.locals.find(value => value.name === operation.source);
        if (local?.type === "Integer") {
          dead.add(operation.source);
          changed = true;
        }
      }
    });
  }
  return dead;
}

function fixedWidthDirectResultShape(fn, deadExact) {
  const allowedParameters = new Set([
    "bool", "int64", "uint64", "Int64Buffer", "UInt64Buffer", "Float64",
    "Float64Buffer",
  ]);
  const allowedResults = new Set(["bool", "int64", "uint64", "Float64"]);
  return allowedResults.has(fn.returnType) &&
    fn.params.every((value) => allowedParameters.has(value.type)) &&
    fn.locals.every((value) => allowedParameters.has(value.type) ||
      (value.type === "Integer" && deadExact.has(value.name))
    );
}

function directResultFailureFree(fn) {
  const deadExact = directDeadExactNames(fn);
  if (!fixedWidthDirectResultShape(fn, deadExact)) return false;
  let returns = 0;
  let safe = true;
  const allowed = new Set([
    "if", "loop.range_int64", "int64.compare", "int64.constant",
    "int64.copy", "uint64.constant", "return", "range.validate_step",
    "int64.binary", "uint64.buffer.view", "uint64.buffer.copy",
    "uint64.buffer.get", "uint64.buffer.set", "integer.constant",
    "integer.from_int64", "integer.copy",
  ]);
  visitOperations(fn.body, (operation) => {
    if (!allowed.has(operation.kind)) {
      safe = false;
      return;
    }
    if (operation.kind === "return") {
      returns += 1;
      return;
    }
    if (operation.kind === "raise" || operation.kind === "native.call" ||
        operation.kind === "ffi.call") {
      safe = false;
      return;
    }
    if (operation.kind === "uint64.buffer.view") {
      const claim = operation[VIRTUAL_UINT64_VIEW_PROOF];
      if (claim?.role !== "view" || claim.mode !== "fixed") safe = false;
      return;
    }
    if (operation.kind === "uint64.buffer.copy") {
      if (operation[VIRTUAL_UINT64_VIEW_PROOF]?.role !== "alias") safe = false;
      return;
    }
    if (["uint64.buffer.get", "uint64.buffer.set"].includes(operation.kind)) {
      const claim = operation[VIRTUAL_UINT64_VIEW_PROOF];
      if (claim?.role !== "access" ||
          claim.logicalIndexProof?.authority !==
            "checked-region-virtual-view-range-v1") safe = false;
      return;
    }
    if (operation.kind === "int64.binary" &&
        ["add", "sub", "mul"].includes(operation.operation)) {
      if (operation.checkedRegionProof?.authority !==
          "checked-region-int64-interval-v1") safe = false;
      return;
    }
    if (operation.kind === "int64.binary") {
      safe = false;
      return;
    }
    if (operation.kind === "range.validate_step" &&
        !isCheckedRegionNonzeroStep(operation)) safe = false;
    if (operation.kind?.startsWith("integer.") &&
        (typeof operation.target !== "string" ||
          !deadExact.has(operation.target))) safe = false;
  });
  const final = fn.body.at(-1);
  if (safe && returns === 1 && final?.kind === "return") {
    fn[CHECKED_REGION_DIRECT_RESULT].deadExactNames = Object.freeze([
      ...deadExact,
    ]);
    return true;
  }
  return false;
}

function directResultCallShape(caller, operation, callee) {
  return operation.results === undefined &&
    typeof operation.target === "string" &&
    ["bool", "int64", "uint64", "Float64"].includes(operation.returnType) &&
    operation.returnType === callee.returnType &&
    functionValueType(caller, operation.target) === operation.returnType;
}

function scalarSummaryCallShape(caller, operation, callee) {
  return operation.results === undefined &&
    typeof operation.target === "string" &&
    ["bool", "int64", "uint64"].includes(operation.returnType) &&
    operation.returnType === callee.returnType &&
    functionValueType(caller, operation.target) === operation.returnType &&
    Array.isArray(operation.arguments) &&
    operation.arguments.length === callee.params.length &&
    operation.arguments.every((argument, index) =>
      argument?.type === callee.params[index].type &&
      functionValueType(caller, argument.name) === argument.type
    );
}

function scalarSummaryInitialState(fn) {
  const state = {
    intervals: new Map(), buffers: new Map(), bufferMaximums: new Map(),
    expressions: new Map(),
    rangeUpper: new Map(), bufferRelations: new Map(),
    safeInt64Expressions: new Set(), summaryDependencies: new Set(),
    scalarBounds: new Map(),
    pathConditions: [],
  };
  for (const parameter of fn.params) {
    let interval;
    if (parameter.type === "bool") interval = { minimum: 0n, maximum: 1n };
    else if (parameter.type === "int64") {
      interval = { minimum: INT64_MINIMUM, maximum: INT64_MAXIMUM };
    } else if (parameter.type === "uint64") {
      interval = { minimum: 0n, maximum: UINT64_MAXIMUM };
    }
    if (interval !== undefined) {
      state.intervals.set(parameter.name, interval);
      state.expressions.set(parameter.name, parameterExpression(parameter.name));
    }
  }
  return state;
}

function inferScalarSummaries(order, byName, enabled) {
  const summaries = new Map();
  for (const name of [...order].reverse()) {
    const fn = byName.get(name);
    if (!["bool", "int64", "uint64"].includes(fn.returnType) ||
        statementsCanFallThrough(fn.body)) continue;
    let invalidReturn = false;
    let returns = 0;
    visitOperations(fn.body, (operation) => {
      if (operation.kind !== "return") return;
      returns += 1;
      if (operation.type !== fn.returnType ||
          functionValueType(fn, operation.value) !== fn.returnType) {
        invalidReturn = true;
      }
    });
    if (invalidReturn || returns === 0) continue;
    const returnFacts = [];
    analyzeStatements(fn.body, scalarSummaryInitialState(fn), {
      byName,
      enabled,
      currentFunction: fn,
      scalarSummaries: summaries,
      returnFacts,
      scalarSummaryAnalysis: true,
    });
    if (returnFacts.length !== returns) continue;
    const cases = [];
    let completeCases = true;
    for (const fact of returnFacts) {
      let factCases;
      if (fact.bounds !== undefined) {
        factCases = fact.bounds;
      } else if (fact.expression !== undefined) {
        factCases = [{
          minimum: fact.expression,
          maximum: fact.expression,
          conditions: [...fact.conditions].map(value => JSON.parse(value)),
        }];
      } else if (fact.interval !== undefined) {
        factCases = [{
          minimum: constantExpression(fact.interval.minimum),
          maximum: constantExpression(fact.interval.maximum),
          conditions: [...fact.conditions].map(value => JSON.parse(value)),
        }];
      }
      if (!Array.isArray(factCases) || factCases.length === 0) {
        completeCases = false;
        break;
      }
      cases.push(...factCases);
    }
    if (!completeCases) continue;
    let interval;
    const parameterIntervals = new Map(scalarSummaryInitialState(fn).intervals);
    for (const resultCase of cases) {
      const minimum = scalarExpressionInterval(
        resultCase.minimum, parameterIntervals,
      );
      const maximum = scalarExpressionInterval(
        resultCase.maximum, parameterIntervals,
      );
      if (minimum === undefined || maximum === undefined) {
        interval = undefined;
        break;
      }
      interval = joinInterval(interval, {
        minimum: minimum.minimum,
        maximum: maximum.maximum,
      });
    }
    if (interval === undefined) continue;
    const expression = returnFacts[0].expression;
    const identity = expression !== undefined && returnFacts.every(fact =>
      fact.expression === expression
    )
      ? fn.params.findIndex(parameter =>
        parameterExpression(parameter.name) === expression
      )
      : -1;
    const dependencies = new Set();
    for (const fact of returnFacts) {
      for (const dependency of fact.dependencies) dependencies.add(dependency);
    }
    summaries.set(name, Object.freeze({
      function: name,
      returnType: fn.returnType,
      interval: Object.freeze({ ...interval }),
      cases: Object.freeze(cases.map(resultCase => Object.freeze({
        minimum: resultCase.minimum,
        maximum: resultCase.maximum,
        conditions: Object.freeze([...(resultCase.conditions || [])].map(
          condition => Object.freeze({ ...condition }),
        )),
      }))),
      ...(identity >= 0 ? { identityParameter: identity } : {}),
      dependencies: Object.freeze([...dependencies].sort()),
    }));
  }
  return summaries;
}

function attachDirectResultVariants(context) {
  const pendingCalls = [];
  for (const spec of context.directSpecs) {
    const eligible = [];
    const joined = {
      intervals: new Map(), buffers: new Map(), bufferMaximums: new Map(),
      expressions: new Map(),
      rangeUpper: new Map(), bufferRelations: new Map(),
      safeInt64Expressions: new Set(), initialized: false,
      summaryDependencies: new Set(),
      scalarBounds: new Map(),
      pathConditions: [],
    };
    for (const [operation, call] of context.callFacts) {
      if (call.callee !== spec.slow.name) continue;
      if (
          !directResultCallShape(call.caller, operation, spec.slow) ||
          !factsImplyGuard(call.state, spec.guard) ||
          !allUInt64ViewsAreFixed(spec.fast, call.state)) continue;
      eligible.push([operation, call]);
      mergeFacts(joined, call.state);
    }
    const selected = new Map();
    for (const selector of spec.edges) {
      const matches = Array.from(context.callFacts).filter(([operation, call]) =>
        call.callee === spec.slow.name &&
        operation.origins?.includes(selector.operationOrigin)
      );
      if (matches.length !== 1) {
        fail(`guarded direct edge ${selector.operationOrigin} matched ` +
          `${matches.length} calls`);
      }
      if (selected.has(matches[0][0])) {
        fail(`guarded direct edges resolve to the same call ` +
          `${matches[0][0].id}`);
      }
      selected.set(matches[0][0], matches[0][1]);
    }
    const selectedCalls = new Map(Array.from(selected).filter(
      ([operation, call]) =>
        directResultCallShape(call.caller, operation, spec.slow),
    ));
    if (eligible.length === 0 && selectedCalls.size === 0) continue;
    const directState = spec.mode === "guarded-direct-result"
      ? initialFacts(spec.fast, spec.guard)
      : joined;
    if (!allUInt64ViewsAreFixed(spec.fast, directState)) continue;
    const functionEnabled = new Set(spec.fast.checkedRegionLocalCapabilities);
    const groups = virtualFixedUInt64ViewGroups(spec.fast, directState);
    const virtualViewAliases = new Map(groups.flatMap((group) =>
      Array.from(group.aliases, (alias) => [alias, group])
    ));
    const intervalViewAccesses = new Map();
    analyzeStatements(spec.fast.body, cloneState(directState), {
      byName: context.byName,
      enabled: functionEnabled,
      facts: context.facts,
      virtualViewAliases,
      intervalViewAccesses,
      currentFunction: spec.fast,
      directResult: true,
      scalarSummaries: context.scalarSummaries,
    });
    attachVirtualFixedUInt64Views(
      spec.fast, directState, functionEnabled, intervalViewAccesses,
      checkedRegionGraphFunctions(spec.fast, context.variants),
      context.pendingGraphViewAuthorizations,
    );
    if (!directResultFailureFree(spec.fast)) continue;
    const returnOperation = spec.fast.body.findLast((operation) =>
      operation.kind === "return"
    );
    if (returnOperation === undefined) continue;
    const resultClaim = Object.freeze({
      authority: "checked-region-direct-result-v1",
      function: spec.fast.name,
      fallback: spec.slow.name,
      fullGuard: spec.fullGuard,
      returnOperation: returnOperation.id,
      deadExactNames: Object.freeze([
        ...spec.fast[CHECKED_REGION_DIRECT_RESULT].deadExactNames,
      ]),
    });
    returnOperation[CHECKED_REGION_DIRECT_RESULT_PROOF] = resultClaim;
    directResultAuthority.authorize(spec.fast, returnOperation, resultClaim);
    for (const [operation, call] of eligible) {
      const dependencies = Object.freeze([
        ...(call.state.summaryDependencies || []),
      ].sort());
      const claim = Object.freeze({
        authority: "checked-region-direct-call-v1",
        operation: operation.id,
        directFunction: spec.fast.name,
        fallbackFunction: spec.slow.name,
        summaryDependencies: dependencies,
        ...(call.localSuccessProof === undefined
          ? {}
          : { localSuccessProof: call.localSuccessProof }),
      });
      operation[CHECKED_REGION_DIRECT_CALL] = claim;
      pendingCalls.push({ caller: call.caller, operation, claim, dependencies });
    }
    for (const [operation, call] of selectedCalls) {
      if (eligible.some(([candidate]) => candidate === operation)) continue;
      const guard = residualGuard(call.state, spec.guard);
      if (guard.length === 0) continue;
      const claim = Object.freeze({
        authority: "checked-region-guarded-direct-call-v1",
        operation: operation.id,
        directFunction: spec.fast.name,
        fallbackFunction: spec.slow.name,
        fullGuard: spec.fullGuard,
        guard,
        parameters: Object.freeze(spec.fast.params.map((parameter, index) =>
          Object.freeze({
            name: parameter.name,
            type: parameter.type,
            argument: operation.arguments[index].name,
          })
        )),
        summaryDependencies: Object.freeze([
          ...(call.state.summaryDependencies || []),
        ].sort()),
        ...(call.localSuccessProof === undefined
          ? {}
          : { localSuccessProof: call.localSuccessProof }),
      });
      operation[CHECKED_REGION_GUARDED_DIRECT_CALL] = claim;
      pendingCalls.push({
        caller: call.caller,
        operation,
        claim,
        dependencies: claim.summaryDependencies,
        guarded: true,
      });
    }
  }
  return pendingCalls;
}

function attachCapabilities(
  region,
  entry,
  variants,
  localFacts = new Map(),
  directSpecs = [],
) {
  if (region.capabilities.length === 0 && localFacts.size === 0 &&
      directSpecs.length === 0) return;
  const enabled = new Set(region.capabilities);
  for (const capability of enabled) {
    if (!CAPABILITIES.has(capability)) fail(`unsupported capability ${capability}`);
  }
  const byName = new Map(variants.map((fn) => [fn.name, fn]));
  const edges = callGraph(variants, byName);
  const order = topologicalOrder(region.variantEntry, edges);
  const scalarSummaries = enabled.has("scalar-return-summaries")
    ? inferScalarSummaries(order, byName, new Set())
    : new Map();
  for (const name of localFacts.keys()) {
    if (!order.includes(name)) order.push(name);
  }
  const facts = new Map(order.map((name) => [name, {
    intervals: new Map(),
    buffers: new Map(),
    bufferMaximums: new Map(),
    expressions: new Map(),
    rangeUpper: new Map(),
    bufferRelations: new Map(),
    safeInt64Expressions: new Set(),
    summaryDependencies: new Set(),
    scalarBounds: new Map(),
    pathConditions: [],
    initialized: false,
  }]));
  facts.set(region.variantEntry, {
    ...initialFacts(entry, region.guard),
    initialized: true,
  });
  for (const [name, value] of localFacts) {
    facts.set(name, { ...value, initialized: true });
  }
  const callFacts = new Map();
  const analysisResults = new Map();
  const pendingGraphViewAuthorizations = [];
  const directResultCallees = new Set(directSpecs.map(spec => spec.slow.name));

  for (const name of order) {
    const fn = byName.get(name);
    const state = facts.get(name);
    const functionEnabled = new Set(
      fn.checkedRegionLocalCapabilities || enabled,
    );
    const summaryTaintedEntry = state.summaryDependencies.size > 0;
    const virtualViewState = summaryTaintedEntry
      ? summaryIndependentValidatedViewState(state)
      : state;
    const groups = functionEnabled.has("virtual-fixed-uint64-views")
      ? virtualFixedUInt64ViewGroups(fn, virtualViewState, {
        allowFixed: !summaryTaintedEntry,
      })
      : [];
    const virtualViewAliases = new Map(groups.flatMap((group) =>
      Array.from(group.aliases, (alias) => [alias, group])
    ));
    const intervalViewAccesses = new Map();
    const finalState = analyzeStatements(fn.body, cloneState(state), {
      byName,
      enabled: functionEnabled,
      facts,
      virtualViewAliases,
      intervalViewAccesses,
      callFacts,
      currentFunction: fn,
      directResultCallees,
      scalarSummaries,
    });
    analysisResults.set(fn, {
      state,
      finalState,
      functionEnabled,
      intervalViewAccesses,
      virtualViewState,
    });
  }
  // Scalar summaries deliberately taint every downstream fact in the primary
  // analysis.  A second, disjoint pass with no summaries recovers only proofs
  // derivable from guards, local operations, and ordinary checked calls.  Its
  // facts never flow back into direct-edge selection, so summary-derived
  // bounds retain their closed-graph authority while unrelated arithmetic and
  // buffer checks do not become needlessly pessimistic.
  const independentAnalysisResults = new Map();
  if (scalarSummaries.size > 0) {
    const independentFacts = new Map(order.map((name) => [name, {
      intervals: new Map(),
      buffers: new Map(),
      bufferMaximums: new Map(),
      expressions: new Map(),
      rangeUpper: new Map(),
      bufferRelations: new Map(),
      safeInt64Expressions: new Set(),
      summaryDependencies: new Set(),
      scalarBounds: new Map(),
      pathConditions: [],
      initialized: false,
    }]));
    independentFacts.set(region.variantEntry, {
      ...initialFacts(entry, region.guard),
      initialized: true,
    });
    for (const [name, value] of localFacts) {
      const independent = cloneState(value);
      independent.summaryDependencies = new Set();
      independent.scalarBounds = new Map();
      independent.pathConditions = [];
      independentFacts.set(name, { ...independent, initialized: true });
    }
    // Unlike the primary direct-edge analysis, this summary-free pass exists
    // only to establish graph-wide span facts.  Its call graph may contain
    // cycles, so never analyze an uninitialized callee as an unknown caller.
    // Instead, propagate monotonically with a bounded worklist, then perform
    // one final proof-emitting traversal from the converged states.  Failure
    // to converge simply disables graph-derived views.
    const queue = order.filter(name => independentFacts.get(name)?.initialized);
    const queued = new Set(queue);
    const maximumEvaluations = Math.max(64, order.length * 32);
    let evaluations = 0;
    while (queue.length > 0 && evaluations < maximumEvaluations) {
      const name = queue.shift();
      queued.delete(name);
      const fn = byName.get(name);
      const state = independentFacts.get(name);
      if (fn === undefined || state?.initialized !== true) continue;
      const changedFacts = new Set();
      analyzeStatements(fn.body, cloneState(state), {
        byName,
        changedFacts,
        enabled: new Set(),
        facts: independentFacts,
        currentFunction: fn,
        pruneImpossibleBranches: true,
        propagateUnsupportedLoopInvariants: true,
        scalarSummaries: new Map(),
      });
      evaluations += 1;
      for (const changed of changedFacts) {
        if (!queued.has(changed)) {
          queue.push(changed);
          queued.add(changed);
        }
      }
    }
    if (queue.length === 0) {
      for (const name of order) {
        const fn = byName.get(name);
        const state = independentFacts.get(name);
        if (fn === undefined || state?.initialized !== true) continue;
        const functionEnabled = new Set(
          fn.checkedRegionLocalCapabilities || enabled,
        );
        const virtualViewState = summaryIndependentValidatedViewState(state);
        const groups = functionEnabled.has("virtual-fixed-uint64-views")
          ? virtualFixedUInt64ViewGroups(fn, virtualViewState, {
            allowFixed: false,
          })
          : [];
        const virtualViewAliases = new Map(groups.flatMap((group) =>
          Array.from(group.aliases, (alias) => [alias, group])
        ));
        const intervalViewAccesses = new Map();
        const finalState = analyzeStatements(fn.body, cloneState(state), {
          byName,
          enabled: functionEnabled,
          facts: undefined,
          virtualViewAliases,
          intervalViewAccesses,
          currentFunction: fn,
          scalarSummaries: new Map(),
        });
        independentAnalysisResults.set(fn, {
          state,
          finalState,
          functionEnabled,
          intervalViewAccesses,
        });
      }
    }
  }
  // Direct leaves attach and authorize their joined edge proofs here.  Every
  // caller edge retains its checked private target as the fallback; direct
  // authorization is metadata-only and cannot invalidate unrelated caller
  // proofs by changing call structure.
  const pendingDirectCalls = attachDirectResultVariants({
    byName,
    callFacts,
    directSpecs,
    enabled,
    facts,
    pendingGraphViewAuthorizations,
    scalarSummaries,
    variants,
  });
  const directFunctions = new Set(directSpecs.map((spec) => spec.fast));
  for (const [fn, result] of analysisResults) {
    if (directFunctions.has(fn)) continue;
    const summaryTainted = result.state.summaryDependencies.size > 0 ||
      result.finalState.summaryDependencies.size > 0;
    const independentIntervalViewAccesses =
      independentAnalysisResults.get(fn)?.intervalViewAccesses || new Map();
    const intervalViewAccesses = summaryTainted
      ? independentIntervalViewAccesses
      : new Map([
        ...result.intervalViewAccesses,
        ...independentIntervalViewAccesses,
      ]);
    const graphDerived = fn.name !== region.variantEntry;
    const independentViewState = independentAnalysisResults.get(fn)?.state;
    const primaryViewState = result.state;
    const fixedViewCount = state => state === undefined
      ? -1
      : virtualFixedUInt64ViewGroups(fn, state)
        .filter(group => group.fact.mode === "fixed").length;
    const viewState = graphDerived
      ? [independentViewState, primaryViewState]
        .filter(state => state !== undefined)
        .reduce((best, candidate) =>
          fixedViewCount(candidate) > fixedViewCount(best) ? candidate : best
        )
      : result.virtualViewState;
    attachVirtualFixedUInt64Views(
      fn,
      viewState,
      result.functionEnabled,
      intervalViewAccesses,
      graphDerived ? checkedRegionGraphFunctions(fn, variants) : undefined,
      pendingGraphViewAuthorizations,
    );
  }
  // Graph-derived span facts are authorized only after every view claim in
  // every member has been attached.  The snapshot therefore binds the entire
  // closed private region and its authenticated public-entry guard. It
  // revokes all descriptor elision if any caller, callee, edge, sibling proof,
  // or root predicate is subsequently changed.
  for (const pending of pendingGraphViewAuthorizations) {
    graphVirtualUInt64ViewAuthority.authorize(
      pending.functions,
      pending.owner,
      pending.operation,
      pending.claim,
    );
  }
  // Caller snapshots now contain both their final fallback targets and all
  // independently authorized capability claims.
  for (const pending of pendingDirectCalls) {
    if (pending.dependencies.length > 0) {
      const dependencyFunctions = pending.dependencies.map(name => byName.get(name));
      if (dependencyFunctions.some(fn => fn === undefined)) continue;
      summaryDirectCallAuthority.authorize(
        [pending.caller, ...dependencyFunctions],
        pending.caller,
        pending.operation,
        pending.claim,
      );
    } else {
      const authority = pending.guarded
        ? guardedDirectCallAuthority
        : directCallAuthority;
      authority.authorize(pending.caller, pending.operation, pending.claim);
    }
  }
  if (enabled.has("verified-span-access")) {
    // Reconstruct ordinary checked-view/range proofs from the cloned IR.  No
    // source proof or nonportable marker is copied into the private graph.
    attachAndVerifyCheckedBoundsProofs(variants);
  }
  // Arithmetic authorization is deliberately last. Every record snapshots
  // the complete private graph after all executable IR and sibling proof
  // metadata have reached their final shape. Emission can therefore revoke a
  // raw signed operation when any caller, callee, edge, root guard, or operand
  // is changed after interval analysis.
  authorizeGraphInt64Arithmetic(variants);
}

function authorizeGraphInt64Arithmetic(variants) {
  for (const fn of variants) {
    const functions = checkedRegionGraphFunctions(fn, variants);
    if (checkedRegionGraphRoot(functions) === undefined) continue;
    visitOperations(fn.body, (operation) => {
      const claim = operation.checkedRegionProof;
      if (operation[CHECKED_REGION_INT64_ARITHMETIC] !== true ||
          ![
            "checked-region-int64-interval-v1",
            "checked-region-int64-affine-while-v1",
          ].includes(claim?.authority)) return;
      graphInt64ArithmeticAuthority.authorize(
        functions, fn, operation, claim,
      );
      return;
    });
    visitOperations(fn.body, (operation) => {
      const claim = operation[CHECKED_REGION_AFFINE_WHILE_LATCH_PROOF];
      if (claim?.authority !== "checked-region-affine-while-latch-v1" ||
          claim.access !== operation.id ||
          operation.kind !== "uint64.buffer.get") return;
      graphAffineWhileLatchAuthority.authorize(
        functions, fn, operation, claim,
      );
    });
  }
}

function prepareCheckedRegions(ir) {
  if (ir.checkedRegions === undefined) return Object.freeze([]);
  if (!Array.isArray(ir.checkedRegions)) fail("module field must be an array");
  // Portable/deserialized declarations have no authority and are ignored.
  if (ir.checkedRegions.some((region) =>
    region?.[CHECKED_REGION_AUTHORITY] !== true
  )) return Object.freeze([]);

  const originals = new Map(ir.functions.map((fn) => [fn.name, fn]));
  const occupied = new Set(originals.keys());
  const entries = new Set();
  const prepared = ir.checkedRegions.map((region, regionIndex) => {
    if (region.schema !== SCHEMA) fail(`unsupported schema ${region.schema}`);
    if (typeof region.entry !== "string") fail("entry must be a function name");
    if (!Array.isArray(region.functions) || region.functions.length === 0) {
      fail("function graph must be nonempty");
    }
    const names = new Set(region.functions);
    if (names.size !== region.functions.length) fail("duplicate graph function");
    if (!names.has(region.entry)) fail("entry is outside its function graph");
    const entry = originals.get(region.entry);
    if (entry === undefined || entry.kernelKind !== "integer") {
      fail(`entry ${region.entry} is not an integer function`);
    }
    if (entry.analysis?.backend?.kind !== "tagged") {
      fail(`entry ${region.entry} does not use the tagged public boundary`);
    }
    if (entries.has(region.entry)) fail(`duplicate region entry ${region.entry}`);
    entries.add(region.entry);
    if (entry.hostCallable === false) fail(`entry ${region.entry} is private`);
    const guard = normalizeGuard(region.guard, entry);
    if (guard.length === 0) fail("guard must be nonempty");
    if (!Array.isArray(region.capabilities)) fail("capabilities must be an array");
    if (new Set(region.capabilities).size !== region.capabilities.length) {
      fail("duplicate capability");
    }
    if (!Array.isArray(region.localVariants)) fail("localVariants must be an array");
    const localFunctions = new Set();
    const normalizedLocalVariants = region.localVariants.map((local) => {
      if (local === null || typeof local !== "object" ||
          typeof local.function !== "string" || !names.has(local.function)) {
        fail("local variant function is outside its function graph");
      }
      if (local.function === region.entry) {
        fail("local variant function must be a private graph member");
      }
      if (localFunctions.has(local.function)) fail("duplicate local variant");
      localFunctions.add(local.function);
      const target = originals.get(local.function);
      const mode = local.mode || "guarded";
      if (!["guarded", "direct-result", "guarded-direct-result"].includes(mode)) {
        fail(`unsupported local variant mode ${mode}`);
      }
      const localGuard = normalizeGuard(local.guard, target);
      if (localGuard.length === 0 && mode !== "direct-result") {
        fail("local variant guard must be nonempty");
      }
      if (!Array.isArray(local.edges)) fail("local variant edges must be an array");
      const edges = local.edges.map((edge) => {
        if (edge === null || typeof edge !== "object" ||
            typeof edge.operationOrigin !== "string" ||
            edge.operationOrigin.length === 0) {
          fail("invalid guarded direct edge selector");
        }
        return Object.freeze({ operationOrigin: edge.operationOrigin });
      });
      if (new Set(edges.map((edge) => edge.operationOrigin)).size !== edges.length) {
        fail("duplicate guarded direct edge selector");
      }
      if (mode === "guarded-direct-result" && edges.length === 0) {
        fail("guarded direct result requires an edge selector");
      }
      if (mode !== "guarded-direct-result" && edges.length !== 0) {
        fail("edge selectors require guarded direct result mode");
      }
      if (!Array.isArray(local.capabilities) ||
          new Set(local.capabilities).size !== local.capabilities.length) {
        fail("invalid local variant capabilities");
      }
      for (const capability of local.capabilities) {
        if (!CAPABILITIES.has(capability)) {
          fail(`unsupported local variant capability ${capability}`);
        }
      }
      let hasCall = false;
      visitOperations(target.body, (operation) => {
        if (operation.kind === "native.call") hasCall = true;
      });
      if (hasCall) fail("local variant functions may not contain native calls");
      return Object.freeze({
        function: local.function,
        mode,
        guard: localGuard,
        edges: Object.freeze(edges),
        capabilities: Object.freeze([...local.capabilities]),
      });
    });

    const variantNames = new Map();
    for (const name of names) {
      const fn = originals.get(name);
      if (fn === undefined || fn.kernelKind !== "integer") {
        fail(`graph member ${name} is not an integer function`);
      }
      if (fn.analysis?.backend?.requiresExactWorkspace) {
        fail(`graph member ${name} requires an exact workspace bridge`);
      }
      const variant = `sagejs_checked_r${regionIndex}_${cIdentifier(name)}`;
      if (occupied.has(variant)) fail(`variant name collision for ${name}`);
      occupied.add(variant);
      variantNames.set(name, variant);
    }

    const variants = region.functions.map((name) => {
      const original = originals.get(name);
      const variant = deepClone(original);
      variant.name = variantNames.get(name);
      variant.hostCallable = false;
      variant.checkedRegionVariant = Object.freeze({
        schema: SCHEMA,
        region: regionIndex,
        original: name,
      });
      visitOperations(variant.body, (operation) => {
        if (operation.id !== undefined) {
          operation.origins = Object.freeze([
            ...(operation.origins || [operation.id]),
          ]);
          operation.id = `${variant.name}:${operation.id}`;
        }
        // Stage A intentionally retains all checked operations.
        delete operation.boundsProof;
        delete operation.checkedRegionProof;
        delete operation[CHECKED_REGION_AFFINE_WHILE_LATCH_PROOF];
        delete operation[VIRTUAL_UINT64_VIEW_PROOF];
        delete operation.incrementProof;
        if (operation.range !== null && typeof operation.range === "object") {
          delete operation.range.incrementProof;
        }
        if (operation.kind !== "native.call") return;
        if (!names.has(operation.function)) {
          fail(`${name} calls ${operation.function} outside the closed graph`);
        }
        operation.function = variantNames.get(operation.function);
      });
      return variant;
    });
    const localFacts = new Map();
    const directSpecs = [];
    for (const [localIndex, local] of normalizedLocalVariants.entries()) {
      const slow = variants.find((candidate) =>
        candidate.checkedRegionVariant.original === local.function
      );
      const fast = deepClone(slow);
      fast.name = `${slow.name}__local_fast_${localIndex}`;
      if (occupied.has(fast.name)) fail("local variant name collision");
      occupied.add(fast.name);
      variants.push(fast);
      const original = originals.get(local.function);
      fast.checkedRegionLocalCapabilities = Object.freeze([
        ...new Set([...region.capabilities, ...local.capabilities]),
      ]);
      if (["direct-result", "guarded-direct-result"].includes(local.mode)) {
        Object.defineProperty(fast, CHECKED_REGION_DIRECT_RESULT, {
          value: {
            fallbackName: slow.name,
            deadExactNames: [],
            fullGuard: local.mode === "guarded-direct-result"
              ? local.guard
              : undefined,
          },
        });
        directSpecs.push({
          edges: local.edges,
          fast,
          fullGuard: local.mode === "guarded-direct-result"
            ? local.guard
            : undefined,
          guard: local.guard,
          mode: local.mode,
          slow,
        });
      } else {
        slow[CHECKED_REGION_LOCAL_VARIANT] = Object.freeze({
          guard: local.guard,
          fastName: fast.name,
          // The false arm reuses the ordinary checked implementation already
          // emitted for the source function.  Do not duplicate a second checked
          // body in the hot private graph.
          slowName: local.function,
        });
        localFacts.set(fast.name, initialFacts(original, local.guard));
      }
    }
    const preparedRegion = {
      schema: SCHEMA,
      entry: region.entry,
      variantEntry: variantNames.get(region.entry),
      guard,
      capabilities: region.capabilities,
      variants: Object.freeze(variants),
    };
    const variantEntry = variants.find(candidate =>
      candidate.name === preparedRegion.variantEntry
    );
    if (variantEntry === undefined) fail("missing private region entry");
    // The private graph is justified by these exact normalized predicates at
    // its sole public dispatch boundary.  Keep the root on the entry function
    // itself so graph structural authority includes it in every snapshot.
    // The prepared region and this record intentionally share the same frozen
    // guard object; graph-derived emission additionally validates all semantic
    // root fields before accepting a claim.
    variantEntry.checkedRegionGraphRoot = Object.freeze({
      authority: "checked-region-graph-root-v1",
      schema: SCHEMA,
      entry: preparedRegion.entry,
      variantEntry: preparedRegion.variantEntry,
      guard: preparedRegion.guard,
    });
    validateCapabilityInputs(variants, new Map(variants.map((fn) => [fn.name, fn])));
    attachCapabilities(
      preparedRegion,
      entry,
      variants,
      localFacts,
      directSpecs,
    );
    return Object.freeze({
      ...preparedRegion,
    });
  });
  return Object.freeze(prepared);
}

function checkedRegionVirtualUInt64Emission(fn, functions) {
  const verifier = virtualUInt64ViewAuthority.emissionVerifier(fn);
  const graphFunctions = functions instanceof Map
    ? checkedRegionGraphFunctions(fn, [...functions.values()])
    : undefined;
  const graphRoot = checkedRegionGraphRoot(graphFunctions);
  let graphVerifier;
  if (graphRoot !== undefined) {
    try {
      graphVerifier = graphVirtualUInt64ViewAuthority.emissionVerifier(
        graphFunctions,
        fn,
      );
    } catch (_error) {
      graphVerifier = undefined;
    }
  }
  const localClaims = new Map();
  const operationClaims = new WeakMap();
  const viewClaims = [];
  visitOperations(fn.body, (operation) => {
    const claim = operation[VIRTUAL_UINT64_VIEW_PROOF];
    if (claim === undefined) return;
    const authorized = claim.authority ===
        "checked-region-virtual-fixed-uint64-view-v1"
      ? verifier.isAuthorized(operation, claim)
      : claim.authority ===
        "checked-region-graph-virtual-fixed-uint64-view-v1" &&
        graphRoot?.entry === claim.rootEntry &&
        graphRoot?.variantEntry === claim.rootVariantEntry &&
        graphVerifier?.isAuthorized(operation, claim);
    if (!authorized) return;
    operationClaims.set(operation, claim);
    if (claim.role === "view") {
      localClaims.set(claim.target, claim);
      viewClaims.push(claim);
    }
    if (claim.role === "alias") localClaims.set(claim.target, claim);
  });
  return Object.freeze({
    claim(operation, role) {
      const claim = operationClaims.get(operation);
      return claim?.role === role ? claim : undefined;
    },
    isVirtualLocal(name) {
      return localClaims.has(name);
    },
    validatedViews() {
      return viewClaims.filter(claim =>
        claim.role === "view" && claim.mode === "validated"
      );
    },
  });
}

function checkedRegionInt64ArithmeticEmission(fn, functions) {
  const graphFunctions = functions instanceof Map
    ? checkedRegionGraphFunctions(fn, [...functions.values()])
    : undefined;
  const graphRoot = checkedRegionGraphRoot(graphFunctions);
  let verifier;
  let latchVerifier;
  if (graphRoot !== undefined && fn?.hostCallable === false) {
    try {
      verifier = graphInt64ArithmeticAuthority.emissionVerifier(
        graphFunctions, fn,
      );
      latchVerifier = graphAffineWhileLatchAuthority.emissionVerifier(
        graphFunctions, fn,
      );
    } catch (_error) {
      verifier = undefined;
    }
  }
  const authorized = new WeakSet();
  const checkedAccesses = new WeakSet();
  if (verifier !== undefined) {
    visitOperations(fn.body, (operation) => {
      const claim = operation.checkedRegionProof;
      if (operation[CHECKED_REGION_INT64_ARITHMETIC] !== true ||
          ![
            "checked-region-int64-interval-v1",
            "checked-region-int64-affine-while-v1",
          ].includes(claim?.authority) ||
          claim.operation !== operation.id ||
          operation.kind !== "int64.binary" ||
          !["add", "sub", "mul"].includes(operation.operation) ||
          !verifier.isAuthorized(operation, claim)) return;
      authorized.add(operation);
    });
  }
  if (latchVerifier !== undefined) {
    visitOperations(fn.body, (operation) => {
      const claim = operation[CHECKED_REGION_AFFINE_WHILE_LATCH_PROOF];
      if (claim?.authority !== "checked-region-affine-while-latch-v1" ||
          claim.access !== operation.id ||
          operation.kind !== "uint64.buffer.get" ||
          !latchVerifier.isAuthorized(operation, claim)) return;
      checkedAccesses.add(operation);
    });
  }
  return Object.freeze({
    isAuthorized(operation) {
      return operation !== null && typeof operation === "object" &&
        authorized.has(operation);
    },
    requiresCheckedAccess(operation) {
      return operation !== null && typeof operation === "object" &&
        checkedAccesses.has(operation);
    },
  });
}

function isCheckedRegionNonzeroStep(operation) {
  const proof = operation?.checkedRegionProof;
  if (proof?.authority !== "checked-region-nonzero-int64-step-v1" ||
      proof.operation !== operation.id || proof.step !== operation.step) {
    return false;
  }
  try {
    return BigInt(proof.minimum) > 0n || BigInt(proof.maximum) < 0n;
  } catch (_error) {
    return false;
  }
}

function checkedRegionDirectResultEmission(fn) {
  const metadata = fn?.[CHECKED_REGION_DIRECT_RESULT];
  if (metadata === undefined) return undefined;
  const verifier = directResultAuthority.emissionVerifier(fn);
  let result;
  visitOperations(fn.body, (operation) => {
    const claim = operation[CHECKED_REGION_DIRECT_RESULT_PROOF];
    if (result !== undefined || claim === undefined ||
        claim.authority !== "checked-region-direct-result-v1" ||
        claim.function !== fn.name ||
        claim.fallback !== metadata.fallbackName ||
        claim.fullGuard !== metadata.fullGuard ||
        claim.returnOperation !== operation.id ||
        !verifier.isAuthorized(operation, claim)) return;
    result = Object.freeze({
      fallbackName: metadata.fallbackName,
      deadExactNames: Object.freeze([...claim.deadExactNames]),
      fullGuard: claim.fullGuard,
    });
  });
  return result;
}

function checkedRegionDirectCallEmission(fn, operation, functions) {
  const claim = operation?.[CHECKED_REGION_DIRECT_CALL];
  const directAuthorized = claim?.summaryDependencies?.length > 0
    ? claim.summaryDependencies.every((name, index, values) =>
      typeof name === "string" && functions.has(name) &&
      (index === 0 || values[index - 1] < name)
    ) && summaryDirectCallAuthority.isAuthorized(
      [fn, ...claim.summaryDependencies.map(name => functions.get(name))],
      fn,
      operation,
      claim,
    )
    : directCallAuthority.emissionVerifier(fn).isAuthorized(operation, claim);
  if (claim?.authority === "checked-region-direct-call-v1" &&
      claim.operation === operation.id &&
      claim.fallbackFunction === operation.function &&
      Array.isArray(claim.summaryDependencies) && directAuthorized) {
    const direct = functions.get(claim.directFunction);
    const result = direct === undefined
      ? undefined
      : checkedRegionDirectResultEmission(direct);
    if (result?.fallbackName === claim.fallbackFunction) {
      return Object.freeze({ function: claim.directFunction });
    }
  }
  const guarded = operation?.[CHECKED_REGION_GUARDED_DIRECT_CALL];
  const guardedAuthorized = guarded?.summaryDependencies?.length > 0
    ? guarded.summaryDependencies.every((name, index, values) =>
      typeof name === "string" && functions.has(name) &&
      (index === 0 || values[index - 1] < name)
    ) && summaryDirectCallAuthority.isAuthorized(
      [fn, ...guarded.summaryDependencies.map(name => functions.get(name))],
      fn,
      operation,
      guarded,
    )
    : guardedDirectCallAuthority.emissionVerifier(fn)
      .isAuthorized(operation, guarded);
  if (guarded?.authority !== "checked-region-guarded-direct-call-v1" ||
      guarded.operation !== operation.id ||
      guarded.fallbackFunction !== operation.function ||
      !Array.isArray(guarded.guard) || !Array.isArray(guarded.parameters) ||
      guarded.parameters.length !== operation.arguments.length ||
      guarded.parameters.some((parameter, index) =>
        parameter.argument !== operation.arguments[index].name ||
        parameter.type !== operation.arguments[index].type
      ) ||
      !Array.isArray(guarded.summaryDependencies) || !guardedAuthorized) {
    return undefined;
  }
  const direct = functions.get(guarded.directFunction);
  const result = direct === undefined
    ? undefined
    : checkedRegionDirectResultEmission(direct);
  if (result?.fallbackName !== guarded.fallbackFunction ||
      result.fullGuard !== guarded.fullGuard ||
      direct.params.length !== guarded.parameters.length ||
      direct.params.some((parameter, index) =>
        parameter.name !== guarded.parameters[index].name ||
        parameter.type !== guarded.parameters[index].type
      )) return undefined;
  return Object.freeze({
    function: guarded.directFunction,
    guard: Object.freeze([...guarded.guard]),
    parameters: Object.freeze([...guarded.parameters]),
  });
}

module.exports = {
  checkedRegionDirectCallEmission,
  checkedRegionDirectResultEmission,
  checkedRegionInt64ArithmeticEmission,
  checkedRegionLocalVariant(fn) {
    return fn?.[CHECKED_REGION_LOCAL_VARIANT];
  },
  checkedRegionVirtualUInt64Emission,
  isCheckedRegionBufferAccess(operation) {
    return operation?.[CHECKED_REGION_BUFFER_ACCESS] === true &&
      operation.checkedRegionProof?.authority ===
        "checked-region-buffer-interval-v1" &&
      operation.checkedRegionProof.operation === operation.id &&
      operation.checkedRegionProof.accessKind === operation.kind &&
      operation.checkedRegionProof.buffer === operation.buffer &&
      operation.checkedRegionProof.bufferType === operation.bufferType &&
      operation.checkedRegionProof.index === operation.index &&
      operation.checkedRegionProof.indexType === operation.indexType;
  },
  isCheckedRegionNonzeroStep,
  installCheckedRegionDeclarations,
  prepareCheckedRegions,
};

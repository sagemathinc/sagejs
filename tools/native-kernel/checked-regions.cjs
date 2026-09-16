"use strict";

const {
  attachAndVerifyCheckedBoundsProofs,
} = require("./checked-bounds-proofs.cjs");
const {
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
const CHECKED_REGION_DIRECT_RESULT_PROOF = "checkedRegionDirectResultProof";
const VIRTUAL_UINT64_VIEW_PROOF = "checkedRegionVirtualUInt64ViewProof";
const virtualUInt64ViewAuthority = createFunctionProofAuthority({
  name: "checked-region virtual UInt64 view",
  ignoredKeys: [
    "boundsProof",
    "checkedRegionDirectCallProof",
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
    expressions,
    rangeUpper,
    bufferRelations,
    safeInt64Expressions,
    entry: entry.name,
  };
}

function mergeFacts(target, incoming) {
  if (!target.initialized) {
    target.intervals = new Map(incoming.intervals);
    target.buffers = new Map(incoming.buffers);
    target.expressions = new Map(incoming.expressions);
    target.rangeUpper = new Map(incoming.rangeUpper);
    target.bufferRelations = new Map(Array.from(
      incoming.bufferRelations,
      ([name, relations]) => [name, new Set(relations)],
    ));
    target.safeInt64Expressions = new Set(incoming.safeInt64Expressions);
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
  return changed;
}

function cloneState(state) {
  return {
    intervals: new Map(Array.from(state.intervals, ([name, interval]) => [
      name,
      { ...interval },
    ])),
    buffers: new Map(state.buffers),
    expressions: new Map(state.expressions),
    rangeUpper: new Map(state.rangeUpper),
    bufferRelations: new Map(Array.from(
      state.bufferRelations,
      ([name, relations]) => [name, new Set(relations)],
    )),
    safeInt64Expressions: new Set(state.safeInt64Expressions),
  };
}

function joinStates(left, right) {
  const joined = { intervals: new Map(), buffers: new Map() };
  joined.expressions = new Map();
  joined.rangeUpper = new Map();
  joined.bufferRelations = new Map();
  joined.safeInt64Expressions = intersectSets(
    left.safeInt64Expressions,
    right.safeInt64Expressions,
  );
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

function virtualFixedUInt64ViewGroups(fn, entryState) {
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

function attachVirtualFixedUInt64Views(
  fn,
  entryState,
  enabled,
  intervalViewAccesses = new Map(),
) {
  if (!enabled.has("virtual-fixed-uint64-views")) return;
  const authorizations = [];
  for (const { aliases, fact, view } of virtualFixedUInt64ViewGroups(
    fn,
    entryState,
  )) {
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
    virtualUInt64ViewAuthority.authorize(fn, operation, claim);
  }
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

function refineConditionState(operation, state, truth, fn) {
  const comparison = comparisonCondition(operation, fn);
  if (comparison === undefined) return cloneState(state);
  const left = state.intervals.get(comparison.left);
  const right = state.intervals.get(comparison.right);
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
    return cloneState(state);
  }
  if (relation === undefined) return cloneState(state);
  if (!truth) relation = negatedComparison(relation);
  if (relation === undefined) return cloneState(state);
  const refined = refinedInterval(state.intervals.get(name), relation, constant);
  const result = cloneState(state);
  // An impossible arm contributes no useful fact without an explicit bottom
  // state. Keeping its incoming facts is conservative.
  if (refined !== undefined) result.intervals.set(name, refined);
  return result;
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

function statementsAlwaysRaise(statements) {
  const outcomes = statementOutcomes(statements);
  return outcomes.size === 1 && outcomes.has("raise");
}

function invalidateNestedCalls(operation, context) {
  visitOperations(operation, (nested) => {
    if (nested.kind !== "native.call" ||
        !context.byName.has(nested.function)) return;
    mergeFacts(context.facts.get(nested.function), {
      intervals: new Map(),
      buffers: new Map(),
      expressions: new Map(),
      rangeUpper: new Map(),
      bufferRelations: new Map(),
      safeInt64Expressions: new Set(),
    });
  });
}

function analyzeStatements(statements, state, context) {
  for (const operation of statements || []) {
    if (operation.kind === "if") {
      const conditioned = analyzeStatements(
        operation.condition?.operations,
        cloneState(state),
        context,
      );
      const body = analyzeStatements(
        operation.body,
        refineConditionState(operation, conditioned, true, context.currentFunction),
        context,
      );
      const alternative = analyzeStatements(
        operation.alternative,
        refineConditionState(operation, conditioned, false, context.currentFunction),
        context,
      );
      const bodyRaises = statementsAlwaysRaise(operation.body);
      const alternativeRaises = statementsAlwaysRaise(operation.alternative);
      if (bodyRaises && !alternativeRaises) state = alternative;
      else if (alternativeRaises && !bodyRaises) state = body;
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
        state.expressions.delete(target);
        state.rangeUpper.delete(target);
        state.bufferRelations.delete(target);
      }
      continue;
    }
    if (operation.kind === "loop.range_int64") {
      const assigned = assignedNames(operation.body);
      const bodyState = cloneState(state);
      for (const name of assigned) {
        bodyState.intervals.delete(name);
        bodyState.buffers.delete(name);
        bodyState.expressions.delete(name);
        bodyState.rangeUpper.delete(name);
        bodyState.bufferRelations.delete(name);
      }
      bodyState.intervals.delete(operation.index);
      bodyState.buffers.delete(operation.index);
      bodyState.expressions.delete(operation.index);
      bodyState.rangeUpper.delete(operation.index);
      bodyState.bufferRelations.delete(operation.index);
      if (operation.iterator !== undefined) {
        bodyState.intervals.delete(operation.iterator);
        bodyState.buffers.delete(operation.iterator);
        bodyState.expressions.delete(operation.iterator);
        bodyState.rangeUpper.delete(operation.iterator);
        bodyState.bufferRelations.delete(operation.iterator);
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
        state.expressions.delete(name);
        state.rangeUpper.delete(name);
        state.bufferRelations.delete(name);
      }
      continue;
    }
    if ([
      "while", "loop.range", "loop.range_exact", "integer.vector.scope",
      "integer.matrix.scope", "integer.arena.scope",
    ].includes(operation.kind)) {
      // Facts inside unsupported loops and resource scopes are intentionally
      // unavailable.  Nested callees receive an explicit unknown context so a
      // separate proved call site cannot accidentally authorize their bodies.
      invalidateNestedCalls(operation, context);
      const assigned = assignedNames([operation]);
      for (const name of assigned) {
        state.intervals.delete(name);
        state.buffers.delete(name);
        state.expressions.delete(name);
        state.rangeUpper.delete(name);
        state.bufferRelations.delete(name);
      }
      continue;
    }

    const previous = cloneState(state);
    for (const target of operationTargets(operation)) {
      state.intervals.delete(target);
      state.buffers.delete(target);
      state.expressions.delete(target);
      state.rangeUpper.delete(target);
      state.bufferRelations.delete(target);
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
    } else if (["uint64.buffer.copy", "int64.buffer.copy"].includes(
      operation.kind,
    )) {
      const minimum = previous.buffers.get(operation.source);
      if (minimum !== undefined) state.buffers.set(operation.target, minimum);
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
        if (context.enabled.has("int64-arithmetic")) {
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
        expressions: new Map(),
        rangeUpper: new Map(),
        bufferRelations: new Map(),
        safeInt64Expressions: new Set(previous.safeInt64Expressions),
      };
      operation.arguments.forEach((argument, index) => {
        const parameter = callee.params[index];
        const interval = previous.intervals.get(argument.name);
        const minimum = previous.buffers.get(argument.name);
        const expression = previous.expressions.get(argument.name);
        const upper = previous.rangeUpper.get(argument.name);
        const relationships = previous.bufferRelations.get(argument.name);
        if (interval !== undefined) incoming.intervals.set(parameter.name, interval);
        if (minimum !== undefined) incoming.buffers.set(parameter.name, minimum);
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
      mergeFacts(context.facts.get(callee.name), incoming);
    }
  }
  return state;
}

function factsImplyGuard(state, guard) {
  for (const predicate of guard) {
    if (["int64-range", "uint64-range"].includes(predicate.kind)) {
      const interval = state.intervals.get(predicate.parameter);
      if (interval === undefined || interval.minimum < BigInt(predicate.minimum) ||
          interval.maximum > BigInt(predicate.maximum)) return false;
      continue;
    }
    if (predicate.kind === "buffer-min-length") {
      const minimum = state.buffers.get(predicate.parameter);
      if (minimum === undefined || minimum < BigInt(predicate.minimum)) {
        return false;
      }
      continue;
    }
    // This leaf-only direct-result milestone deliberately does not infer the
    // relational guard vocabulary at call edges. Later SCC/MayFail analysis
    // may extend this without weakening the checked fallback.
    return false;
  }
  return true;
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

function attachDirectResultVariants(context) {
  const pendingCalls = [];
  for (const spec of context.directSpecs) {
    const eligible = [];
    const joined = {
      intervals: new Map(), buffers: new Map(), expressions: new Map(),
      rangeUpper: new Map(), bufferRelations: new Map(),
      safeInt64Expressions: new Set(), initialized: false,
    };
    for (const [operation, call] of context.callFacts) {
      if (call.callee !== spec.slow.name) continue;
      if (
          !factsImplyGuard(call.state, spec.guard) ||
          !allUInt64ViewsAreFixed(spec.fast, call.state)) continue;
      eligible.push([operation, call]);
      mergeFacts(joined, call.state);
    }
    if (eligible.length === 0) continue;
    const functionEnabled = new Set(spec.fast.checkedRegionLocalCapabilities);
    const groups = virtualFixedUInt64ViewGroups(spec.fast, joined);
    const virtualViewAliases = new Map(groups.flatMap((group) =>
      Array.from(group.aliases, (alias) => [alias, group])
    ));
    const intervalViewAccesses = new Map();
    analyzeStatements(spec.fast.body, cloneState(joined), {
      byName: context.byName,
      enabled: functionEnabled,
      facts: context.facts,
      virtualViewAliases,
      intervalViewAccesses,
      currentFunction: spec.fast,
      directResult: true,
    });
    attachVirtualFixedUInt64Views(
      spec.fast, joined, functionEnabled, intervalViewAccesses,
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
      returnOperation: returnOperation.id,
      deadExactNames: Object.freeze([
        ...spec.fast[CHECKED_REGION_DIRECT_RESULT].deadExactNames,
      ]),
    });
    returnOperation[CHECKED_REGION_DIRECT_RESULT_PROOF] = resultClaim;
    directResultAuthority.authorize(spec.fast, returnOperation, resultClaim);
    for (const [operation, call] of eligible) {
      const claim = Object.freeze({
        authority: "checked-region-direct-call-v1",
        operation: operation.id,
        directFunction: spec.fast.name,
        fallbackFunction: spec.slow.name,
      });
      operation[CHECKED_REGION_DIRECT_CALL] = claim;
      pendingCalls.push([call.caller, operation, claim]);
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
  for (const name of localFacts.keys()) {
    if (!order.includes(name)) order.push(name);
  }
  const facts = new Map(order.map((name) => [name, {
    intervals: new Map(),
    buffers: new Map(),
    expressions: new Map(),
    rangeUpper: new Map(),
    bufferRelations: new Map(),
    safeInt64Expressions: new Set(),
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

  for (const name of order) {
    const fn = byName.get(name);
    const state = facts.get(name);
    const functionEnabled = new Set(
      fn.checkedRegionLocalCapabilities || enabled,
    );
    const groups = functionEnabled.has("virtual-fixed-uint64-views")
      ? virtualFixedUInt64ViewGroups(fn, state)
      : [];
    const virtualViewAliases = new Map(groups.flatMap((group) =>
      Array.from(group.aliases, (alias) => [alias, group])
    ));
    const intervalViewAccesses = new Map();
    analyzeStatements(fn.body, cloneState(state), {
      byName,
      enabled: functionEnabled,
      facts,
      virtualViewAliases,
      intervalViewAccesses,
      callFacts,
      currentFunction: fn,
    });
    analysisResults.set(fn, { state, functionEnabled, intervalViewAccesses });
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
  });
  const directFunctions = new Set(directSpecs.map((spec) => spec.fast));
  for (const [fn, result] of analysisResults) {
    if (directFunctions.has(fn)) continue;
    attachVirtualFixedUInt64Views(
      fn, result.state, result.functionEnabled, result.intervalViewAccesses,
    );
  }
  // Caller snapshots now contain both their final fallback targets and all
  // independently authorized capability claims.
  for (const [fn, operation, claim] of pendingDirectCalls) {
    directCallAuthority.authorize(fn, operation, claim);
  }
  if (enabled.has("verified-span-access")) {
    // Reconstruct ordinary checked-view/range proofs from the cloned IR.  No
    // source proof or nonportable marker is copied into the private graph.
    attachAndVerifyCheckedBoundsProofs(variants);
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
      if (!["guarded", "direct-result"].includes(mode)) {
        fail(`unsupported local variant mode ${mode}`);
      }
      const localGuard = normalizeGuard(local.guard, target);
      if (localGuard.length === 0 && mode !== "direct-result") {
        fail("local variant guard must be nonempty");
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
      if (local.mode === "direct-result") {
        Object.defineProperty(fast, CHECKED_REGION_DIRECT_RESULT, {
          value: { fallbackName: slow.name, deadExactNames: [] },
        });
        directSpecs.push({ fast, guard: local.guard, slow });
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

function checkedRegionVirtualUInt64Emission(fn) {
  const verifier = virtualUInt64ViewAuthority.emissionVerifier(fn);
  const localClaims = new Map();
  const operationClaims = new WeakMap();
  const viewClaims = [];
  visitOperations(fn.body, (operation) => {
    const claim = operation[VIRTUAL_UINT64_VIEW_PROOF];
    if (claim === undefined ||
        claim.authority !== "checked-region-virtual-fixed-uint64-view-v1" ||
        !verifier.isAuthorized(operation, claim)) return;
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
        claim.returnOperation !== operation.id ||
        !verifier.isAuthorized(operation, claim)) return;
    result = Object.freeze({
      fallbackName: metadata.fallbackName,
      deadExactNames: Object.freeze([...claim.deadExactNames]),
    });
  });
  return result;
}

function checkedRegionDirectCallEmission(fn, operation, functions) {
  const claim = operation?.[CHECKED_REGION_DIRECT_CALL];
  if (claim?.authority !== "checked-region-direct-call-v1" ||
      claim.operation !== operation.id ||
      claim.fallbackFunction !== operation.function ||
      !directCallAuthority.emissionVerifier(fn).isAuthorized(operation, claim)) {
    return undefined;
  }
  const direct = functions.get(claim.directFunction);
  const result = direct === undefined
    ? undefined
    : checkedRegionDirectResultEmission(direct);
  if (result?.fallbackName !== claim.fallbackFunction) return undefined;
  return Object.freeze({ function: claim.directFunction });
}

module.exports = {
  checkedRegionDirectCallEmission,
  checkedRegionDirectResultEmission,
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
  isCheckedRegionInt64Arithmetic(operation) {
    return operation?.[CHECKED_REGION_INT64_ARITHMETIC] === true &&
      operation.checkedRegionProof?.authority ===
        "checked-region-int64-interval-v1" &&
      operation.checkedRegionProof.operation === operation.id;
  },
  isCheckedRegionNonzeroStep,
  installCheckedRegionDeclarations,
  prepareCheckedRegions,
};

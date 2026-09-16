"use strict";

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
const SCHEMA = "sagejs-checked-private-region-v1";
const INT64_MINIMUM = -(1n << 63n);
const INT64_MAXIMUM = (1n << 63n) - 1n;
const UINT64_MAXIMUM = (1n << 64n) - 1n;
const CAPABILITIES = new Set(["int64-arithmetic", "direct-buffer-access"]);

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

function directOperations(fn) {
  const result = [];
  for (const operation of fn.body || []) {
    if ([
      "if", "while", "loop.range", "loop.range_exact", "loop.range_int64",
      "bool.short_circuit", "integer.vector.scope", "integer.matrix.scope",
      "integer.arena.scope",
    ].includes(operation.kind)) {
      // Stage B's first theorem is straight-line only.  Silently declining an
      // optimization is the fail-closed behavior for structured control flow.
      return undefined;
    }
    result.push(operation);
  }
  return result;
}

function callGraph(variants, byName) {
  const edges = new Map();
  for (const fn of variants) {
    const operations = directOperations(fn);
    if (operations === undefined) {
      edges.set(fn.name, []);
      continue;
    }
    edges.set(fn.name, operations
      .filter((operation) => operation.kind === "native.call")
      .map((operation) => operation.function)
      .filter((name) => byName.has(name)));
  }
  return edges;
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
  for (const predicate of guard) {
    if (predicate.kind === "buffer-min-length") {
      const current = buffers.get(predicate.parameter);
      const minimum = BigInt(predicate.minimum);
      if (current === undefined || minimum > current) {
        buffers.set(predicate.parameter, minimum);
      }
    } else if (["int64-range", "uint64-range"].includes(predicate.kind)) {
      intervals.set(predicate.parameter, {
        minimum: BigInt(predicate.minimum),
        maximum: BigInt(predicate.maximum),
      });
    }
  }
  // Exact Integer parameters deliberately remain unknown in this first
  // fixed-width theorem, even when the entry guard proves an int64 range.
  return { intervals, buffers, entry: entry.name };
}

function mergeFacts(target, incoming) {
  if (!target.initialized) {
    target.intervals = new Map(incoming.intervals);
    target.buffers = new Map(incoming.buffers);
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
  return changed;
}

function attachCapabilities(region, entry, variants) {
  if (region.capabilities.length === 0) return;
  const enabled = new Set(region.capabilities);
  for (const capability of enabled) {
    if (!CAPABILITIES.has(capability)) fail(`unsupported capability ${capability}`);
  }
  const byName = new Map(variants.map((fn) => [fn.name, fn]));
  const edges = callGraph(variants, byName);
  const order = topologicalOrder(region.variantEntry, edges);
  const facts = new Map(order.map((name) => [name, {
    intervals: new Map(),
    buffers: new Map(),
    initialized: false,
  }]));
  facts.set(region.variantEntry, {
    ...initialFacts(entry, region.guard),
    initialized: true,
  });

  for (const name of order) {
    const fn = byName.get(name);
    const operations = directOperations(fn);
    if (operations === undefined) continue;
    const state = facts.get(name);
    const intervals = new Map(state.intervals);
    const buffers = new Map(state.buffers);
    for (const operation of operations) {
      const previousIntervals = new Map(intervals);
      const previousBuffers = new Map(buffers);
      for (const target of operationTargets(operation)) {
        intervals.delete(target);
        buffers.delete(target);
      }
      if (["int64.constant", "uint64.constant"].includes(operation.kind)) {
        const value = BigInt(operation.value);
        intervals.set(operation.target, { minimum: value, maximum: value });
      } else if (["int64.copy", "uint64.copy"].includes(operation.kind)) {
        const value = previousIntervals.get(operation.source);
        if (value !== undefined) intervals.set(operation.target, { ...value });
      } else if (operation.kind === "uint64.buffer.copy") {
        const minimum = previousBuffers.get(operation.source);
        if (minimum !== undefined) buffers.set(operation.target, minimum);
      } else if (operation.kind === "int64.binary" &&
          ["add", "sub", "mul"].includes(operation.operation)) {
        const result = intervalResult(
          operation.operation,
          previousIntervals.get(operation.left),
          previousIntervals.get(operation.right),
        );
        if (result !== undefined && result.minimum >= INT64_MINIMUM &&
            result.maximum <= INT64_MAXIMUM) {
          intervals.set(operation.target, result);
          if (enabled.has("int64-arithmetic")) {
            operation.checkedRegionProof = Object.freeze({
              authority: "checked-region-int64-interval-v1",
              operation: operation.id,
              minimum: result.minimum.toString(),
              maximum: result.maximum.toString(),
            });
            Object.defineProperty(operation, CHECKED_REGION_INT64_ARITHMETIC, {
              value: true,
            });
          }
        }
      }

      if (["uint64.buffer.get", "uint64.buffer.set"].includes(operation.kind)) {
        const index = previousIntervals.get(operation.index);
        const minimumLength = previousBuffers.get(operation.buffer);
        if (enabled.has("direct-buffer-access") && index !== undefined &&
            minimumLength !== undefined && index.minimum >= 0n &&
            index.maximum < minimumLength && index.maximum <= UINT64_MAXIMUM) {
          operation.checkedRegionProof = Object.freeze({
            authority: "checked-region-buffer-interval-v1",
            operation: operation.id,
            indexMinimum: index.minimum.toString(),
            indexMaximum: index.maximum.toString(),
            bufferMinimumLength: minimumLength.toString(),
          });
          Object.defineProperty(operation, CHECKED_REGION_BUFFER_ACCESS, {
            value: true,
          });
        }
      }

      if (operation.kind === "native.call" && byName.has(operation.function)) {
        const callee = byName.get(operation.function);
        const incoming = { intervals: new Map(), buffers: new Map() };
        operation.arguments.forEach((argument, index) => {
          const parameter = callee.params[index];
          const interval = previousIntervals.get(argument.name);
          const minimum = previousBuffers.get(argument.name);
          if (interval !== undefined) incoming.intervals.set(parameter.name, interval);
          if (minimum !== undefined) incoming.buffers.set(parameter.name, minimum);
        });
        mergeFacts(facts.get(callee.name), incoming);
      }
    }
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
    const guard = Object.freeze(region.guard.map((predicate) =>
      normalizePredicate(predicate, entry)
    ));
    if (guard.length === 0) fail("guard must be nonempty");
    if (!Array.isArray(region.capabilities)) fail("capabilities must be an array");
    if (new Set(region.capabilities).size !== region.capabilities.length) {
      fail("duplicate capability");
    }

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
    const preparedRegion = {
      schema: SCHEMA,
      entry: region.entry,
      variantEntry: variantNames.get(region.entry),
      guard,
      capabilities: region.capabilities,
      variants: Object.freeze(variants),
    };
    attachCapabilities(preparedRegion, entry, variants);
    return Object.freeze({
      ...preparedRegion,
    });
  });
  return Object.freeze(prepared);
}

module.exports = {
  isCheckedRegionBufferAccess(operation) {
    return operation?.[CHECKED_REGION_BUFFER_ACCESS] === true &&
      operation.checkedRegionProof?.authority ===
        "checked-region-buffer-interval-v1" &&
      operation.checkedRegionProof.operation === operation.id;
  },
  isCheckedRegionInt64Arithmetic(operation) {
    return operation?.[CHECKED_REGION_INT64_ARITHMETIC] === true &&
      operation.checkedRegionProof?.authority ===
        "checked-region-int64-interval-v1" &&
      operation.checkedRegionProof.operation === operation.id;
  },
  installCheckedRegionDeclarations,
  prepareCheckedRegions,
};

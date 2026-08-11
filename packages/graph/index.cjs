"use strict";

const binding = require("./build/Release/sagejs_graph.node");

function ffiDimension(value, name) {
  const exact = typeof value === "bigint" ? value : BigInt(value);
  if (exact < 0n || exact > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${name} is outside the supported graph range`);
  }
  return Number(exact);
}

function ffiPacked(source, expected, name) {
  if (source === null || (typeof source !== "object" &&
      typeof source !== "function")) {
    throw new TypeError(`${name} must be a packed uint64 buffer`);
  }
  const length = Number(Reflect.get(source, "length"));
  if (!Number.isSafeInteger(length) || length !== expected) {
    throw new RangeError(`${name} length does not match its declaration`);
  }
  return Array.from(source, (value) => {
    const exact = typeof value === "bigint" ? value : BigInt(value);
    if (exact < 0n || exact > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError(`${name} entry is outside the igraph range`);
    }
    return Number(exact);
  });
}

function ffiOutput(source, expected) {
  if (source === null || (typeof source !== "object" &&
      typeof source !== "function") ||
      Number(Reflect.get(source, "length")) !== expected) {
    throw new RangeError("output length does not match its declaration");
  }
}

/* Dynamic oracle for the declaration-driven packed canonical-labeling call.
 * Labels are staged in a fresh array and committed only after igraph returns. */
binding.ffiCanonicalPermutationPacked =
function ffiCanonicalPermutationPacked(
  output, edges, vertexCountValue, edgeEntriesValue, directed,
) {
  const vertexCount = ffiDimension(vertexCountValue, "vertex_count");
  const edgeEntries = ffiDimension(edgeEntriesValue, "edge_entries");
  ffiOutput(output, vertexCount);
  if ((edgeEntries & 1) !== 0) return false;
  const labels = binding.canonicalPermutation({
    vertexCount,
    edges: ffiPacked(edges, edgeEntries, "edges"),
    directed,
  });
  if (labels.length !== vertexCount) return false;
  for (let index = 0; index < vertexCount; index += 1) {
    if (!Reflect.set(output, String(index), BigInt(labels[index]))) {
      throw new TypeError("output buffer is not writable");
    }
  }
  return true;
};

binding.ffiFirstEdgeEndpointPacked =
function ffiFirstEdgeEndpointPacked(edges, edgeEntriesValue) {
  const edgeEntries = ffiDimension(edgeEntriesValue, "edge_entries");
  const packed = ffiPacked(edges, edgeEntries, "edges");
  return edgeEntries === 0 ? null : BigInt(packed[0]);
};

const generatedFfiManifest = require("./build/generated-ffi/manifest.json");
const generatedFfi = require(
  `./build/generated-ffi/${generatedFfiManifest.addon}`,
);
const publicBinding = Object.create(null);
for (const name of Reflect.ownKeys(binding)) {
  publicBinding[name] = binding[name];
}
const declaredFfiOracles = Object.create(null);
for (const item of generatedFfiManifest.functions) {
  const name = item.export;
  if (typeof publicBinding[name] === "function") {
    declaredFfiOracles[name] = publicBinding[name];
  }
  if (typeof generatedFfi[name] !== "function") {
    throw new Error(`generated igraph FFI adapter is missing ${name}`);
  }
  publicBinding[name] = generatedFfi[name];
}
Object.defineProperty(publicBinding, "__sagejs_ffi_oracles__", {
  value: Object.freeze(declaredFfiOracles),
  enumerable: false,
});
Object.defineProperty(publicBinding, "__sagejs_ffi_manifest__", {
  value: Object.freeze(generatedFfiManifest),
  enumerable: false,
});

module.exports = publicBinding;

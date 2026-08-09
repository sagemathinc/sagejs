"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const graph = require("..");

function cycle(n) {
  const edges = [];
  for (let index = 0; index < n; index += 1) {
    edges.push(index, (index + 1) % n);
  }
  return { vertexCount: n, edges, directed: false };
}

test("Bliss recognizes isomorphic and nonisomorphic graphs", () => {
  const c5 = cycle(5);
  const relabeled = {
    vertexCount: 5,
    edges: [2, 4, 4, 1, 1, 3, 3, 0, 0, 2],
    directed: false,
  };
  assert.equal(graph.isomorphic(c5, relabeled), true);
  assert.equal(graph.isomorphic(c5, cycle(6)), false);
});

test("the igraph dispatcher preserves multigraph and loop semantics", () => {
  const parallel = {
    vertexCount: 2,
    edges: [0, 1, 0, 1],
    directed: false,
  };
  const single = { vertexCount: 2, edges: [0, 1], directed: false };
  const loop = { vertexCount: 2, edges: [0, 0], directed: false };
  const plain = { vertexCount: 2, edges: [], directed: false };
  assert.equal(graph.isomorphic(parallel, { ...parallel }), true);
  assert.equal(graph.isomorphic(parallel, single), false);
  assert.equal(graph.isomorphic(loop, plain), false);
});

test("Bliss returns compact generators and an exact order", () => {
  const group = graph.automorphismGroup(cycle(10));
  assert.equal(group.order, "20");
  assert.ok(group.generators.length <= 3);
  for (const generator of group.generators) {
    assert.deepEqual([...generator].sort((a, b) => a - b),
      Array.from({ length: 10 }, (_, index) => index));
  }
});

test("canonical labeling is a permutation", () => {
  const labeling = graph.canonicalPermutation(cycle(12));
  assert.deepEqual([...labeling].sort((a, b) => a - b),
    Array.from({ length: 12 }, (_, index) => index));
});

test("declarative packed canonical labeling commits a uint64 output", () => {
  const graphInput = cycle(12);
  const output = Array(12).fill(99n);
  assert.equal(graph.ffiCanonicalPermutationPacked(
    output,
    graphInput.edges.map(BigInt),
    12n,
    BigInt(graphInput.edges.length),
    false,
  ), true);
  assert.deepEqual([...output].sort((a, b) => Number(a - b)),
    Array.from({ length: 12 }, (_, index) => BigInt(index)));
});

test("native layouts return finite coordinates", () => {
  for (const algorithm of ["fr", "kk", "circle", "grid"]) {
    const coordinates = graph.layout(cycle(8), algorithm);
    assert.equal(coordinates.length, 8);
    for (const point of coordinates) {
      assert.equal(point.length, 2);
      assert.ok(point.every(Number.isFinite));
    }
  }
});

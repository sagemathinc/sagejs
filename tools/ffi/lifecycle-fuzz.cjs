#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..", "..");
const prefix = resolve(
  process.env.SAGEJS_GRAPH_PREFIX || join(root, "packages", "graph", ".native", "prefix"),
);
const dynamicResult = dynamicLifecycleFuzz();

function dynamicLifecycleFuzz() {
  const graph = require(join(root, "packages", "graph"));
  let checksum = 0n;
  for (let round = 0; round < 2000; round += 1) {
    const vertices = BigInt((round * 17) % 48);
    const owner = graph.ffiGraphCompleteCreate(
      vertices, (round & 1) !== 0, (round & 2) !== 0,
    );
    const view = graph.ffiGraphEdgesBorrow(owner);
    assert.equal(graph.ffiGraphVertexCount(owner), vertices);
    checksum ^= graph.ffiGraphEdgeChecksum(view);
    if ((round & 15) === 0) {
      const cycleVertices = 2 + (round % 31);
      const edges = [];
      for (let index = 0; index < cycleVertices; index += 1) {
        edges.push(BigInt(index), BigInt((index + 1) % cycleVertices));
      }
      const labels = Array(cycleVertices).fill(0n);
      assert.equal(graph.ffiCanonicalPermutationPacked(
        labels, edges, BigInt(cycleVertices), BigInt(edges.length), false,
      ), true);
      assert.deepEqual([...labels].sort((a, b) => Number(a - b)),
        Array.from({ length: cycleVertices }, (_, index) => BigInt(index)));
    }
    graph.ffiGraphClose(owner);
    graph.ffiGraphClose(owner);
    assert.throws(() => graph.ffiGraphEdgeCount(view), /closed/);
  }
  return { rounds: 2000, checksum: checksum.toString() };
}

if (process.platform === "win32") {
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/lifecycle-fuzz-v1",
    capability: "sanitizers",
    supported: false,
    reason: "ASan/UBSan lifecycle harness is currently a Unix CI capability",
    dynamic: dynamicResult,
  }) + "\n");
  process.exit(0);
}

const source = String.raw`
#include <stdint.h>
#include <stdio.h>
#include <sagejs/igraph_ffi.h>

static uint64_t next_value(uint64_t *state)
{
    *state = *state * UINT64_C(6364136223846793005) + UINT64_C(1);
    return *state;
}

int main(void)
{
    uint64_t random_state = UINT64_C(0x5a17c0de);
    uint64_t aggregate = 0;
    for (unsigned round = 0; round < 4000; round++) {
        sagejs_igraph_graph_t graph;
        sagejs_igraph_edges_view_t first;
        sagejs_igraph_edges_view_t second;
        const uint64_t vertices = next_value(&random_state) % UINT64_C(48);
        const int directed = (int) (next_value(&random_state) & UINT64_C(1));
        const int loops = (int) (next_value(&random_state) & UINT64_C(1));
        if (!sagejs_igraph_complete_init(graph, vertices, directed, loops))
            return 2;
        if (!sagejs_igraph_edges_borrow(first, graph) ||
            !sagejs_igraph_edges_borrow(second, graph))
            return 3;
        if (sagejs_igraph_vertex_count(graph) != vertices ||
            sagejs_igraph_edge_count(first) != sagejs_igraph_edge_count(second) ||
            sagejs_igraph_edge_checksum(first) !=
                sagejs_igraph_edge_checksum(second))
            return 4;
        aggregate ^= sagejs_igraph_edge_checksum(first);
        sagejs_igraph_graph_clear(graph);
        if ((round & 15U) == 0) {
            uint64_t cycle_edges[96];
            uint64_t labels[48];
            unsigned seen[48] = {0};
            const uint64_t cycle_vertices = UINT64_C(2) +
                next_value(&random_state) % UINT64_C(46);
            const sagejs_igraph_canonical_request_t request = {
                cycle_vertices, 2 * cycle_vertices, 0
            };
            for (uint64_t index = 0; index < cycle_vertices; index++) {
                cycle_edges[2 * index] = index;
                cycle_edges[2 * index + 1] = (index + 1) % cycle_vertices;
            }
            if (!sagejs_igraph_canonical_permutation_packed(
                    labels, cycle_edges, &request))
                return 5;
            for (uint64_t index = 0; index < cycle_vertices; index++) {
                if (labels[index] >= cycle_vertices || seen[labels[index]]++)
                    return 6;
            }
        }
    }
    printf("rounds=4000 aggregate=%llu\n", (unsigned long long) aggregate);
    return 0;
}
`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}):\n` +
      `${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
}

const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-lifecycle-"));
try {
  const sourcePath = join(temporary, "lifecycle.c");
  const executable = join(temporary, "lifecycle");
  writeFileSync(sourcePath, source);
  const compiler = process.env.CC || "cc";
  const args = [
    "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
    "-fsanitize=address,undefined",
    `-I${join(root, "packages", "graph", "include")}`,
    `-I${join(prefix, "include")}`,
    `-I${join(prefix, "include", "igraph")}`,
    sourcePath,
    join(prefix, "lib", "libigraph.a"),
    process.platform === "darwin" ? "-lc++" : "-lstdc++",
    "-lm", "-lpthread", "-o", executable,
  ];
  run(compiler, args);
  const output = run(executable, [], {
    env: {
      ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1:strict_string_checks=1",
      UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1",
    },
  }).trim();
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/lifecycle-fuzz-v1",
    capability: "sanitizers",
    supported: true,
    compiler,
    dynamic: dynamicResult,
    result: output,
  }, null, 2) + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

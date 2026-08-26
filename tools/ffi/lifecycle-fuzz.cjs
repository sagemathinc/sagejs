#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  sanitizerEnvironment,
  sanitizerRounds,
} = require("../../test/helpers/sanitizers.cjs");

const root = resolve(__dirname, "..", "..");
const prefix = resolve(
  process.env.SAGEJS_GRAPH_PREFIX || join(root, "packages", "graph", ".native", "prefix"),
);
const flintPrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX || join(root, "packages", "flint", ".native", "prefix"),
);
const dynamicResult = dynamicLifecycleFuzz();

function dynamicLifecycleFuzz() {
  const graph = require(join(root, "packages", "graph"));
  const flint = require(join(root, "packages", "flint"));
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
      const labels = new BigUint64Array(cycleVertices);
      assert.equal(graph.ffiCanonicalPermutationPacked(
        labels,
        BigUint64Array.from(edges),
        BigInt(cycleVertices),
        BigInt(edges.length),
        false,
      ), true);
      assert.deepEqual([...labels].sort((a, b) => Number(a - b)),
        Array.from({ length: cycleVertices }, (_, index) => BigInt(index)));
    }
    graph.ffiGraphClose(owner);
    graph.ffiGraphClose(owner);
    assert.throws(() => graph.ffiGraphEdgeCount(view), /closed/);
  }
  for (let round = 0; round < 200; round += 1) {
    const random = flint.ffiFmpqMatrixRandbits(
      3n, 3n, 2n, BigInt(round), BigInt(round + 1),
    );
    const matrix = flint.ffiFmpqMatrixCreate(3n, 3n);
    for (let index = 0; index < 9; index += 1) {
      assert.equal(flint.ffiFmpqMatrixSetEntry(
        matrix,
        BigInt(Math.floor(index / 3)),
        BigInt(index % 3),
        BigInt(round + 3 * index + (index % 4 === 0 ? 11 : 0)),
        BigInt(1 + (round + index) % 7),
      ), true);
    }
    const copy = flint.ffiFmpqMatrixCopy(matrix);
    const reduced = flint.ffiFmpqMatrixRref(copy);
    const determinant = flint.ffiFmpqMatrixDet(matrix);
    const formatted = flint.ffiFmpqMatrixFormat(reduced);
    const serialized = flint.ffiFmpqMatrixSerialize(matrix);
    const sequence = flint.ffiFmpqMatrixSerializeSequence(
      matrix, 0n, 4n, 3n,
    );
    assert.ok(flint.ffiFlintByteRegionLength(formatted) > 0n);
    assert.ok(flint.ffiFlintByteRegionLength(serialized) > 0n);
    assert.ok(flint.ffiFlintByteRegionLength(sequence) > 0n);
    const formattedCopy = flint.ffiFlintByteRegionCopyBytes(formatted);
    const serializedCopy = flint.ffiFlintByteRegionCopyBytes(serialized);
    const importedRegion = flint.ffiFlintByteRegionFromBytes(serializedCopy);
    const imported = flint.ffiFmpqMatrixDeserialize(importedRegion, 3n, 3n);
    assert.equal(
      BigInt(formattedCopy.length),
      flint.ffiFlintByteRegionLength(formatted),
    );
    assert.equal(
      BigInt(serializedCopy.length),
      flint.ffiFlintByteRegionLength(serialized),
    );
    flint.ffiFmpqMatrixClose(imported);
    flint.ffiFlintByteRegionClose(importedRegion);
    flint.ffiFlintByteRegionClose(serialized);
    flint.ffiFlintByteRegionClose(sequence);
    flint.ffiFlintByteRegionClose(formatted);
    flint.ffiFmpqValueClose(determinant);
    flint.ffiFmpqMatrixClose(reduced);
    flint.ffiFmpqMatrixClose(copy);
    flint.ffiFmpqMatrixClose(matrix);
    flint.ffiFmpqMatrixClose(random);
  }
  return { rounds: 2000, rationalRounds: 200, checksum: checksum.toString() };
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

if (process.platform === "darwin") {
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/lifecycle-fuzz-v1",
    capability: "sanitizers",
    supported: false,
    reason:
      "one static-library Apple ASan lifecycle schedule exceeds six minutes " +
      "on the M1 witness host",
    dynamic: dynamicResult,
  }) + "\n");
  process.exit(0);
}

const graphLifecycleRounds = sanitizerRounds(4000);
const rationalLifecycleRounds = sanitizerRounds(500);

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
    for (unsigned round = 0; round < ${graphLifecycleRounds}; round++) {
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
    printf("rounds=${graphLifecycleRounds} aggregate=%llu\n",
        (unsigned long long) aggregate);
    return 0;
}
`;

const rationalSource = String.raw`
#include <stdint.h>
#include <flint/fmpz_mat.h>
#include <sagejs/ffi_algorithms.h>
#include <sagejs/fmpz_matrix_ffi.h>

int main(void)
{
    for (slong round = 0; round < ${rationalLifecycleRounds}; round++) {
        fmpz_mat_t left_num, left_den, right_num, right_den;
        fmpz_mat_t output_num, output_den, scalar_num, scalar_den;
        fmpz_mat_t polynomial_num, polynomial_den, rank;
        fmpz_mat_init(left_num, 3, 3);
        fmpz_mat_init(left_den, 3, 3);
        fmpz_mat_init(right_num, 3, 3);
        fmpz_mat_init(right_den, 3, 3);
        fmpz_mat_init(output_num, 3, 3);
        fmpz_mat_init(output_den, 3, 3);
        fmpz_mat_init(scalar_num, 1, 1);
        fmpz_mat_init(scalar_den, 1, 1);
        fmpz_mat_init(polynomial_num, 1, 4);
        fmpz_mat_init(polynomial_den, 1, 4);
        fmpz_mat_init(rank, 1, 1);
        for (slong row = 0; row < 3; row++)
            for (slong column = 0; column < 3; column++) {
                const slong index = 3 * row + column;
                fmpz_set_si(fmpz_mat_entry(left_num, row, column),
                    (round + 3 * index) % 29 - 14 + (row == column ? 17 : 0));
                fmpz_set_ui(fmpz_mat_entry(left_den, row, column),
                    (ulong) (1 + (round + index) % 7));
                fmpz_set_si(fmpz_mat_entry(right_num, row, column),
                    (2 * round + 5 * index) % 31 - 15);
                fmpz_set_ui(fmpz_mat_entry(right_den, row, column),
                    (ulong) (1 + (round + 2 * index) % 5));
            }
        if (!sagejs_flint_fmpq_mat_mul_parts(
                output_num, output_den,
                left_num, left_den, right_num, right_den))
            return 2;
        if (!sagejs_flint_fmpq_mat_rank_parts(
                rank, left_num, left_den))
            return 3;
        if (!sagejs_flint_fmpq_mat_rref_parts(
                rank, output_num, output_den, left_num, left_den))
            return 4;
        (void) sagejs_flint_fmpq_mat_inv_parts(
            output_num, output_den, left_num, left_den);
        (void) sagejs_flint_fmpq_mat_solve_parts(
            output_num, output_den,
            left_num, left_den, right_num, right_den);
        if (!sagejs_flint_fmpq_mat_det_parts(
                scalar_num, scalar_den, left_num, left_den))
            return 5;
        if (!sagejs_flint_fmpq_mat_charpoly_parts(
                polynomial_num, polynomial_den, left_num, left_den))
            return 6;
        sagejs_fmpz_matrix_t integer, integer_imported;
        sagejs_fmpq_matrix_t matrix, random, copy, reduced, imported, invalid;
        sagejs_fmpq_value_t determinant;
        sagejs_flint_byte_region_t formatted, serialized, copied, rejected;
        sagejs_flint_byte_region_t rational_sequence;
        sagejs_flint_byte_region_t integer_serialized, integer_body, truncated;
        sagejs_flint_byte_region_t integer_sequence;
        rejected->data = NULL;
        rejected->length = 0;
        if (!sagejs_fmpq_matrix_init(matrix, 3, 3))
            return 7;
        if (!sagejs_fmpq_matrix_randbits(
                random, 3, 3, 2, (uint64_t) round,
                (uint64_t) round + UINT64_C(1)))
            return 8;
        for (slong row = 0; row < 3; row++)
            for (slong column = 0; column < 3; column++)
                if (!sagejs_fmpq_matrix_set_entry(
                        matrix, (uint64_t) row, (uint64_t) column,
                        fmpz_mat_entry(left_num, row, column),
                        fmpz_mat_entry(left_den, row, column)))
                    return 9;
        if (!sagejs_fmpq_matrix_init_set(copy, matrix) ||
            !sagejs_fmpq_matrix_rref(reduced, copy) ||
            !sagejs_fmpq_matrix_det(determinant, matrix) ||
            !sagejs_fmpq_matrix_format(formatted, reduced) ||
            !sagejs_fmpq_matrix_serialize(serialized, matrix) ||
            !sagejs_fmpq_matrix_serialize_sequence(
                rational_sequence, matrix, 0, 4, 3))
            return 10;
        if (sagejs_flint_byte_region_data(formatted) == NULL ||
            sagejs_flint_byte_region_data(serialized) == NULL ||
            sagejs_flint_byte_region_length(formatted) == 0 ||
            sagejs_flint_byte_region_length(serialized) == 0 ||
            sagejs_flint_byte_region_length(rational_sequence) == 0)
            return 11;
        if (sagejs_flint_byte_region_init_copy(rejected, NULL, 1) ||
            rejected->data != NULL || rejected->length != 0)
            return 12;
        if (!sagejs_flint_byte_region_init_copy(
                rejected, serialized->data, serialized->length))
            return 13;
        sagejs_flint_byte_region_clear(rejected);
        if (!sagejs_flint_byte_region_init_copy(
                copied, serialized->data, serialized->length) ||
            !sagejs_fmpq_matrix_deserialize(imported, copied, 3, 3))
            return 14;
        if (!sagejs_fmpz_matrix_init(integer, 3, 3))
            return 15;
        for (slong row = 0; row < 3; row++)
            for (slong column = 0; column < 3; column++)
                if (!sagejs_fmpz_matrix_set_entry(
                        integer, (uint64_t) row, (uint64_t) column,
                        fmpz_mat_entry(left_num, row, column)))
                    return 16;
        if (!sagejs_fmpz_matrix_serialize(integer_serialized, integer) ||
            !sagejs_fmpz_matrix_serialize_sequence(
                integer_sequence, integer, 2, 3, 3) ||
            integer_serialized->length < 24 ||
            !sagejs_flint_byte_region_init_copy(
                integer_body, integer_serialized->data + 24,
                integer_serialized->length - 24) ||
            !sagejs_fmpz_matrix_deserialize_entries(
                integer_imported, integer_body, 3, 3))
            return 17;
        if (!sagejs_flint_byte_region_init_copy(
                truncated, serialized->data, serialized->length - 1))
            return 18;
        if (sagejs_fmpq_matrix_deserialize(invalid, truncated, 3, 3))
        {
            sagejs_fmpq_matrix_clear(invalid);
            return 19;
        }
        sagejs_flint_byte_region_clear(truncated);
        sagejs_fmpz_matrix_clear(integer_imported);
        sagejs_flint_byte_region_clear(integer_body);
        sagejs_flint_byte_region_clear(integer_serialized);
        sagejs_flint_byte_region_clear(integer_sequence);
        sagejs_fmpz_matrix_clear(integer);
        sagejs_fmpq_matrix_clear(imported);
        sagejs_flint_byte_region_clear(copied);
        sagejs_flint_byte_region_clear(serialized);
        sagejs_flint_byte_region_clear(rational_sequence);
        sagejs_flint_byte_region_clear(formatted);
        sagejs_fmpq_value_clear(determinant);
        sagejs_fmpq_matrix_clear(reduced);
        sagejs_fmpq_matrix_clear(copy);
        sagejs_fmpq_matrix_clear(matrix);
        sagejs_fmpq_matrix_clear(random);
        fmpz_mat_clear(rank);
        fmpz_mat_clear(polynomial_den);
        fmpz_mat_clear(polynomial_num);
        fmpz_mat_clear(scalar_den);
        fmpz_mat_clear(scalar_num);
        fmpz_mat_clear(output_den);
        fmpz_mat_clear(output_num);
        fmpz_mat_clear(right_den);
        fmpz_mat_clear(right_num);
        fmpz_mat_clear(left_den);
        fmpz_mat_clear(left_num);
    }
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
    env: sanitizerEnvironment({ strictStringChecks: true }),
  }).trim();
  const rationalSourcePath = join(temporary, "rational-lifecycle.c");
  const rationalExecutable = join(temporary, "rational-lifecycle");
  writeFileSync(rationalSourcePath, rationalSource);
  run(compiler, [
    "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
    "-fsanitize=address,undefined",
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(flintPrefix, "include")}`,
    rationalSourcePath,
    `-L${join(flintPrefix, "lib")}`,
    "-lflint", "-lopenblas", "-lmpfr", "-lgmp", "-lm", "-lpthread",
    "-o", rationalExecutable,
  ]);
  run(rationalExecutable, [], {
    env: sanitizerEnvironment({ strictStringChecks: true }),
  });
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/lifecycle-fuzz-v1",
    capability: "sanitizers",
    supported: true,
    compiler,
    dynamic: dynamicResult,
    result: output,
    rationalResult: `rounds=${rationalLifecycleRounds}`,
  }, null, 2) + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

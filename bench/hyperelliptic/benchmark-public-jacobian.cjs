#!/usr/bin/env node

"use strict";

const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..", "..");
const sagejs = join(root, "bin", "sagejs");
const source = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_kernels.py",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 600_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

const program = String.raw`
import json
import time
from sagejs.native import (
    is_compiled,
    kernel_uint64_buffer,
    kernel_uint64_zeros,
)
from sagejs.hyperelliptic_curves.jacobian_kernels import (
    packed_cantor_add_batch,
    packed_cantor_copy_batch,
)


def median(samples):
    samples.sort()
    return samples[len(samples) // 2]


def timed(function, repetitions=7):
    samples = []
    value = None
    for _index in range(repetitions):
        started = time.perf_counter_ns()
        value = function()
        samples.append(time.perf_counter_ns() - started)
    return median(samples), value


def timed_resident(function, warmups=10, samples=9, repeats=50):
    """Match the standalone core's warmup and repeated-call sample contract."""
    value = None
    for _index in range(warmups):
        value = function()
    timings = []
    for _sample in range(samples):
        started = time.perf_counter_ns()
        for _repeat in range(repeats):
            value = function()
        timings.append((time.perf_counter_ns() - started) // repeats)
    return median(timings), value


def deterministic_basis(curve, context, count):
    field = curve.base_ring()
    f, h = curve.hyperelliptic_polynomials()
    assert h.is_zero()
    points = []
    candidate = 0
    while len(points) < count:
        x_value = field(ZZ(candidate))
        discriminant = f(x_value)
        if discriminant.is_square():
            y_value = discriminant.sqrt()
            points.append(context.unpack((
                1,
                (-candidate) % context.prime,
                1, 0, 0,
                int(y_value.lift()),
                0, 0,
            )))
        candidate += 1
    return tuple(points)


R = PolynomialRing(GF(1009), "x")
x = R.gen()
rows = []
for genus, curve in [
    (2, HyperellipticCurve(x**5 + x + 1)),
    (3, HyperellipticCurve(x**7 + 2*x + 1)),
]:
    J = curve.jacobian()
    context = J.prepared_arithmetic(algorithm="native", max_batch_items=2000)
    degree_one = deterministic_basis(curve, context, 64)
    basis = tuple(
        degree_one[index] + degree_one[(13 * index + 5) % len(degree_one)]
        for index in range(len(degree_one))
    )
    left = tuple(basis[index % len(basis)] for index in range(1000))
    right = tuple(basis[(17 * index + 7) % len(basis)] for index in range(1000))
    retained_left = context.prepare_batch(left)
    retained_right = context.prepare_batch(right)
    scalars = tuple(2**255 + 65537 * index + 1 for index in range(1000))
    scalar_comparison_items = 8
    scalar_throughput_items = 64
    scalar_batch_items = 1000

    native_add = lambda: context.add_batch(left, right, algorithm="native")
    native_add_materialized = lambda: context.add_batch(
        left, right, algorithm="native", materialize=True
    )
    reference_add = lambda: context.add_batch(left, right, algorithm="reference")
    native_negate = lambda: context.negate_batch(right, algorithm="native")
    reference_negate = lambda: context.negate_batch(right, algorithm="reference")
    native_subtract = lambda: context.subtract_batch(
        left, right, algorithm="native"
    )
    reference_subtract = lambda: context.subtract_batch(
        left, right, algorithm="reference"
    )
    native_scalar = lambda: context.scalar_batch(
        left[:scalar_comparison_items],
        scalars[:scalar_comparison_items],
        algorithm="native",
    )
    native_scalar_materialized = lambda: context.scalar_batch(
        left[:scalar_comparison_items],
        scalars[:scalar_comparison_items],
        algorithm="native",
        materialize=True,
    )
    reference_scalar = lambda: context.scalar_batch(
        left[:scalar_comparison_items],
        scalars[:scalar_comparison_items],
        algorithm="reference",
    )
    native_scalar_throughput = lambda: context.scalar_batch(
        left[:scalar_throughput_items],
        scalars[:scalar_throughput_items],
        algorithm="native",
    )
    native_scalar_batch = lambda: context.scalar_batch(
        left,
        scalars,
        algorithm="native",
    )
    retained_scalar_batch = lambda: context.scalar_batch(
        retained_left,
        scalars,
        algorithm="native",
    )
    materialized_scalar_batch = lambda: context.scalar_batch(
        retained_left,
        scalars,
        algorithm="native",
        materialize=True,
    )
    search_count = 10000
    native_search = lambda: context.search_progression(
        basis[0], 1, 1, search_count, algorithm="native", diagnostics=True
    )
    reference_search = lambda: context.search_progression(
        basis[0], 1, 1, search_count, algorithm="reference", diagnostics=True
    )
    multi_search_bases = (1, 1, 1, 1)
    multi_search_counts = (search_count,) * len(multi_search_bases)
    native_multi_search = lambda: context.search_progressions(
        basis[0],
        multi_search_bases,
        1,
        multi_search_counts,
        algorithm="native",
        diagnostics=True,
    )
    repeated_native_search = lambda: tuple(
        context.search_progression(
            basis[0], 1, 1, search_count, algorithm="native"
        )
        for _index in multi_search_bases
    )

    native_add()
    native_negate()
    native_subtract()
    native_scalar()
    retained_scalar_batch()
    retained_input = context.add_batch(left, right, algorithm="native")
    assert retained_input.published_count == 0
    retained_add = lambda: context.add_batch(
        retained_input, retained_input, algorithm="native"
    )
    native_sum = lambda: context.sum(retained_input, algorithm="native")
    retained_left_rows = retained_left._rows_for(context)
    retained_right_rows = retained_right._rows_for(context)
    serialized_rows = tuple(
        tuple(retained_left_rows[8 * index:8 * index + 8])
        for index in range(len(retained_left))
    )
    prepare_public = lambda: context.prepare_batch(left)
    prepare_cached = lambda: context.prepare_batch(retained_left)
    authenticated_unpack = lambda: context.unpack_batch(
        serialized_rows, algorithm="native"
    )
    reference_unpack = lambda: context.unpack_batch(
        serialized_rows, algorithm="reference"
    )
    construction_u, construction_v = basis[0].uv()
    construct_public = lambda: tuple(
        type(basis[0])(J, construction_u, construction_v) for _index in range(1000)
    )
    construct_and_prepare_public = lambda: context.prepare_batch(construct_public())
    publish_frozen = lambda: context._publish_frozen_batch(
        retained_left_rows, len(retained_left)
    )
    raw_copy_input = retained_left._lease_for(context)
    raw_copy_right = retained_right._lease_for(context)
    raw_copy_model = kernel_uint64_buffer(
        packed_cantor_copy_batch, context.model_coefficients
    )
    raw_copy_output = kernel_uint64_zeros(
        packed_cantor_copy_batch, 8 * len(retained_left)
    )
    raw_copy_status = kernel_uint64_zeros(
        packed_cantor_copy_batch, len(retained_left)
    )
    raw_copy = lambda: packed_cantor_copy_batch(
        raw_copy_output,
        raw_copy_status,
        raw_copy_model,
        raw_copy_input,
        raw_copy_right,
        len(retained_left),
        genus,
        context.prime,
    )

    def full_copy_boundary():
        copy_input = kernel_uint64_buffer(
            packed_cantor_copy_batch, retained_left_rows
        )
        copy_output = kernel_uint64_zeros(
            packed_cantor_copy_batch, 8 * len(retained_left)
        )
        copy_status = kernel_uint64_zeros(
            packed_cantor_copy_batch, len(retained_left)
        )
        assert packed_cantor_copy_batch(
            copy_output,
            copy_status,
            raw_copy_model,
            copy_input,
            raw_copy_right,
            len(retained_left),
            genus,
            context.prime,
        )
        return context._publish_kernel_batch(copy_output, len(retained_left))

    def retained_copy_boundary():
        copy_output = kernel_uint64_zeros(
            packed_cantor_copy_batch, 8 * len(retained_left)
        )
        copy_status = kernel_uint64_zeros(
            packed_cantor_copy_batch, len(retained_left)
        )
        assert packed_cantor_copy_batch(
            copy_output,
            copy_status,
            raw_copy_model,
            retained_left._lease_for(context),
            retained_right._lease_for(context),
            len(retained_left),
            genus,
            context.prime,
        )
        return context._publish_kernel_batch(copy_output, len(retained_left))

    raw_add_left = retained_left._lease_for(context)
    raw_add_right = retained_right._lease_for(context)
    raw_add_output = kernel_uint64_zeros(
        packed_cantor_add_batch, 8 * len(retained_left)
    )
    raw_add_status = kernel_uint64_zeros(
        packed_cantor_add_batch, len(retained_left)
    )
    raw_add_model = kernel_uint64_buffer(
        packed_cantor_add_batch, context.model_coefficients
    )
    raw_add = lambda: packed_cantor_add_batch(
        raw_add_output,
        raw_add_status,
        raw_add_model,
        raw_add_left,
        raw_add_right,
        len(retained_left),
        genus,
        context.prime,
    )
    fixed_left_row = context.pack(degree_one[0])
    fixed_right_row = context.pack(degree_one[1])
    fixed_left_rows = fixed_left_row * len(retained_left)
    fixed_right_rows = fixed_right_row * len(retained_left)
    fixed_add_left = kernel_uint64_buffer(
        packed_cantor_add_batch, fixed_left_rows
    )
    fixed_add_right = kernel_uint64_buffer(
        packed_cantor_add_batch, fixed_right_rows
    )
    fixed_add_output = kernel_uint64_zeros(
        packed_cantor_add_batch, 8 * len(retained_left)
    )
    fixed_add_status = kernel_uint64_zeros(
        packed_cantor_add_batch, len(retained_left)
    )
    raw_fixed_add = lambda: packed_cantor_add_batch(
        fixed_add_output,
        fixed_add_status,
        raw_add_model,
        fixed_add_left,
        fixed_add_right,
        len(retained_left),
        genus,
        context.prime,
    )
    _diagnostic_add_result, add_diagnostics = context.add_batch(
        left, right, algorithm="native", diagnostics=True
    )
    _diagnostic_materialized_add_result, materialized_add_diagnostics = (
        context.add_batch(
            left,
            right,
            algorithm="native",
            diagnostics=True,
            materialize=True,
        )
    )
    native_add_ns, native_add_result = timed(native_add)
    retained_add_ns, retained_add_result = timed(retained_add)
    prepare_public_ns, prepared_result = timed(prepare_public)
    prepare_cached_ns, cached_result = timed(prepare_cached)
    authenticated_unpack_ns, authenticated_result = timed(authenticated_unpack)
    reference_unpack_ns, reference_unpack_result = timed(reference_unpack, 1)
    authenticated_prepare_ns, authenticated_cached_result = timed(
        lambda: context.prepare_batch(authenticated_result)
    )
    construct_public_ns, constructed_result = timed(construct_public)
    construct_and_prepare_ns, constructed_prepared_result = timed(
        construct_and_prepare_public, 3
    )
    fresh_prepare_samples = []
    fresh_prepared_result = None
    for _index in range(3):
        fresh_values = construct_public()
        fresh_started = time.perf_counter_ns()
        fresh_prepared_result = context.prepare_batch(fresh_values)
        fresh_prepare_samples.append(time.perf_counter_ns() - fresh_started)
    fresh_prepare_ns = median(fresh_prepare_samples)
    publish_frozen_ns, published_result = timed(publish_frozen)
    raw_copy_ns, raw_copy_result = timed(raw_copy)
    full_copy_boundary_ns, full_copy_result = timed(full_copy_boundary)
    retained_copy_boundary_ns, retained_copy_result = timed(retained_copy_boundary)
    raw_add_ns, raw_add_result = timed(raw_add)
    raw_fixed_add_ns, raw_fixed_add_result = timed_resident(raw_fixed_add)
    native_add_materialized_ns, native_add_materialized_result = timed(
        native_add_materialized
    )
    reference_add_ns, reference_add_result = timed(reference_add, 3)
    native_sum_ns, native_sum_result = timed(native_sum)
    reference_sum_ns, reference_sum_result = timed(
        lambda: context.sum(reference_add_result, algorithm="reference"), 1
    )
    native_negate_ns, native_negate_result = timed(native_negate)
    reference_negate_ns, reference_negate_result = timed(reference_negate, 3)
    native_subtract_ns, native_subtract_result = timed(native_subtract)
    reference_subtract_ns, reference_subtract_result = timed(reference_subtract, 3)
    native_scalar_ns, native_scalar_result = timed(native_scalar, 5)
    native_scalar_materialized_ns, native_scalar_materialized_result = timed(
        native_scalar_materialized, 3
    )
    reference_scalar_ns, reference_scalar_result = timed(reference_scalar, 1)
    native_scalar_throughput_ns, native_scalar_throughput_result = timed(
        native_scalar_throughput, 1
    )
    native_scalar_batch_ns, native_scalar_batch_result = timed(
        native_scalar_batch, 3
    )
    retained_scalar_batch_ns, retained_scalar_batch_result = timed(
        retained_scalar_batch, 3
    )
    materialized_scalar_batch_ns, materialized_scalar_batch_result = timed(
        materialized_scalar_batch, 3
    )
    native_search_ns, native_search_result = timed(native_search, 3)
    reference_search_ns, reference_search_result = timed(reference_search, 1)
    native_multi_search_ns, native_multi_search_result = timed(
        native_multi_search, 3
    )
    repeated_native_search_ns, repeated_native_search_result = timed(
        repeated_native_search, 3
    )
    assert native_add_result == reference_add_result
    assert retained_input.published_count == 0
    assert retained_add_result.published_count == 0
    assert prepared_result == retained_left
    assert prepared_result.published_count == 0
    assert cached_result is retained_left
    assert authenticated_result == retained_left
    assert authenticated_result.published_count == 0
    assert reference_unpack_result == retained_left
    assert authenticated_cached_result is authenticated_result
    assert all(value == basis[0] for value in constructed_result)
    assert len(constructed_prepared_result) == 1000
    assert constructed_prepared_result[0] == basis[0]
    assert len(fresh_prepared_result) == 1000
    assert fresh_prepared_result[0] == basis[0]
    assert published_result == retained_left
    assert published_result.published_count == 0
    assert raw_copy_result
    assert full_copy_result == retained_left
    assert full_copy_result.published_count == 0
    assert retained_copy_result == retained_left
    assert retained_copy_result.published_count == 0
    assert raw_add_result
    assert raw_fixed_add_result
    raw_fixed_digest = 0
    for index in range(8 * len(retained_left)):
        raw_fixed_digest = (
            raw_fixed_digest * 1315423911 + int(fixed_add_output[index])
        ) & ((1 << 64) - 1)
    assert native_sum_result == reference_sum_result
    assert retained_input.published_count == 0
    assert native_add_materialized_result == reference_add_result
    assert native_negate_result == reference_negate_result
    assert native_subtract_result == reference_subtract_result
    assert all(not value.is_materialized() for value in native_add_result)
    assert all(value.is_materialized() for value in native_add_materialized_result)
    assert native_scalar_result == reference_scalar_result
    assert native_scalar_materialized_result == reference_scalar_result
    assert native_scalar_throughput_result[:scalar_comparison_items] == reference_scalar_result
    assert native_scalar_batch_result == retained_scalar_batch_result
    assert retained_scalar_batch_result == materialized_scalar_batch_result
    assert native_scalar_batch_result.published_count == 0
    assert retained_scalar_batch_result.published_count == 0
    assert all(
        value.is_materialized() for value in materialized_scalar_batch_result
    )
    assert native_search_result[0] == reference_search_result[0]
    assert native_search_result[0] is None
    assert native_multi_search_result[0] is None
    assert native_multi_search_result[1].progressions_scanned == len(
        multi_search_bases
    )
    assert all(value is None for value in repeated_native_search_result)
    digest = context.fingerprint(context.sum(native_add_result, algorithm="native"))
    rows.append({
        "genus": genus,
        "prime": 1009,
        "batch_items": 1000,
        "scalar_comparison_items": scalar_comparison_items,
        "scalar_throughput_items": scalar_throughput_items,
        "scalar_batch_items": scalar_batch_items,
        "scalar_bits": 256,
        "native_add_median_ns": native_add_ns,
        "retained_add_median_ns": retained_add_ns,
        "retained_add_published_input": retained_input.published_count,
        "retained_add_published_output": retained_add_result.published_count,
        "prepare_public_batch_median_ns": prepare_public_ns,
        "prepare_fresh_unregistered_batch_median_ns": fresh_prepare_ns,
        "prepare_cached_batch_median_ns": prepare_cached_ns,
        "authenticated_unpack_batch_median_ns": authenticated_unpack_ns,
        "reference_unpack_batch_median_ns": reference_unpack_ns,
        "authenticated_unpack_cached_prepare_median_ns": authenticated_prepare_ns,
        "validated_public_construction_median_ns": construct_public_ns,
        "validated_public_construct_and_prepare_median_ns": construct_and_prepare_ns,
        "publish_frozen_batch_median_ns": publish_frozen_ns,
        "raw_copy_boundary_median_ns": raw_copy_ns,
        "full_copy_boundary_median_ns": full_copy_boundary_ns,
        "retained_copy_boundary_median_ns": retained_copy_boundary_ns,
        "raw_add_boundary_median_ns": raw_add_ns,
        "raw_fixed_add_boundary_median_ns": raw_fixed_add_ns,
        "raw_fixed_digest": str(raw_fixed_digest),
        "raw_fixed_timing": {
            "warmups": 10,
            "samples": 9,
            "calls_per_sample": 50,
        },
        "retained_to_raw_add_ratio": retained_add_ns / raw_add_ns,
        "native_sum_median_ns": native_sum_ns,
        "reference_sum_median_ns": reference_sum_ns,
        "sum_speedup": reference_sum_ns / native_sum_ns,
        "native_add_materialized_median_ns": native_add_materialized_ns,
        "native_add_stages": add_diagnostics.to_dict()["timings_ns"],
        "native_add_materialized_stages": (
            materialized_add_diagnostics.to_dict()["timings_ns"]
        ),
        "reference_add_median_ns": reference_add_ns,
        "add_speedup": reference_add_ns / native_add_ns,
        "native_negate_median_ns": native_negate_ns,
        "reference_negate_median_ns": reference_negate_ns,
        "negate_speedup": reference_negate_ns / native_negate_ns,
        "native_subtract_median_ns": native_subtract_ns,
        "reference_subtract_median_ns": reference_subtract_ns,
        "subtract_speedup": reference_subtract_ns / native_subtract_ns,
        "materialized_add_speedup": reference_add_ns / native_add_materialized_ns,
        "native_scalar_median_ns": native_scalar_ns,
        "native_scalar_materialized_median_ns": native_scalar_materialized_ns,
        "native_scalar_throughput_ns": native_scalar_throughput_ns,
        "native_scalar_batch_median_ns": native_scalar_batch_ns,
        "retained_scalar_batch_median_ns": retained_scalar_batch_ns,
        "materialized_scalar_batch_median_ns": materialized_scalar_batch_ns,
        "reference_scalar_median_ns": reference_scalar_ns,
        "scalar_speedup": reference_scalar_ns / native_scalar_ns,
        "materialized_scalar_speedup": (
            reference_scalar_ns / native_scalar_materialized_ns
        ),
        "search_count": search_count,
        "native_search_median_ns": native_search_ns,
        "reference_search_median_ns": reference_search_ns,
        "search_speedup": reference_search_ns / native_search_ns,
        "search_status": native_search_result[1].status,
        "search_group_operations": native_search_result[1].group_operations,
        "search_hash_collisions": native_search_result[1].hash_collisions,
        "multi_search_progressions": len(multi_search_bases),
        "native_multi_search_median_ns": native_multi_search_ns,
        "repeated_native_search_median_ns": repeated_native_search_ns,
        "multi_search_speedup": repeated_native_search_ns / native_multi_search_ns,
        "multi_search_group_operations": (
            native_multi_search_result[1].group_operations
        ),
        "multi_search_table_bytes": native_multi_search_result[1].table_bytes,
        "result_digest": digest,
    })

print(json.dumps({
    "schema": "sagejs.hyperelliptic.public-jacobian-benchmark.v1",
    "compiled": is_compiled(packed_cantor_add_batch),
    "workload": "resident prepared context; medians; 1000 public results",
    "rows": rows,
}, sort_keys=True))
`;

const standaloneHarness = String.raw`
#define _POSIX_C_SOURCE 200809L
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "kernel_core.h"

#define COUNT 1000
#define REPEATS 50
#define SAMPLES 9

static uint64_t now_ns(void) {
  struct timespec value;
  clock_gettime(CLOCK_MONOTONIC, &value);
  return (uint64_t)value.tv_sec * UINT64_C(1000000000) +
    (uint64_t)value.tv_nsec;
}

static int compare_u64(const void *left, const void *right) {
  const uint64_t a = *(const uint64_t *)left;
  const uint64_t b = *(const uint64_t *)right;
  return a < b ? -1 : a > b ? 1 : 0;
}

static int call_add(
    uint64_t *output,
    uint64_t *statuses,
    uint64_t *model,
    uint64_t *left,
    uint64_t *right,
    uint64_t genus) {
  sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
  int accepted = 0;
  const sagejs_source_u64_buffer output_buffer = {output, COUNT * 8};
  const sagejs_source_u64_buffer status_buffer = {statuses, COUNT};
  const sagejs_source_u64_buffer model_buffer = {model, 12};
  const sagejs_source_u64_buffer left_buffer = {left, COUNT * 8};
  const sagejs_source_u64_buffer right_buffer = {right, COUNT * 8};
  const int called = sagejs_kernel_packed_cantor_add_batch(
      &status,
      &accepted,
      output_buffer,
      status_buffer,
      model_buffer,
      left_buffer,
      right_buffer,
      COUNT,
      genus,
      1009);
  return called && accepted == 1 && status.code == SAGEJS_NATIVE_OK;
}

static uint64_t bench_case(uint64_t genus, uint64_t *digest) {
  static const uint64_t identity_point[8] = {1, 0, 1, 0, 0, 1, 0, 0};
  static const uint64_t genus2_right[8] = {1, 1008, 1, 0, 0, 149, 0, 0};
  static const uint64_t genus3_right[8] = {1, 1008, 1, 0, 0, 1007, 0, 0};
  uint64_t model[12] = {0};
  model[0] = 1;
  model[1] = genus == 2 ? 1 : 2;
  model[genus == 2 ? 5 : 7] = 1;
  const uint64_t *right_row = genus == 2 ? genus2_right : genus3_right;
  uint64_t *output = calloc(COUNT * 8, sizeof(uint64_t));
  uint64_t *statuses = calloc(COUNT, sizeof(uint64_t));
  uint64_t *left = calloc(COUNT * 8, sizeof(uint64_t));
  uint64_t *right = calloc(COUNT * 8, sizeof(uint64_t));
  if (output == NULL || statuses == NULL || left == NULL || right == NULL) {
    fprintf(stderr, "standalone Cantor allocation failed\n");
    exit(2);
  }
  for (size_t item = 0; item < COUNT; item += 1) {
    memcpy(left + item * 8, identity_point, 8 * sizeof(uint64_t));
    memcpy(right + item * 8, right_row, 8 * sizeof(uint64_t));
  }
  for (size_t warmup = 0; warmup < 10; warmup += 1) {
    if (!call_add(output, statuses, model, left, right, genus)) exit(3);
  }
  uint64_t samples[SAMPLES];
  for (size_t sample = 0; sample < SAMPLES; sample += 1) {
    const uint64_t started = now_ns();
    for (size_t repeat = 0; repeat < REPEATS; repeat += 1) {
      if (!call_add(output, statuses, model, left, right, genus)) exit(4);
    }
    samples[sample] = (now_ns() - started) / REPEATS;
  }
  qsort(samples, SAMPLES, sizeof(uint64_t), compare_u64);
  *digest = 0;
  for (size_t index = 0; index < COUNT * 8; index += 1) {
    *digest = *digest * UINT64_C(1315423911) + output[index];
  }
  free(right);
  free(left);
  free(statuses);
  free(output);
  return samples[SAMPLES / 2];
}

int main(void) {
  uint64_t digest2 = 0;
  uint64_t digest3 = 0;
  const uint64_t time2 = bench_case(2, &digest2);
  const uint64_t time3 = bench_case(3, &digest3);
  printf("{\"rows\":["
         "{\"genus\":2,\"standalone_core_median_ns\":%" PRIu64
         ",\"digest\":\"%" PRIu64 "\"},"
         "{\"genus\":3,\"standalone_core_median_ns\":%" PRIu64
         ",\"digest\":\"%" PRIu64 "\"}]}\n",
         time2, digest2, time3, digest3);
  return 0;
}
`;

const temporary = mkdtempSync(join(tmpdir(), "sagejs-jacobian-bench-"));
try {
  const cache = join(temporary, "cache");
  const witness = join(temporary, "benchmark.py");
  const harness = join(temporary, "standalone.c");
  const standalone = join(temporary, "standalone-cantor");
  writeFileSync(witness, program);
  writeFileSync(harness, standaloneHarness);
  run(process.execPath, [
    sagejs,
    "native",
    "compile",
    source,
    "--cache-root",
    cache,
  ]);
  const output = run(process.execPath, [sagejs, witness], {
    env: {
      SAGEJS_NATIVE_CACHE_DIR: cache,
    },
  });
  const cacheIndex = JSON.parse(readFileSync(join(cache, "index.json")));
  const cacheEntry = cacheIndex.sources[source];
  if (cacheEntry === undefined) {
    throw new Error("compiled Cantor cache is missing its source entry");
  }
  const artifact = join(cache, cacheEntry.cacheKey);
  const core = join(artifact, "kernel_core.c");
  const flintPrefix = process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix");
  run("cc", [
    "-O3",
    "-DSAGEJS_NATIVE_SOURCE_BOUNDS_CHECK=1",
    "-fPIC",
    "-fno-omit-frame-pointer",
    "-ffunction-sections",
    "-fdata-sections",
    "-std=c11",
    "-I",
    artifact,
    "-I",
    join(flintPrefix, "include"),
    core,
    harness,
    join(flintPrefix, "lib", "libflint.a"),
    join(flintPrefix, "lib", "libopenblas.a"),
    join(flintPrefix, "lib", "libmpfr.a"),
    join(flintPrefix, "lib", "libgmp.a"),
    "-lm",
    "-lpthread",
    "-ldl",
    "-Wl,--gc-sections",
    "-Wl,--exclude-libs,ALL",
    "-o",
    standalone,
  ]);
  const standaloneResult = JSON.parse(run(standalone, []));
  const benchmark = JSON.parse(output);
  benchmark.standalone = {
    compiler: "cc -O3 -fPIC with native bounds-check, frame, section, and link flags",
    contract: "same full compiled source-transparent core; 1000 repeated fixed degree-one pairs",
    timing: { warmups: 10, samples: 9, callsPerSample: 50 },
    rows: standaloneResult.rows,
  };
  for (const row of benchmark.rows) {
    const coreRow = standaloneResult.rows.find(
      (candidate) => candidate.genus === row.genus,
    );
    row.standalone_core_median_ns = coreRow.standalone_core_median_ns;
    if (row.raw_fixed_digest !== coreRow.digest) {
      throw new Error(
        `standalone/raw packed Cantor digest mismatch for genus ${row.genus}`,
      );
    }
    row.raw_fixed_boundary_to_standalone_ratio =
      row.raw_fixed_add_boundary_median_ns /
      coreRow.standalone_core_median_ns;
    row.full_copy_to_raw_copy_ratio =
      row.full_copy_boundary_median_ns / row.raw_copy_boundary_median_ns;
  }
  process.stdout.write(JSON.stringify(benchmark) + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

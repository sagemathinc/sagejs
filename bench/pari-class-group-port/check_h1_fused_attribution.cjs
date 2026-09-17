#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
//
// Diagnostic-only attribution for the already-qualified fused H1 artifact.
// The patcher adds timers and counters to compiler-generated C in scratch; it
// does not alter, replace, or reschedule any mathematical operation.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  createFloat64Buffer,
  createInt64Buffer,
  createIntegerBuffer,
  sha256File,
} = require("../../tools/native-kernel/thin-cache-loader.cjs");
const { generateArtifacts } = require("../../tools/native-kernel/c-backend.cjs");

const HERE = __dirname;
const ENTRY = "pari_fused_h1_matched_flag_zero_root";
const STAGES = Object.freeze([
  "addon-ingress", "preparation", "relation-collection", "log-hnf",
  "post-hnf-smith", "owner-bridge", "compact-getfu", "addon-egress",
]);
const BASE_CACHE = process.env.SAGEJS_FUSED_CACHE_ARTIFACT ||
  "/home/user/sagejs-worktrees/pari-class-group-e2e-integration-worktrees/" +
  "h1-matched-flag-zero-fused/bench/pari-class-group-port/.sagejs-native-kernels/" +
  "2a65d69bf9c475e1378673d9829ffed16ba84dea4e503a7668b4ba59b970e6f1";
const INPUT = process.env.SAGEJS_FUSED_INPUT ||
  "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/final-bba785ce0/" +
  "stages/resident-cubic-cpython/attempts/attempt-tEYA38/generated/" +
  "sagejs-resident-generated-class-11G1wH/inputs.json";
const OUTPUT = process.env.SAGEJS_FUSED_ATTRIBUTION_OUTPUT ||
  "/scratch/sagejs-runtime/h1-fused-attribution";
const PRIVATE_BUFFER = process.env.SAGEJS_FUSED_PRIVATE_BUFFER === "1";
const EXPECTED = Object.freeze({
  input: "22a997866388571cd3c12e1a3ea5c5cc3a7fe89217b253bb0e779007f6fe9b77",
  core: "7cd618f435f215f520a92798fc44594dda83c3143b5af34045296ca7d29d33ae",
  addon: "6f6198906aba59940a994ee8aeff6e79e43e956690c9235060c59cb7e52d7251",
  relation: "b0c647186a5fed5317c7135ccf16623a930631382ad7963e12af4ded2db7259a",
  compact: "80cec2acce5b95ec48beff67b800410eedb5e580e25029aa79d4d63dc40b1c2d",
  owner: "a0ae8b44555295c035a3603ce4c18dde8dd174bff80b79d34f61d86423a13b5e",
  rng: "9b90d634807d362bf99925a13ecb99eb54b867a16f9f3acb335fffcf085e401b",
});
const ROOT = ["0", "1", "3", "192", "1", "0", "0", "7", "73", "8", "0", "1"];
const GETFU = ["3", "10", "-186", "0", "1923", "0", "0", "1"];
const PARI_MEDIAN_NS = 15028583n;
const MATCHED_GAP_NS = 2411385304n;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function run(command, args, options = {}) {
  const answer = spawnSync(command, args, {
    encoding: "utf8", timeout: 600_000, maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(answer.status, 0, answer.stderr || String(answer.error));
  return answer.stdout;
}

function replaceOnce(source, from, to, label = from.slice(0, 80)) {
  assert.equal(source.split(from).length, 2, `non-unique patch marker: ${label}`);
  return source.replace(from, to);
}

function functionBody(source, name) {
  return functionBodyAt(source, `static int native_${name}(`, name);
}

function functionBodyAt(source, marker, name = marker) {
  const start = source.lastIndexOf(marker);
  assert(start >= 0, `missing generated function ${name}`);
  const open = source.indexOf("{", start);
  assert(open >= 0, `missing body for ${name}`);
  let depth = 1;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = open + 1; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") { blockComment = false; index += 1; }
      continue;
    }
    if (quote !== null) {
      if (char === "\\") { index += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return { start, open, close: index };
  }
  throw new Error(`unterminated generated function ${name}`);
}

function injectBeforeCall(source, caller, callee, stage) {
  const body = functionBody(source, caller);
  const needle = `native_${callee}(`;
  const call = source.indexOf(needle, body.open);
  assert(call > body.open && call < body.close, `${caller} does not call ${callee}`);
  assert.equal(source.indexOf(needle, call + needle.length) < body.close, false,
    `${caller} calls ${callee} more than once`);
  const line = source.lastIndexOf("\n", call) + 1;
  const indentation = source.slice(line, call).match(/^\s*/)[0];
  return source.slice(0, line) + `${indentation}sagejs_attr_switch(${stage});\n` +
    source.slice(line);
}

function injectBeforeFunctionReturn(source, marker, code) {
  const body = functionBodyAt(source, marker);
  const at = source.lastIndexOf("    return 1;", body.close);
  assert(at > body.open && at < body.close, `missing success return in ${marker}`);
  return source.slice(0, at) + code + source.slice(at);
}

const CORE_SUPPORT = String.raw`
/* Diagnostic-only fused-H1 attribution support. */
#include <time.h>
#define SAGEJS_ATTR_STAGES 8
#define SAGEJS_ATTR_TRACKED_BUFFERS 5
typedef struct {
    uint64_t started, segment_started, inclusive, totals[SAGEJS_ATTR_STAGES];
    uint64_t entries[SAGEJS_ATTR_STAGES], allocs[SAGEJS_ATTR_STAGES];
    uint64_t reallocs[SAGEJS_ATTR_STAGES], frees[SAGEJS_ATTR_STAGES];
    uint64_t requested[SAGEJS_ATTR_STAGES], growth[SAGEJS_ATTR_STAGES];
    uint64_t potential_copy[SAGEJS_ATTR_STAGES];
    uint64_t integer_buffers, integer_slots, logical_words, capacity_words;
    uint64_t int64_words, float64_words, outstanding_bytes, peak_live_bytes;
    uint64_t visits, current_stage;
    const int32_t *tracked_sizes[SAGEJS_ATTR_TRACKED_BUFFERS];
    uint64_t tracked_reads[SAGEJS_ATTR_TRACKED_BUFFERS];
    uint64_t tracked_writes[SAGEJS_ATTR_TRACKED_BUFFERS];
    uint64_t tracked_read_words[SAGEJS_ATTR_TRACKED_BUFFERS];
    uint64_t tracked_write_words[SAGEJS_ATTR_TRACKED_BUFFERS];
    uint64_t tracked_cleared_words[SAGEJS_ATTR_TRACKED_BUFFERS];
    int active, ready, failed, clock_failed;
} sagejs_fused_attr_record;
static sagejs_fused_attr_record sagejs_fused_attr;
static int sagejs_attr_now(uint64_t *result) {
    struct timespec value;
    if (clock_gettime(CLOCK_MONOTONIC_RAW, &value) != 0) return 0;
    *result = (uint64_t)value.tv_sec * UINT64_C(1000000000) + (uint64_t)value.tv_nsec;
    return 1;
}
static void sagejs_attr_close(uint64_t now) {
    if (now < sagejs_fused_attr.segment_started) { sagejs_fused_attr.clock_failed = 1; return; }
    sagejs_fused_attr.totals[sagejs_fused_attr.current_stage] +=
        now - sagejs_fused_attr.segment_started;
}
static void sagejs_attr_begin(void) {
    uint64_t now = 0;
    memset(&sagejs_fused_attr, 0, sizeof(sagejs_fused_attr));
    sagejs_fused_attr.active = 1;
    sagejs_fused_attr.entries[0] = 1;
    sagejs_fused_attr.visits = 1;
    if (!sagejs_attr_now(&now)) sagejs_fused_attr.clock_failed = 1;
    sagejs_fused_attr.started = sagejs_fused_attr.segment_started = now;
}
static void sagejs_attr_switch(uint64_t stage) {
    uint64_t now = 0;
    if (!sagejs_fused_attr.active) return;
    if (stage >= SAGEJS_ATTR_STAGES || !sagejs_attr_now(&now)) {
        sagejs_fused_attr.clock_failed = 1; return;
    }
    sagejs_attr_close(now);
    sagejs_fused_attr.current_stage = stage;
    sagejs_fused_attr.segment_started = now;
    sagejs_fused_attr.entries[stage] += 1;
    sagejs_fused_attr.visits += 1;
}
static void sagejs_attr_finish(int failed) {
    uint64_t now = 0;
    if (!sagejs_fused_attr.active) return;
    if (!sagejs_attr_now(&now)) sagejs_fused_attr.clock_failed = 1;
    else {
        sagejs_attr_close(now);
        if (now < sagejs_fused_attr.started) sagejs_fused_attr.clock_failed = 1;
        else sagejs_fused_attr.inclusive = now - sagejs_fused_attr.started;
    }
    sagejs_fused_attr.failed = failed;
    sagejs_fused_attr.active = 0;
    sagejs_fused_attr.ready = 1;
}
static void sagejs_attr_gmp_alloc(size_t requested) {
    uint64_t stage;
    if (!sagejs_fused_attr.active) return;
    stage = sagejs_fused_attr.current_stage;
    sagejs_fused_attr.allocs[stage] += 1;
    sagejs_fused_attr.requested[stage] += (uint64_t)requested;
    sagejs_fused_attr.outstanding_bytes += (uint64_t)requested;
    if (sagejs_fused_attr.outstanding_bytes > sagejs_fused_attr.peak_live_bytes)
        sagejs_fused_attr.peak_live_bytes = sagejs_fused_attr.outstanding_bytes;
}
static void sagejs_attr_gmp_realloc(size_t old_size, size_t requested) {
    uint64_t stage;
    if (!sagejs_fused_attr.active) return;
    stage = sagejs_fused_attr.current_stage;
    sagejs_fused_attr.reallocs[stage] += 1;
    sagejs_fused_attr.requested[stage] += (uint64_t)requested;
    sagejs_fused_attr.potential_copy[stage] +=
        (uint64_t)(old_size < requested ? old_size : requested);
    if (requested > old_size) {
        sagejs_fused_attr.growth[stage] += (uint64_t)(requested - old_size);
        sagejs_fused_attr.outstanding_bytes += (uint64_t)(requested - old_size);
    } else if (old_size - requested <= sagejs_fused_attr.outstanding_bytes) {
        sagejs_fused_attr.outstanding_bytes -= (uint64_t)(old_size - requested);
    }
    if (sagejs_fused_attr.outstanding_bytes > sagejs_fused_attr.peak_live_bytes)
        sagejs_fused_attr.peak_live_bytes = sagejs_fused_attr.outstanding_bytes;
}
static void sagejs_attr_gmp_free(size_t old_size) {
    uint64_t stage;
    if (!sagejs_fused_attr.active) return;
    stage = sagejs_fused_attr.current_stage;
    sagejs_fused_attr.frees[stage] += 1;
    if ((uint64_t)old_size <= sagejs_fused_attr.outstanding_bytes)
        sagejs_fused_attr.outstanding_bytes -= (uint64_t)old_size;
}
static int sagejs_attr_buffer_id(const int32_t *sizes) {
    int index;
    if (!sagejs_fused_attr.active || sagejs_fused_attr.current_stage != 1) return -1;
    for (index = 0; index < SAGEJS_ATTR_TRACKED_BUFFERS; index += 1)
        if (sizes == sagejs_fused_attr.tracked_sizes[index]) return index;
    return -1;
}
static void sagejs_attr_buffer_read(const int32_t *sizes, size_t words) {
    int index = sagejs_attr_buffer_id(sizes);
    if (index < 0) return;
    sagejs_fused_attr.tracked_reads[index] += 1;
    sagejs_fused_attr.tracked_read_words[index] += (uint64_t)words;
}
static void sagejs_attr_buffer_write(
    const int32_t *sizes, size_t words, size_t cleared) {
    int index = sagejs_attr_buffer_id(sizes);
    if (index < 0) return;
    sagejs_fused_attr.tracked_writes[index] += 1;
    sagejs_fused_attr.tracked_write_words[index] += (uint64_t)words;
    sagejs_fused_attr.tracked_cleared_words[index] += (uint64_t)cleared;
}
`;

const SNAPSHOT_ADAPTER = String.raw`
static napi_value sagejs_fused_attr_snapshot_node(
    napi_env env, napi_callback_info info)
{
    napi_value args[1], answer = NULL;
    size_t argc = 1, position = 0, stage;
    sagejs_int64_buffer output;
    uint64_t sum = 0;
    if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok ||
        argc != 1 || !sagejs_native_get_int64_buffer(
            env, args[0], &output, "attribution output must be BigInt64Array") ||
        output.length < 106)
        return NULL;
#define SAGEJS_ATTR_WRITE(value) output.data[position++] = (int64_t)(value)
    for (stage = 0; stage < SAGEJS_ATTR_STAGES; stage += 1)
        sum += sagejs_fused_attr.totals[stage];
    SAGEJS_ATTR_WRITE(1); SAGEJS_ATTR_WRITE(SAGEJS_ATTR_STAGES);
    SAGEJS_ATTR_WRITE(sagejs_fused_attr.ready); SAGEJS_ATTR_WRITE(sagejs_fused_attr.failed);
    SAGEJS_ATTR_WRITE(sagejs_fused_attr.clock_failed); SAGEJS_ATTR_WRITE(sagejs_fused_attr.inclusive);
    SAGEJS_ATTR_WRITE(sum); SAGEJS_ATTR_WRITE(sagejs_fused_attr.visits);
    for (stage = 0; stage < SAGEJS_ATTR_STAGES; stage += 1) {
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.totals[stage]);
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.entries[stage]);
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.allocs[stage]);
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.reallocs[stage]);
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.frees[stage]);
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.requested[stage]);
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.growth[stage]);
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.potential_copy[stage]);
    }
    SAGEJS_ATTR_WRITE(sagejs_fused_attr.integer_buffers);
    SAGEJS_ATTR_WRITE(sagejs_fused_attr.integer_slots);
    SAGEJS_ATTR_WRITE(sagejs_fused_attr.logical_words);
    SAGEJS_ATTR_WRITE(sagejs_fused_attr.capacity_words);
    SAGEJS_ATTR_WRITE(sagejs_fused_attr.int64_words);
    SAGEJS_ATTR_WRITE(sagejs_fused_attr.float64_words);
    SAGEJS_ATTR_WRITE(0); /* packed buffers are borrowed, never copied */
    SAGEJS_ATTR_WRITE(sagejs_fused_attr.peak_live_bytes);
    SAGEJS_ATTR_WRITE(sagejs_fused_attr.outstanding_bytes);
    for (stage = 0; stage < SAGEJS_ATTR_TRACKED_BUFFERS; stage += 1) {
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.tracked_reads[stage]);
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.tracked_writes[stage]);
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.tracked_read_words[stage]);
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.tracked_write_words[stage]);
        SAGEJS_ATTR_WRITE(sagejs_fused_attr.tracked_cleared_words[stage]);
    }
#undef SAGEJS_ATTR_WRITE
    if (napi_get_boolean(env, true, &answer) != napi_ok) return NULL;
    return answer;
}
`;

function patchCore(original) {
  const includeMarker = "#include <stdlib.h>\n#include <string.h>\n";
  const includeAt = original.indexOf(includeMarker);
  assert(includeAt >= 0 && includeAt < 500, "missing top-level core include marker");
  let source = original.slice(0, includeAt) + includeMarker + CORE_SUPPORT +
    original.slice(includeAt + includeMarker.length);
  source = injectBeforeCall(source, "pari_resident_generated_class_attempt",
    "pari_analytic_class_group_attempt", 2);
  source = injectBeforeCall(source, "pari_connected_relation_hnf",
    "pari_append_relation_log_embeddings", 3);
  source = injectBeforeCall(source, "pari_prepared_class_group_attempt",
    "pari_post_hnf_acceptance", 4);
  source = injectBeforeCall(source, "pari_unified_live_h1_root",
    "pari_live_h1_owner_bridge", 5);
  source = injectBeforeCall(source, "pari_fused_h1_matched_flag_zero_root",
    "pari_h1_compact_flag_zero_root", 6);
  source = replaceOnce(source,
    "static void *sagejs_native_gmp_malloc(size_t requested)\n{\n    void *result;",
    "static void *sagejs_native_gmp_malloc(size_t requested)\n{\n    void *result;\n    sagejs_attr_gmp_alloc(requested);",
    "GMP malloc counter");
  source = replaceOnce(source,
    "static void *sagejs_native_gmp_realloc(\n    void *pointer, size_t old_size, size_t requested)\n{\n    sagejs_native_gmp_checkpoint *checkpoint =\n        sagejs_native_gmp_owner(pointer);\n    sagejs_native_gmp_arena_header *header;\n    size_t payload;\n    size_t raw;\n    size_t span;\n    size_t offset;\n    void *result;\n    (void) old_size;\n    if (checkpoint == NULL)",
    "static void *sagejs_native_gmp_realloc(\n    void *pointer, size_t old_size, size_t requested)\n{\n    sagejs_native_gmp_checkpoint *checkpoint =\n        sagejs_native_gmp_owner(pointer);\n    sagejs_native_gmp_arena_header *header;\n    size_t payload;\n    size_t raw;\n    size_t span;\n    size_t offset;\n    void *result;\n    sagejs_attr_gmp_realloc(old_size, requested);\n    if (checkpoint == NULL)",
    "GMP realloc counter");
  source = replaceOnce(source,
    "static void sagejs_native_gmp_free(void *pointer, size_t old_size)\n{\n    sagejs_native_gmp_checkpoint *checkpoint =\n        sagejs_native_gmp_owner(pointer);\n    (void) old_size;\n    if (checkpoint == NULL)",
    "static void sagejs_native_gmp_free(void *pointer, size_t old_size)\n{\n    sagejs_native_gmp_checkpoint *checkpoint =\n        sagejs_native_gmp_owner(pointer);\n    sagejs_attr_gmp_free(old_size);\n    if (checkpoint == NULL)",
    "GMP free counter");
  source = replaceOnce(source,
    "    if (count == 0)\n    {\n        mpz_set_ui(result, 0);",
    "    sagejs_attr_buffer_read(buffer->sizes, count);\n    if (count == 0)\n    {\n        mpz_set_ui(result, 0);",
    "tracked mpz read");
  source = replaceOnce(source,
    "    memset(slot, 0, buffer->word_capacity * sizeof(*slot));",
    "    sagejs_attr_buffer_write(buffer->sizes, count, buffer->word_capacity);\n" +
      "    memset(slot, 0, buffer->word_capacity * sizeof(*slot));",
    "tracked mpz write");
  source = replaceOnce(source,
    "    const uint64_t magnitude =\n        buffer->limbs[position * buffer->word_capacity];",
    "    sagejs_attr_buffer_read(buffer->sizes, 1);\n    const uint64_t magnitude =\n" +
      "        buffer->limbs[position * buffer->word_capacity];",
    "tracked int64 read");
  source = replaceOnce(source,
    "    slot[0] = magnitude;\n    buffer->sizes[position] = magnitude == 0",
    "    sagejs_attr_buffer_write(buffer->sizes, 1, 0);\n    slot[0] = magnitude;\n" +
      "    buffer->sizes[position] = magnitude == 0",
    "tracked int64 write");
  if (process.env.SAGEJS_FUSED_SKIP_SPARE_CLEAR === "1") {
    source = replaceOnce(source,
      "    memset(slot, 0, buffer->word_capacity * sizeof(*slot));",
      "    /* authenticated sizes make spare limbs unobservable */",
      "skip unobservable spare-limb clear");
  }
  return source;
}

function patchAdapter(original) {
  let source = original;
  source = injectBeforeFunctionReturn(source, "static int sagejs_native_get_int64_buffer(",
    "    if (sagejs_fused_attr.active) sagejs_fused_attr.int64_words += result->length;\n");
  source = injectBeforeFunctionReturn(source, "static int sagejs_native_get_integer_buffer(",
    `    if (sagejs_fused_attr.active) {\n        sagejs_fused_attr.integer_buffers += 1;\n        sagejs_fused_attr.integer_slots += result->length;\n        sagejs_fused_attr.capacity_words += result->length * result->word_capacity;\n        for (size_t index = 0; index < result->length; index++) {\n            int64_t size = result->sizes[index];\n            sagejs_fused_attr.logical_words += (uint64_t)(size < 0 ? -size : size);\n        }\n    }\n`);
  source = injectBeforeFunctionReturn(source, "static int sagejs_native_get_float64_buffer(",
    "    if (sagejs_fused_attr.active) sagejs_fused_attr.float64_words += result->length;\n");
  const wrapperMarker = "static napi_value compiled_pari_fused_h1_matched_flag_zero_root_gmp(";
  const wrapperAt = source.indexOf(wrapperMarker);
  assert(wrapperAt >= 0, "missing fused wrapper for snapshot insertion");
  source = source.slice(0, wrapperAt) + SNAPSHOT_ADAPTER + "\n" + source.slice(wrapperAt);
  const body = functionBodyAt(source,
    "static napi_value compiled_pari_fused_h1_matched_flag_zero_root_gmp(",
    "compiled_pari_fused_h1_matched_flag_zero_root_gmp");
  const open = body.open;
  const info = source.indexOf("    if (!sagejs_native_check_napi(env,\n        napi_get_cb_info", open);
  assert(info > open && info < body.close, "missing fused wrapper ingress");
  source = source.slice(0, info) + "    sagejs_attr_begin();\n" + source.slice(info);
  const callMarker = "    if (!native_pari_fused_h1_matched_flag_zero_root(";
  const call = source.indexOf(callMarker, info);
  assert(call > info, "missing fused wrapper native call");
  const tracked = ["hnf_cup_arena", "relation_records", "prep_kummer_catalog_tau",
    "hnf_work_c", "hnf_work_b"];
  const registration = tracked.map((name, index) =>
    `    sagejs_fused_attr.tracked_sizes[${index}] = sagejs_wrapper_${name}.sizes;`).join("\n");
  source = source.slice(0, call) + `${registration}\n    sagejs_attr_switch(1);\n` + source.slice(call);
  const success = source.indexOf("\n\n\n\n    result = create_bigint", call);
  assert(success > call, "missing fused wrapper success tail");
  source = source.slice(0, success) + "\n    sagejs_attr_switch(7);" + source.slice(success);
  const returnResult = source.indexOf("    return result;", success);
  assert(returnResult > success, "missing fused wrapper return");
  source = source.slice(0, returnResult) + "    sagejs_attr_finish(0);\n" + source.slice(returnResult);
  const fail = source.indexOf("fail:", returnResult);
  assert(fail > returnResult, "missing fused wrapper failure tail");
  source = source.slice(0, fail + 5) + "\n    sagejs_attr_finish(1);" + source.slice(fail + 5);
  source = replaceOnce(source,
    "    napi_property_descriptor properties[] = {\n",
    "    napi_property_descriptor properties[] = {\n" +
      "        {\"__sagejsFusedAttributionSnapshot\", NULL, sagejs_fused_attr_snapshot_node, NULL, NULL, NULL, napi_default, NULL},\n",
    "snapshot export");
  return source;
}

function prepareDiagnostic() {
  assert.equal(sha256File(path.join(BASE_CACHE, "kernel_core.c")), EXPECTED.core);
  assert.equal(sha256File(path.join(BASE_CACHE, "build/Release/sagejs_native_kernel.node")),
    EXPECTED.addon);
  fs.mkdirSync(OUTPUT, { recursive: true });
  let coreInput = fs.readFileSync(path.join(BASE_CACHE, "kernel_core.c"), "utf8");
  let adapterInput = fs.readFileSync(path.join(BASE_CACHE, "kernel.c"), "utf8");
  let headerInput = fs.readFileSync(path.join(BASE_CACHE, "kernel_core.h"), "utf8");
  let hostIsolation = null;
  if (PRIVATE_BUFFER) {
    assert.notEqual(process.env.SAGEJS_FUSED_SKIP_SPARE_CLEAR, "1",
      "private authority run must not use the diagnostic no-clear patch");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(BASE_CACHE, "manifest.json"), "utf8"),
    );
    const generated = generateArtifacts(manifest.ir, {
      moduleIdentity: manifest.moduleIdentity,
      privateIntegerBuffers: {
        root: ENTRY,
        buffers: ["prep_kummer_catalog_tau"],
      },
    });
    assert.deepEqual(generated.hostIsolation.privateIntegerBuffers, {
      authority: "private-integer-buffer-v1",
      root: ENTRY,
      buffers: ["prep_kummer_catalog_tau"],
      canonicalizeAt: ["public-output", "raw-hash", "resume", "ffi", "fallback"],
      failurePublication: "canonicalize-before-publish",
    });
    coreInput = generated.coreSource;
    adapterInput = generated.adapterSource;
    headerInput = generated.coreHeader;
    hostIsolation = generated.hostIsolation;
  }
  const core = patchCore(coreInput);
  const adapter = patchAdapter(adapterInput);
  fs.writeFileSync(path.join(OUTPUT, "kernel_core.c"), core);
  fs.writeFileSync(path.join(OUTPUT, "kernel.c"), adapter);
  fs.writeFileSync(path.join(OUTPUT, "kernel_core.h"), headerInput);
  fs.copyFileSync(path.join(BASE_CACHE, "binding.gyp"), path.join(OUTPUT, "binding.gyp"));
  return {
    ...staticPatchAudit(coreInput, adapterInput),
    privateBufferAuthority: hostIsolation?.privateIntegerBuffers || null,
    generatedCoreSha256: sha256(coreInput),
    generatedAdapterSha256: sha256(adapterInput),
  };
}

function buildDiagnostic() {
  const nodeGyp = "/opt/cocalc/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js";
  const started = process.hrtime.bigint();
  run(process.execPath, [nodeGyp, "rebuild", "--jobs", "1"], { cwd: OUTPUT });
  const buildNs = process.hrtime.bigint() - started;
  const addon = path.join(OUTPUT, "build/Release/sagejs_native_kernel.node");
  return {
    addon, buildNs: buildNs.toString(),
    coreSha256: sha256File(path.join(OUTPUT, "kernel_core.c")),
    adapterSha256: sha256File(path.join(OUTPUT, "kernel.c")),
    addonSha256: sha256File(addon),
    coreBytes: fs.statSync(path.join(OUTPUT, "kernel_core.c")).size,
    adapterBytes: fs.statSync(path.join(OUTPUT, "kernel.c")).size,
    addonBytes: fs.statSync(addon).size,
  };
}

function staticPatchAudit(
  coreInput = fs.readFileSync(path.join(BASE_CACHE, "kernel_core.c"), "utf8"),
  adapterInput = fs.readFileSync(path.join(BASE_CACHE, "kernel.c"), "utf8"),
) {
  assert.equal(sha256File(path.join(BASE_CACHE, "kernel_core.c")), EXPECTED.core);
  assert.equal(sha256File(path.join(BASE_CACHE, "build/Release/sagejs_native_kernel.node")),
    EXPECTED.addon);
  const core = patchCore(coreInput);
  const adapter = patchAdapter(adapterInput);
  return { coreBytes: Buffer.byteLength(core), adapterBytes: Buffer.byteLength(adapter),
    coreSha256: sha256(core), adapterSha256: sha256(adapter), stages: STAGES };
}

function checkerInternals() {
  const filename = path.join(HERE, "check_h1_matched_flag_zero_fused.cjs");
  let source = fs.readFileSync(filename, "utf8");
  const marker = "main().catch((error) => {";
  if (process.env.SAGEJS_FUSED_AUTHENTICATED_SHAPE === "1") {
    const allocation =
      "else answer[name] = fn.createIntegerBuffer(data.length, 4096, data.map(BigInt));";
    const replacement =
      "else answer[name] = fn.createIntegerBuffer(data.length, " +
      "name === 'prep_kummer_catalog_tau' ? 1 : 4096, data.map(BigInt));";
    assert.equal(source.split(allocation).length, 2, "native input allocation changed");
    source = source.replace(allocation, replacement);
  }
  const cut = source.indexOf(marker);
  assert(cut >= 0, "fused checker entry changed");
  source = source.slice(0, cut) + String.raw`
module.exports = { compactEvidence, digestCanonical, nativeInputs, plainInputs,
  relationEvidence, signature, strings };
`;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(source, filename);
  return loaded.exports;
}

function decodeSnapshot(raw) {
  const words = Array.from(raw, BigInt);
  assert.equal(words[0], 1n);
  assert.equal(words[1], BigInt(STAGES.length));
  assert.equal(words[2], 1n);
  assert.equal(words[3], 0n);
  assert.equal(words[4], 0n);
  assert.equal(words[7], BigInt(STAGES.length));
  let position = 8;
  const stages = STAGES.map((name) => {
    const fields = words.slice(position, position + 8);
    position += 8;
    return {
      name, nanoseconds: fields[0].toString(), entries: fields[1].toString(),
      gmpAllocations: fields[2].toString(), gmpReallocations: fields[3].toString(),
      gmpFrees: fields[4].toString(), gmpRequestedBytes: fields[5].toString(),
      gmpGrowthBytes: fields[6].toString(),
      gmpPotentialCopyBytes: fields[7].toString(),
    };
  });
  const storage = {
    integerBuffers: words[position++].toString(),
    integerSlots: words[position++].toString(),
    logicalLimbWords: words[position++].toString(),
    capacityLimbWords: words[position++].toString(),
    int64Words: words[position++].toString(),
    float64Words: words[position++].toString(),
    packedBufferCopies: words[position++].toString(),
    peakLiveGmpBytes: words[position++].toString(),
    terminalLiveGmpBytes: words[position++].toString(),
  };
  const names = ["hnf_cup_arena", "relation_records", "prep_kummer_catalog_tau",
    "hnf_work_c", "hnf_work_b"];
  const trackedBuffers = names.map((name) => ({
    name,
    reads: words[position++].toString(), writes: words[position++].toString(),
    readWords: words[position++].toString(), writeWords: words[position++].toString(),
    clearedWords: words[position++].toString(),
  }));
  assert.equal(position, 106);
  const inclusive = words[5];
  const sum = words[6];
  assert.equal(stages.reduce((value, stage) => value + BigInt(stage.nanoseconds), 0n), sum);
  assert.equal(sum, inclusive);
  return {
    schema: Number(words[0]), inclusiveNanoseconds: inclusive.toString(),
    partitionSumNanoseconds: sum.toString(), closure: Number(sum) / Number(inclusive),
    stages, storage, trackedBuffers,
  };
}

function runProfile(addonPath) {
  assert.equal(sha256File(INPUT), EXPECTED.input);
  const helpers = checkerInternals();
  const source = fs.readFileSync(path.join(HERE, "h1_matched_flag_zero_fused.py"), "utf8");
  const names = helpers.signature(source, ENTRY);
  const plain = helpers.plainInputs(INPUT, names);
  const constructors = { createFloat64Buffer, createInt64Buffer, createIntegerBuffer };
  const input = helpers.nativeInputs(constructors, names, plain);
  const addon = require(addonPath);
  const invoke = addon[`${ENTRY}$gmp`];
  const snapshot = addon.__sagejsFusedAttributionSnapshot;
  assert.equal(typeof invoke, "function");
  assert.equal(typeof snapshot, "function");
  const started = process.hrtime.bigint();
  const status = invoke(...names.map(([name]) => input[name]));
  const externalNs = process.hrtime.bigint() - started;
  assert.equal(status, 0n);
  const raw = new BigInt64Array(106);
  assert.equal(snapshot(raw), true);
  const timing = decodeSnapshot(raw);
  const externalClosure = Number(BigInt(timing.inclusiveNanoseconds)) / Number(externalNs);
  assert(timing.closure >= 0.99);
  assert(externalClosure >= 0.99 && externalClosure <= 1.001,
    `internal/external closure ${externalClosure}`);
  const relation = helpers.relationEvidence(input);
  const compact = helpers.compactEvidence(input, relation.sha256);
  assert.equal(relation.sha256, EXPECTED.relation);
  assert.equal(compact.sha256, EXPECTED.compact);
  assert.deepEqual(compact.root, ROOT);
  assert.deepEqual(compact.state, GETFU);
  const owner = helpers.digestCanonical({ relation: relation.payload, compact: compact.payload });
  const rng = helpers.digestCanonical(relation.payload.terminal_rng_state);
  assert.equal(owner, EXPECTED.owner);
  assert.equal(rng, EXPECTED.rng);
  assert.equal(compact.payload.assumptions.public_complete, false);
  return {
    externalNanoseconds: externalNs.toString(), externalClosure,
    timing, relationSha256: relation.sha256, compactSha256: compact.sha256,
    ownerEvidenceSha256: owner, terminalRngSha256: rng,
    counters: relation.payload.counters, root: compact.root, getfu: compact.state,
    publicComplete: false,
  };
}

function attribution(profile) {
  const ranked = [...profile.timing.stages].sort((left, right) =>
    BigInt(left.nanoseconds) > BigInt(right.nanoseconds) ? -1 :
      BigInt(left.nanoseconds) < BigInt(right.nanoseconds) ? 1 : 0);
  const inclusive = BigInt(profile.timing.inclusiveNanoseconds);
  return ranked.map((stage, rank) => ({
    rank: rank + 1,
    stage: stage.name,
    nanoseconds: stage.nanoseconds,
    sageShare: Number(BigInt(stage.nanoseconds)) / Number(inclusive),
    proportionalMatchedGapNanoseconds:
      ((MATCHED_GAP_NS * BigInt(stage.nanoseconds)) / inclusive).toString(),
    conservativeExcessLowerBoundNanoseconds:
      (BigInt(stage.nanoseconds) > PARI_MEDIAN_NS
        ? BigInt(stage.nanoseconds) - PARI_MEDIAN_NS : 0n).toString(),
  }));
}

function main() {
  assert.equal(process.platform, "linux");
  if (process.argv[2] === "--static") {
    process.stdout.write(`${JSON.stringify(staticPatchAudit())}\n`);
    return;
  }
  if (process.argv[2] === "--prepare") {
    process.stdout.write(`${JSON.stringify(prepareDiagnostic())}\n`);
    return;
  }
  if (process.argv[2] === "--build") {
    process.stdout.write(`${JSON.stringify(buildDiagnostic())}\n`);
    return;
  }
  if (process.argv[2] === "--profile") {
    const addon = path.join(OUTPUT, "build/Release/sagejs_native_kernel.node");
    const profile = runProfile(addon);
    process.stdout.write(`${JSON.stringify({ profile, attribution: attribution(profile) })}\n`);
    return;
  }
  const script = __filename;
  const prepare = JSON.parse(run(process.execPath, [script, "--prepare"]));
  const build = JSON.parse(run(process.execPath, [script, "--build"]));
  const profiled = JSON.parse(run(process.execPath, [script, "--profile"]));
  const profile = profiled.profile;
  const result = {
    schema: "sagejs.pari-class-group/h1-fused-attribution-v1",
    diagnosticOnly: true, optimized: PRIVATE_BUFFER,
    boundary: "prepared H1 through one compact p192 PRECI publication",
    stages: STAGES,
    baseArtifact: {
      cachePath: BASE_CACHE, coreSha256: EXPECTED.core, addonSha256: EXPECTED.addon,
    },
    diagnosticArtifact: { ...prepare, ...build },
    privateBufferAuthority: prepare.privateBufferAuthority,
    profile,
    attribution: profiled.attribution,
    reference: { pariMedianNanoseconds: PARI_MEDIAN_NS.toString(),
      matchedGapNanoseconds: MATCHED_GAP_NS.toString() },
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      release: os.release() },
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try { main(); }
catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }

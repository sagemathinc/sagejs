"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { generateHostCore } = require("../c-backend.cjs");
const { compileKernel } = require("../compiler.cjs");
const {
  checkedRegionVirtualUInt64Emission,
  installCheckedRegionDeclarations,
  isCheckedRegionBufferAccess,
  prepareCheckedRegions,
} = require("../checked-regions.cjs");
const { lowerSource } = require("../ir.cjs");

const witnessPath = join(__dirname, "checked_private_region_witness.py");
const witnessSource = readFileSync(witnessPath, "utf8");

async function witness() {
  const ir = await lowerSource(witnessSource, witnessPath);
  // Stage A attaches at the tagged checked boundary.  This witness has only
  // fixed-width values, so the automatic cost model would otherwise bypass
  // that boundary entirely.
  for (const fn of ir.functions.filter((candidate) =>
    candidate.name.endsWith("_entry")
  )) {
    fn.analysis.backend = { kind: "tagged", reason: "checked-region witness" };
  }
  return ir;
}

const declaration = {
  entry: "checked_region_entry",
  functions: ["checked_region_entry", "checked_region_helper"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
    { kind: "int64-range", parameter: "index", minimum: 0, maximum: 3 },
  ],
};

const optimizedDeclaration = {
  ...declaration,
  capabilities: ["int64-arithmetic", "direct-buffer-access"],
};

const virtualFixedViewDeclaration = {
  entry: "checked_region_fixed_view_entry",
  functions: ["checked_region_fixed_view_entry"],
  capabilities: [
    "int64-arithmetic",
    "verified-span-access",
    "virtual-fixed-uint64-views",
  ],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
    { kind: "int64-range", parameter: "start", minimum: 0, maximum: 2 },
  ],
};

const logicalViewIndexDeclaration = {
  entry: "checked_region_fixed_view_index_entry",
  functions: ["checked_region_fixed_view_index_entry"],
  capabilities: [
    "direct-buffer-access",
    "virtual-fixed-uint64-views",
  ],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
    { kind: "int64-range", parameter: "index", minimum: 0, maximum: 3 },
  ],
};

function fixedViewIndexDeclaration(entry) {
  return {
    entry,
    functions: [entry],
    capabilities: ["virtual-fixed-uint64-views"],
    guard: [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
    ],
  };
}

function functionText(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:static|SAGEJS_CHECKED_REGION_(?:HOT_INLINE|COLD)) int ` +
      `tagged_${escaped}\\([^;]+\\)\\n\\{`,
  ).exec(source);
  assert.ok(match, `missing ${name}`);
  const start = match.index;
  const next = source.indexOf("\n}\n", start);
  assert.notEqual(next, -1, `unterminated ${name}`);
  return source.slice(start, next + 3);
}

test("checked private regions clone a closed graph behind a guard", async () => {
  const ir = installCheckedRegionDeclarations(await witness(), [declaration]);
  const [region] = prepareCheckedRegions(ir);
  assert.equal(region.entry, declaration.entry);
  assert.equal(region.variants.length, 2);
  assert.equal(region.variants.every((fn) => fn.hostCallable === false), true);
  assert.equal(new Set(region.variants.flatMap((fn) => {
    const ids = [];
    const visit = (value) => {
      if (value === null || typeof value !== "object") return;
      if (typeof value.id === "string") ids.push(value.id);
      for (const [key, child] of Object.entries(value)) {
        if (key !== "provenance") visit(child);
      }
    };
    visit(fn.body);
    return ids;
  })).size > 0, true);

  const core = generateHostCore(ir, { moduleIdentity: "0123456789abcdef" });
  const entry = functionText(core.source, "checked_region_entry");
  assert.match(
    entry,
    /sagejs_tagged_arg_storage\.length >= \(size_t\) UINT64_C\(4\)/,
  );
  assert.match(entry, /sagejs_tagged_arg_index >= INT64_C\(0\)/);
  assert.match(entry, /tagged_sagejs_checked_r0_checked_region_entry/);
  assert.match(entry, /tagged_sagejs_checked_fallback_checked_region_entry/);
  assert.doesNotMatch(entry, /sagejs_tagged_entry:/);
  assert.match(
    core.source,
    /#define SAGEJS_CHECKED_REGION_HOT_INLINE static inline __attribute__\(\(hot\)\)/,
  );
  assert.match(
    core.source,
    /#define SAGEJS_CHECKED_REGION_HOT_INLINE static __inline/,
  );
  assert.match(
    core.source,
    /#define SAGEJS_CHECKED_REGION_COLD static __attribute__\(\(cold\)\)/,
  );
  assert.match(
    core.source,
    /SAGEJS_CHECKED_REGION_HOT_INLINE int tagged_sagejs_checked_r0_checked_region_entry\(/,
  );
  assert.match(
    core.source,
    /SAGEJS_CHECKED_REGION_COLD int tagged_sagejs_checked_fallback_checked_region_entry\(/,
  );
  assert.match(core.source, /static int tagged_checked_region_entry\(/);
  assert.doesNotMatch(core.header, /sagejs_checked_fallback/);

  const variantEntry = functionText(
    core.source,
    "sagejs_checked_r0_checked_region_entry",
  );
  assert.match(
    variantEntry,
    /tagged_sagejs_checked_r0_checked_region_helper/,
  );
  const variantHelper = functionText(
    core.source,
    "sagejs_checked_r0_checked_region_helper",
  );
  // Stage A changes routing only: even the guarded clone retains element
  // checks and the original slow path remains present and callable.
  assert.match(variantHelper, /index out of range/);
  assert.match(variantHelper, /sagejs_word_add_int64/);
  const checkedFallback = functionText(
    core.source,
    "sagejs_checked_fallback_checked_region_entry",
  );
  assert.match(checkedFallback, /sagejs_tagged_entry:/);
  assert.match(checkedFallback, /tagged_checked_region_helper/);
  assert.match(core.source, /static int tagged_checked_region_helper/);
  assert.match(core.source, /static int tagged_checked_region_entry/);
  assert.match(
    core.source,
    /sagejs_core_ok = tagged_checked_region_entry\(/,
  );

  if (process.platform !== "win32") {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-checked-region-"));
    try {
      writeFileSync(join(temporary, "kernel_core.h"), core.header);
      writeFileSync(join(temporary, "kernel_core.c"), core.source);
      const compiled = spawnSync(process.env.CC || "cc", [
        "-std=c11",
        "-Werror",
        "-I",
        temporary,
        "-c",
        join(temporary, "kernel_core.c"),
        "-o",
        join(temporary, "kernel_core.o"),
      ], { encoding: "utf8" });
      assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);

      const runtimeSource = `${core.source}
#include <string.h>
int main(void)
{
    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    uint64_t words[4] = {UINT64_C(2), UINT64_C(3), UINT64_C(5), UINT64_C(7)};
    sagejs_uint64_buffer storage = {words, 4};
    int64_t output = 0;
    if (!tagged_checked_region_entry(
            &status, &output, storage, INT64_C(1), UINT64_C(17)))
        return 1;
    if (status.code != SAGEJS_NATIVE_OK || output != INT64_C(3) ||
        words[1] != UINT64_C(17))
        return 2;
    sagejs_native_status_reset(&status);
    if (tagged_checked_region_entry(
            &status, &output, storage, INT64_C(4), UINT64_C(19)))
        return 3;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR ||
        status.message == NULL ||
        strcmp(status.message, "UInt64Buffer index out of range") != 0 ||
        output != INT64_C(3) ||
        words[0] != UINT64_C(2) || words[1] != UINT64_C(17) ||
        words[2] != UINT64_C(5) || words[3] != UINT64_C(7))
        return 4;
    return 0;
}
`;
      writeFileSync(join(temporary, "runtime.c"), runtimeSource);
      const linked = spawnSync(process.env.CC || "cc", [
        "-std=c11",
        "-Werror",
        "-I",
        temporary,
        join(temporary, "runtime.c"),
        "-lgmp",
        "-lm",
        "-o",
        join(temporary, "runtime"),
      ], { encoding: "utf8" });
      assert.equal(linked.status, 0, linked.stderr || linked.stdout);
      const executed = spawnSync(join(temporary, "runtime"), [], {
        encoding: "utf8",
      });
      assert.equal(executed.status, 0, executed.stderr || executed.stdout);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
});

test("portable metadata is inert and malformed graphs fail closed", async () => {
  const authorized = installCheckedRegionDeclarations(await witness(), [declaration]);
  const portable = JSON.parse(JSON.stringify(authorized));
  assert.deepEqual(prepareCheckedRegions(portable), []);
  const ordinary = generateHostCore(portable, {
    moduleIdentity: "0123456789abcdef",
  }).source;
  assert.doesNotMatch(ordinary, /sagejs_checked_r0_/);
  assert.doesNotMatch(ordinary, /SAGEJS_CHECKED_REGION_HOT_INLINE/);

  const open = await witness();
  installCheckedRegionDeclarations(open, [{
    ...declaration,
    functions: ["checked_region_entry"],
  }]);
  assert.throws(() => generateHostCore(open), /outside the closed graph/);

  const duplicate = await witness();
  installCheckedRegionDeclarations(duplicate, [declaration, declaration]);
  assert.throws(() => generateHostCore(duplicate), /duplicate region entry/);

  const forged = await witness();
  const helper = forged.functions.find((fn) =>
    fn.name === "checked_region_helper"
  );
  helper.body.find((operation) => operation.kind === "uint64.buffer.set")
    .checkedRegionProof = {
      authority: "checked-region-buffer-interval-v1",
      operation: "forged",
    };
  installCheckedRegionDeclarations(forged, [declaration]);
  const forgedClone = functionText(
    generateHostCore(forged).source,
    "sagejs_checked_r0_checked_region_helper",
  );
  assert.match(forgedClone, /index out of range/);
});

test("entry intervals prove only bounded straight-line clone operations", async () => {
  const ir = installCheckedRegionDeclarations(await witness(), [
    optimizedDeclaration,
  ]);
  const [region] = prepareCheckedRegions(ir);
  const helper = region.variants.find((fn) =>
    fn.checkedRegionVariant.original === "checked_region_helper"
  );
  const arithmetic = [];
  const accesses = [];
  for (const operation of helper.body) {
    if (operation.kind === "int64.binary") arithmetic.push(operation);
    if (["uint64.buffer.get", "uint64.buffer.set"].includes(operation.kind)) {
      accesses.push(operation);
    }
  }
  assert.equal(arithmetic.length, 3);
  assert.equal(accesses.length, 2);
  assert.equal(arithmetic.every((operation) =>
    operation.checkedRegionProof?.authority ===
      "checked-region-int64-interval-v1"
  ), true);
  assert.equal(accesses.every((operation) =>
    operation.checkedRegionProof?.authority ===
      "checked-region-buffer-interval-v1"
  ), true);

  const core = generateHostCore(ir).source;
  const emitted = functionText(
    core,
    "sagejs_checked_r0_checked_region_helper",
  );
  assert.doesNotMatch(emitted, /sagejs_word_(?:add|sub|mul)_int64/);
  assert.doesNotMatch(emitted, /index out of range/);
  assert.match(emitted, / = .* \+ .*;/);
  assert.match(emitted, / = .* \* .*;/);
  assert.match(emitted, / = .* - .*;/);

  const tooWide = await witness();
  installCheckedRegionDeclarations(tooWide, [{
    ...optimizedDeclaration,
    guard: [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
      {
        kind: "int64-range",
        parameter: "index",
        minimum: 0,
        maximum: "9223372036854775807",
      },
    ],
  }]);
  const wideCore = generateHostCore(tooWide).source;
  const wideHelper = functionText(
    wideCore,
    "sagejs_checked_r0_checked_region_helper",
  );
  assert.match(wideHelper, /sagejs_word_add_int64/);
  assert.match(wideHelper, /index out of range/);

  const ambiguous = await witness();
  installCheckedRegionDeclarations(ambiguous, [{
    entry: "checked_region_ambiguous_entry",
    functions: ["checked_region_ambiguous_entry", "checked_region_helper"],
    capabilities: optimizedDeclaration.capabilities,
    guard: [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
      { kind: "int64-range", parameter: "index", minimum: 0, maximum: 3 },
    ],
  }]);
  const ambiguousHelper = functionText(
    generateHostCore(ambiguous).source,
    "sagejs_checked_r0_checked_region_helper",
  );
  // One unguarded call is enough to revoke facts for the shared helper.
  assert.match(ambiguousHelper, /sagejs_word_add_int64/);
  assert.match(ambiguousHelper, /index out of range/);
});

function structuredDeclaration(entry, guard, capabilities = [
  "int64-arithmetic",
  "direct-buffer-access",
]) {
  return { entry, functions: [entry], guard, capabilities };
}

test("range loops and branches preserve only invariant interval facts", async () => {
  const loop = await witness();
  installCheckedRegionDeclarations(loop, [structuredDeclaration(
    "checked_region_loop_entry",
    [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
      { kind: "int64-range", parameter: "count", minimum: 0, maximum: 4 },
    ],
  )]);
  const loopBody = functionText(
    generateHostCore(loop).source,
    "sagejs_checked_r0_checked_region_loop_entry",
  );
  assert.doesNotMatch(loopBody, /index out of range/);
  // The Python body add is direct; the range machinery deliberately retains
  // its own checked increment in this capability family.
  assert.match(loopBody, /sagejs_local_tagged_index \+ .*;/);
  assert.equal((loopBody.match(/sagejs_word_add_int64/g) || []).length, 1);

  const branch = await witness();
  installCheckedRegionDeclarations(branch, [structuredDeclaration(
    "checked_region_branch_entry",
    [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
      { kind: "int64-range", parameter: "index", minimum: 0, maximum: 1 },
    ],
  )]);
  const branchBody = functionText(
    generateHostCore(branch).source,
    "sagejs_checked_r0_checked_region_branch_entry",
  );
  assert.doesNotMatch(branchBody, /index out of range/);
  assert.doesNotMatch(branchBody, /sagejs_word_add_int64/);

  for (const entry of [
    "checked_region_carried_entry",
    "checked_region_unknown_step_entry",
  ]) {
    const unsafe = await witness();
    installCheckedRegionDeclarations(unsafe, [structuredDeclaration(entry, [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
      { kind: "int64-range", parameter: "count", minimum: 0, maximum: 4 },
    ])]);
    const body = functionText(
      generateHostCore(unsafe).source,
      `sagejs_checked_r0_${entry}`,
    );
    assert.match(body, /index out of range/);
  }

  const snapshot = await witness();
  installCheckedRegionDeclarations(snapshot, [structuredDeclaration(
    "checked_region_mutated_bound_entry",
    [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
      { kind: "int64-range", parameter: "count", minimum: 0, maximum: 4 },
    ],
  )]);
  const snapshotBody = functionText(
    generateHostCore(snapshot).source,
    "sagejs_checked_r0_checked_region_mutated_bound_entry",
  );
  // The IR copies Python range arguments before entering the loop, so later
  // source-variable mutation cannot change the iterator.  The mutation itself
  // remains checked and its fact does not escape the loop.
  assert.doesNotMatch(snapshotBody, /index out of range/);
  assert.match(snapshotBody, /sagejs_word_sub_int64/);

  const unsupported = await witness();
  installCheckedRegionDeclarations(unsupported, [{
    entry: "checked_region_unsupported_entry",
    functions: ["checked_region_unsupported_entry", "checked_region_helper"],
    capabilities: optimizedDeclaration.capabilities,
    guard: [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
      { kind: "int64-range", parameter: "count", minimum: 0, maximum: 3 },
    ],
  }]);
  const unsupportedHelper = functionText(
    generateHostCore(unsupported).source,
    "sagejs_checked_r0_checked_region_helper",
  );
  assert.match(unsupportedHelper, /index out of range/);
  assert.match(unsupportedHelper, /sagejs_word_add_int64/);
});

test("verified span proofs are reconstructed only when requested", async () => {
  const declaration = structuredDeclaration(
    "checked_region_span_entry",
    [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
      { kind: "int64-range", parameter: "start", minimum: 0, maximum: 0 },
      { kind: "int64-range", parameter: "length", minimum: 0, maximum: 4 },
    ],
    ["verified-span-access"],
  );
  const optimized = await witness();
  installCheckedRegionDeclarations(optimized, [declaration]);
  const optimizedBody = functionText(
    generateHostCore(optimized).source,
    "sagejs_checked_r0_checked_region_span_entry",
  );
  assert.doesNotMatch(optimizedBody, /UInt64Buffer index out of range/);
  assert.match(optimizedBody, /UInt64Buffer view is outside its buffer/);

  const checked = await witness();
  installCheckedRegionDeclarations(checked, [{
    ...declaration,
    capabilities: [],
  }]);
  const checkedBody = functionText(
    generateHostCore(checked).source,
    "sagejs_checked_r0_checked_region_span_entry",
  );
  assert.match(checkedBody, /UInt64Buffer index out of range/);
});

test("proved local fixed UInt64 views are scalar-replaced fail closed", async () => {
  const optimized = await witness();
  installCheckedRegionDeclarations(optimized, [
    virtualFixedViewDeclaration,
    logicalViewIndexDeclaration,
    fixedViewIndexDeclaration("checked_region_fixed_view_uint_index_entry"),
    fixedViewIndexDeclaration("checked_region_fixed_view_integer_index_entry"),
  ]);
  const regions = prepareCheckedRegions(optimized);
  const region = regions.find((candidate) =>
    candidate.entry === virtualFixedViewDeclaration.entry
  );
  const variant = region.variants[0];
  const authorized = checkedRegionVirtualUInt64Emission(variant);
  assert.equal(authorized.isVirtualLocal("view"), true);

  const core = generateHostCore(optimized, {
    moduleIdentity: "0123456789abcdef",
  });
  const { source } = core;
  const body = functionText(
    source,
    "sagejs_checked_r0_checked_region_fixed_view_entry",
  );
  assert.doesNotMatch(body, /UInt64Buffer view is outside its buffer/);
  assert.doesNotMatch(body, /UInt64Buffer index out of range/);
  assert.doesNotMatch(body, /sagejs_record_(?:start|length)/);
  assert.doesNotMatch(body, /sagejs_local_tagged_view/);
  assert.match(
    body,
    /sagejs_local_tagged_storage\.data\[\(size_t\) \(sagejs_local_tagged_start\) \+ \(size_t\) \(sagejs_local_tagged_index\)\]/,
  );

  const fallback = functionText(
    source,
    "sagejs_checked_fallback_checked_region_fixed_view_entry",
  );
  assert.match(fallback, /UInt64Buffer view is outside its buffer/);
  assert.match(fallback, /sagejs_local_tagged_view/);

  const logicalIndexBody = functionText(
    source,
    "sagejs_checked_r1_checked_region_fixed_view_index_entry",
  );
  assert.doesNotMatch(
    logicalIndexBody,
    /UInt64Buffer view is outside its buffer/,
  );
  assert.doesNotMatch(logicalIndexBody, /sagejs_local_tagged_view/);
  assert.match(logicalIndexBody, /UInt64Buffer index out of range/);
  const uintIndexBody = functionText(
    source,
    "sagejs_checked_r2_checked_region_fixed_view_uint_index_entry",
  );
  assert.match(uintIndexBody, />= UINT64_C\(2\)/);
  assert.doesNotMatch(uintIndexBody, /sagejs_signed_buffer_index/);
  const integerIndexBody = functionText(
    source,
    "sagejs_checked_r3_checked_region_fixed_view_integer_index_entry",
  );
  assert.match(integerIndexBody, /sagejs_tagged_to_int64/);
  assert.match(integerIndexBody, /sagejs_signed_buffer_index/);

  if (process.platform !== "win32") {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-virtual-view-"));
    try {
      writeFileSync(join(temporary, "kernel_core.h"), core.header);
      const runtimeSource = `${source}
#include <string.h>
int main(void)
{
    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    uint64_t words[4] = {UINT64_C(2), UINT64_C(3), UINT64_C(5), UINT64_C(7)};
    sagejs_uint64_buffer storage = {words, 4};
    uint64_t output = UINT64_C(99);
    if (!tagged_checked_region_fixed_view_entry(
            &status, &output, storage, INT64_C(1), UINT64_C(17)))
        return 1;
    if (status.code != SAGEJS_NATIVE_OK || output != UINT64_C(34) ||
        words[0] != UINT64_C(2) || words[1] != UINT64_C(17) ||
        words[2] != UINT64_C(17) || words[3] != UINT64_C(7))
        return 2;
    sagejs_native_status_reset(&status);
    if (tagged_checked_region_fixed_view_index_entry(
            &status, &output, storage, INT64_C(3)))
        return 3;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR ||
        status.message == NULL ||
        strcmp(status.message, "UInt64Buffer index out of range") != 0 ||
        output != UINT64_C(34))
        return 4;
    sagejs_native_status_reset(&status);
    if (tagged_checked_region_fixed_view_uint_index_entry(
            &status, &output, storage, UINT64_MAX))
        return 5;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR ||
        status.message == NULL ||
        strcmp(status.message, "UInt64Buffer index out of range") != 0 ||
        output != UINT64_C(34))
        return 6;
    sagejs_native_status_reset(&status);
    sagejs_tagged_int large_index;
    sagejs_tagged_init(&large_index);
    sagejs_tagged_set_small(&large_index, INT64_C(1));
    sagejs_tagged_make_big(&large_index);
    mpz_mul_2exp(large_index.big, large_index.big, 100);
    if (tagged_checked_region_fixed_view_integer_index_entry(
            &status, &output, storage, &large_index))
        return 7;
    sagejs_tagged_clear(&large_index);
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR ||
        status.message == NULL ||
        strcmp(status.message, "UInt64Buffer index out of range") != 0 ||
        output != UINT64_C(34))
        return 8;
    sagejs_native_status_reset(&status);
    if (tagged_checked_region_fixed_view_entry(
            &status, &output, storage, INT64_C(3), UINT64_C(19)))
        return 9;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR ||
        status.message == NULL ||
        strcmp(status.message, "UInt64Buffer view is outside its buffer") != 0 ||
        output != UINT64_C(34) ||
        words[0] != UINT64_C(2) || words[1] != UINT64_C(17) ||
        words[2] != UINT64_C(17) || words[3] != UINT64_C(7))
        return 10;
    return 0;
}
`;
      writeFileSync(join(temporary, "runtime.c"), runtimeSource);
      const linked = spawnSync(process.env.CC || "cc", [
        "-std=c11",
        "-Werror",
        "-I",
        temporary,
        join(temporary, "runtime.c"),
        "-lgmp",
        "-lm",
        "-o",
        join(temporary, "runtime"),
      ], { encoding: "utf8" });
      assert.equal(linked.status, 0, linked.stderr || linked.stdout);
      const executed = spawnSync(join(temporary, "runtime"), [], {
        encoding: "utf8",
      });
      assert.equal(executed.status, 0, executed.stderr || executed.stdout);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  const view = variant.body.find((operation) =>
    operation.kind === "uint64.buffer.view"
  );
  assert.ok(view);
  view.length = view.start;
  const revoked = checkedRegionVirtualUInt64Emission(variant);
  assert.equal(revoked.isVirtualLocal("view"), false);

  const claimMutation = await witness();
  installCheckedRegionDeclarations(claimMutation, [virtualFixedViewDeclaration]);
  const [claimRegion] = prepareCheckedRegions(claimMutation);
  const claimVariant = claimRegion.variants[0];
  const claimedAccess = claimVariant.body.find((operation) =>
    operation.kind === "loop.range_int64"
  ).body.find((operation) => operation.kind === "uint64.buffer.set");
  assert.ok(claimedAccess.checkedRegionVirtualUInt64ViewProof);
  delete claimedAccess.checkedRegionVirtualUInt64ViewProof;
  const atomicallyRevoked = checkedRegionVirtualUInt64Emission(claimVariant);
  assert.equal(atomicallyRevoked.isVirtualLocal("view"), false);
  assert.equal(atomicallyRevoked.claim(claimedAccess, "access"), undefined);
  const revokedCore = generateHostCore({
    version: claimMutation.version,
    records: claimMutation.records,
    functions: [...claimMutation.functions, claimVariant],
    foreignLibraries: claimMutation.foreignLibraries,
    callGraph: { ...claimMutation.callGraph, [claimVariant.name]: [] },
    nativeSourceDependencies: claimMutation.nativeSourceDependencies,
  });
  const revokedBody = functionText(revokedCore.source, claimVariant.name);
  assert.match(revokedBody, /UInt64Buffer view is outside its buffer/);
  assert.match(revokedBody, /sagejs_local_tagged_view/);
  if (process.platform !== "win32") {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-revoked-view-"));
    try {
      writeFileSync(join(temporary, "kernel_core.h"), revokedCore.header);
      writeFileSync(join(temporary, "kernel_core.c"), revokedCore.source);
      const compiled = spawnSync(process.env.CC || "cc", [
        "-std=c11",
        "-Werror",
        "-I",
        temporary,
        "-c",
        join(temporary, "kernel_core.c"),
        "-o",
        join(temporary, "kernel_core.o"),
      ], { encoding: "utf8" });
      assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  const mutated = await witness();
  installCheckedRegionDeclarations(mutated, [{
    entry: "checked_region_mutated_view_entry",
    functions: ["checked_region_mutated_view_entry"],
    capabilities: virtualFixedViewDeclaration.capabilities,
    guard: [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
      { kind: "buffer-min-length", parameter: "other", minimum: 2 },
    ],
  }]);
  const mutatedBody = functionText(
    generateHostCore(mutated).source,
    "sagejs_checked_r0_checked_region_mutated_view_entry",
  );
  assert.match(mutatedBody, /UInt64Buffer view is outside its buffer/);
  assert.match(mutatedBody, /sagejs_local_tagged_view/);

  const rebound = await witness();
  installCheckedRegionDeclarations(rebound, [{
    entry: "checked_region_rebound_root_entry",
    functions: ["checked_region_rebound_root_entry"],
    capabilities: virtualFixedViewDeclaration.capabilities,
    guard: [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
      { kind: "buffer-min-length", parameter: "other", minimum: 1 },
      { kind: "int64-range", parameter: "start", minimum: 0, maximum: 2 },
    ],
  }]);
  const reboundBody = functionText(
    generateHostCore(rebound).source,
    "sagejs_checked_r0_checked_region_rebound_root_entry",
  );
  assert.match(reboundBody, /UInt64Buffer view is outside its buffer/);
  assert.match(reboundBody, /sagejs_local_tagged_view/);

  for (const mutation of ["later", "conditional"]) {
    const redefined = await witness();
    const original = redefined.functions.find((fn) =>
      fn.name === "checked_region_fixed_view_entry"
    );
    const viewIndex = original.body.findIndex((operation) =>
      operation.kind === "uint64.buffer.view"
    );
    const view = original.body[viewIndex];
    const definition = original.body.find((operation) =>
      operation.target === view.length
    );
    const overwrite = {
      ...structuredClone(definition),
      id: `${definition.id}:hostile-${mutation}`,
      value: "100",
    };
    if (mutation === "later") {
      original.body.splice(viewIndex + 1, 0, overwrite);
    } else {
      original.body.splice(viewIndex, 0, {
        kind: "if",
        condition: { operations: [], value: "start" },
        body: [overwrite],
        alternative: [],
        id: `${definition.id}:hostile-conditional`,
      });
    }
    installCheckedRegionDeclarations(redefined, [virtualFixedViewDeclaration]);
    const [redefinedRegion] = prepareCheckedRegions(redefined);
    assert.equal(
      checkedRegionVirtualUInt64Emission(redefinedRegion.variants[0])
        .isVirtualLocal("view"),
      false,
      `${mutation} redefinition must revoke view virtualization`,
    );
  }

  const undominatedAlias = await witness();
  const aliasOriginal = undominatedAlias.functions.find((fn) =>
    fn.name === "checked_region_fixed_view_entry"
  );
  const aliasViewIndex = aliasOriginal.body.findIndex((operation) =>
    operation.kind === "uint64.buffer.view"
  );
  const aliasCopyIndex = aliasOriginal.body.findIndex((operation) =>
    operation.kind === "uint64.buffer.copy"
  );
  const [aliasCopy] = aliasOriginal.body.splice(aliasCopyIndex, 1);
  aliasOriginal.body.splice(aliasViewIndex, 0, aliasCopy);
  installCheckedRegionDeclarations(undominatedAlias, [
    virtualFixedViewDeclaration,
  ]);
  const [aliasRegion] = prepareCheckedRegions(undominatedAlias);
  assert.equal(
    checkedRegionVirtualUInt64Emission(aliasRegion.variants[0])
      .isVirtualLocal("view"),
    false,
  );

  const iteratorMutation = await witness();
  const iteratorOriginal = iteratorMutation.functions.find((fn) =>
    fn.name === "checked_region_fixed_view_entry"
  );
  iteratorOriginal.body.find((operation) =>
    operation.kind === "loop.range_int64"
  ).iterator = "start";
  installCheckedRegionDeclarations(iteratorMutation, [
    virtualFixedViewDeclaration,
  ]);
  const [iteratorRegion] = prepareCheckedRegions(iteratorMutation);
  assert.equal(
    checkedRegionVirtualUInt64Emission(iteratorRegion.variants[0])
      .isVirtualLocal("view"),
    false,
  );

  const oversizedLength = await witness();
  const oversizedOriginal = oversizedLength.functions.find((fn) =>
    fn.name === "checked_region_fixed_view_entry"
  );
  const oversizedView = oversizedOriginal.body.find((operation) =>
    operation.kind === "uint64.buffer.view"
  );
  oversizedOriginal.body.find((operation) =>
    operation.target === oversizedView.length
  ).value = "9223372036854775808";
  installCheckedRegionDeclarations(oversizedLength, [
    virtualFixedViewDeclaration,
  ]);
  const [oversizedRegion] = prepareCheckedRegions(oversizedLength);
  assert.equal(
    checkedRegionVirtualUInt64Emission(oversizedRegion.variants[0])
      .isVirtualLocal("view"),
    false,
  );

  const forged = await witness();
  const original = forged.functions.find((fn) =>
    fn.name === "checked_region_fixed_view_entry"
  );
  const forgedView = original.body.find((operation) =>
    operation.kind === "uint64.buffer.view"
  );
  forgedView.checkedRegionVirtualUInt64ViewProof = {
    authority: "checked-region-virtual-fixed-uint64-view-v1",
    role: "view",
    target: forgedView.target,
  };
  installCheckedRegionDeclarations(forged, [{
    ...virtualFixedViewDeclaration,
    capabilities: [],
  }]);
  const forgedBody = functionText(
    generateHostCore(forged).source,
    "sagejs_checked_r0_checked_region_fixed_view_entry",
  );
  assert.match(forgedBody, /UInt64Buffer view is outside its buffer/);
});

test("relational guards prove only matching scalar, affine, and product loops", async () => {
  const cases = [
    {
      entry: "checked_region_relational_scalar_entry",
      guard: [{
        kind: "buffer-min-length-scalar", buffer: "storage", scalar: "count",
      }],
    },
    {
      entry: "checked_region_relational_affine_entry",
      guard: [
        { kind: "int64-range", parameter: "degree", minimum: 0, maximum: 4 },
        {
          kind: "buffer-min-length-affine", buffer: "storage",
          scalar: "degree", offset: 1,
        },
      ],
    },
    {
      entry: "checked_region_relational_product_entry",
      // Deliberately use the product before its binding. Normalization must
      // emit the binding first and emit it exactly once.
      guard: [
        {
          kind: "buffer-min-length-product", buffer: "storage",
          product: "capacity",
        },
        {
          kind: "buffer-min-length-product", buffer: "storage",
          product: "capacity",
        },
        {
          kind: "checked-nonnegative-int64-product", name: "capacity",
          left: "count", right: "degree",
        },
      ],
    },
  ];
  for (const item of cases) {
    const ir = await witness();
    installCheckedRegionDeclarations(ir, [structuredDeclaration(
      item.entry,
      item.guard,
      ["direct-buffer-access", "int64-arithmetic"],
    )]);
    const source = generateHostCore(ir).source;
    const body = functionText(source, `sagejs_checked_r0_${item.entry}`);
    assert.doesNotMatch(body, /index out of range/);
    if (item.entry.endsWith("scalar_entry")) {
      assert.match(source, /sagejs_tagged_arg_count >= 0/);
      assert.match(source, /\(uint64_t\) sagejs_tagged_arg_count <= \(uint64_t\) SIZE_MAX/);
    }
    if (item.entry.endsWith("affine_entry")) {
      assert.match(source, /sagejs_tagged_arg_degree <= INT64_MAX - INT64_C\(1\)/);
      assert.match(source, /\(uint64_t\) \(sagejs_tagged_arg_degree \+ INT64_C\(1\)\) <= \(uint64_t\) SIZE_MAX/);
    }
    if (item.entry.endsWith("product_entry")) {
      assert.doesNotMatch(body, /sagejs_word_mul_int64/);
      const declarations = source.match(
        /int64_t sagejs_checked_product_capacity = 0;/g,
      ) || [];
      assert.equal(declarations.length, 1);
      assert.ok(
        source.indexOf("int64_t sagejs_checked_product_capacity") <
          source.indexOf("sagejs_tagged_arg_storage.length >= (size_t) sagejs_checked_product_capacity"),
      );
      assert.match(source, /sagejs_tagged_arg_count < 0/);
      assert.match(source, /sagejs_tagged_arg_degree != 0 && sagejs_tagged_arg_count > INT64_MAX \/ sagejs_tagged_arg_degree/);
      assert.match(source, /\(uint64_t\) sagejs_checked_product_capacity <= \(uint64_t\) SIZE_MAX/);
    }
  }

  const mismatch = await witness();
  installCheckedRegionDeclarations(mismatch, [structuredDeclaration(
    "checked_region_relational_mismatch_entry",
    [{
      kind: "buffer-min-length-scalar", buffer: "storage", scalar: "count",
    }],
    ["direct-buffer-access"],
  )]);
  const mismatchBody = functionText(
    generateHostCore(mismatch).source,
    "sagejs_checked_r0_checked_region_relational_mismatch_entry",
  );
  assert.match(mismatchBody, /index out of range/);
});

test("relational guards authorize authenticated Int64Buffer accesses", async () => {
  const declaration = {
    entry: "checked_region_int64_entry",
    functions: ["checked_region_int64_entry"],
    capabilities: ["direct-buffer-access", "int64-arithmetic"],
    guard: [
      {
        kind: "buffer-min-length-scalar", buffer: "storage", scalar: "count",
      },
      { kind: "int64-range", parameter: "count", minimum: 0, maximum: 4 },
    ],
  };
  const ir = await witness();
  installCheckedRegionDeclarations(ir, [declaration]);
  const source = generateHostCore(ir, {
    moduleIdentity: "0123456789abcdef",
  }).source;
  const optimized = functionText(
    source,
    "sagejs_checked_r0_checked_region_int64_entry",
  );
  assert.doesNotMatch(optimized, /Int64 buffer index out of range/);
  assert.match(
    optimized,
    /\.data\[\(size_t\) sagejs_local_tagged_index\]/,
  );
  const fallback = functionText(
    source,
    "sagejs_checked_fallback_checked_region_int64_entry",
  );
  assert.match(fallback, /Int64 buffer index out of range/);

  const backendDirectory = mkdtempSync(join(tmpdir(), "sagejs-int64-backends-"));
  try {
    const built = await compileKernel({
      sourcePath: witnessPath,
      cacheDirectory: join(backendDirectory, "cache"),
    });
    const compiled = require(built.modulePath).checked_region_int64_entry;
    for (const backend of ["javascript", "gmp", "tagged"]) {
      const storage = [2n, 3n, 5n, 7n];
      assert.equal(compiled[backend](storage, 4n, -11n), -44n);
      assert.deepEqual(storage, [-11n, -11n, -11n, -11n]);
      const short = [2n, 3n, 5n, 7n];
      assert.throws(
        () => compiled[backend](short, 5n, 13n),
        /Int64 buffer index out of range|index out of range/,
      );
      assert.deepEqual(short, [13n, 13n, 13n, 13n]);
    }
  } finally {
    rmSync(backendDirectory, { recursive: true, force: true });
  }

  if (process.platform !== "win32") {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-checked-int64-region-"));
    try {
      writeFileSync(join(temporary, "kernel_core.h"),
        generateHostCore(ir, { moduleIdentity: "0123456789abcdef" }).header);
      writeFileSync(join(temporary, "runtime.c"), `${source}
#include <string.h>
int main(void)
{
    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    int64_t words[4] = {INT64_C(2), INT64_C(3), INT64_C(5), INT64_C(7)};
    sagejs_int64_buffer storage = {words, 4};
    int64_t output = 0;
    if (!tagged_checked_region_int64_entry(
            &status, &output, storage, INT64_C(4), INT64_C(-11)))
        return 1;
    if (status.code != SAGEJS_NATIVE_OK || output != INT64_C(-44) ||
        words[0] != INT64_C(-11) || words[3] != INT64_C(-11))
        return 2;
    sagejs_native_status_reset(&status);
    words[0] = INT64_C(2); words[1] = INT64_C(3);
    words[2] = INT64_C(5); words[3] = INT64_C(7);
    if (tagged_checked_region_int64_entry(
            &status, &output, storage, INT64_C(5), INT64_C(13)))
        return 3;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR || status.message == NULL ||
        strcmp(status.message, "Int64 buffer index out of range") != 0 ||
        words[0] != INT64_C(13) || words[3] != INT64_C(13))
        return 4;
    return 0;
}
`);
      const linked = spawnSync(process.env.CC || "cc", [
        "-std=c11", "-Werror", "-I", temporary,
        join(temporary, "runtime.c"), "-lgmp", "-lm",
        "-o", join(temporary, "runtime"),
      ], { encoding: "utf8" });
      assert.equal(linked.status, 0, linked.stderr || linked.stdout);
      const executed = spawnSync(join(temporary, "runtime"), [], {
        encoding: "utf8",
      });
      assert.equal(executed.status, 0, executed.stderr || executed.stdout);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  const stale = await witness();
  installCheckedRegionDeclarations(stale, [declaration]);
  const entry = stale.functions.find((fn) =>
    fn.name === "checked_region_int64_entry"
  );
  const loop = entry.body.find((operation) =>
    operation.kind === "loop.range_int64"
  );
  assert.ok(loop);
  // A hostile mutation changes the loop stop after authorization was
  // requested. The proof is reconstructed from current IR and must disappear.
  const other = entry.params.find((parameter) => parameter.name === "value");
  loop.stop = other.name;
  const [region] = prepareCheckedRegions(stale);
  let access;
  const visit = (value) => {
    if (value === null || typeof value !== "object") return;
    if (value.kind === "int64.buffer.get") access = value;
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance") visit(child);
    }
  };
  visit(region.variants[0].body);
  assert.ok(access);
  assert.equal(access.checkedRegionProof, undefined);

  const authorized = await witness();
  installCheckedRegionDeclarations(authorized, [declaration]);
  const [authorizedRegion] = prepareCheckedRegions(authorized);
  let provedAccess;
  const findProvedAccess = (value) => {
    if (value === null || typeof value !== "object") return;
    if (value.kind === "int64.buffer.get") provedAccess = value;
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance") findProvedAccess(child);
    }
  };
  findProvedAccess(authorizedRegion.variants[0].body);
  assert.ok(provedAccess?.checkedRegionProof);
  // Authority is tied to the current operation shape, not merely its stable
  // operation id. Post-analysis mutation cannot reuse the private Symbol.
  assert.equal(isCheckedRegionBufferAccess(provedAccess), true);
  provedAccess.index = "value";
  assert.equal(isCheckedRegionBufferAccess(provedAccess), false);
});

test("relational guard schemas and mutated proof inputs fail closed", async () => {
  for (const guard of [
    [{ kind: "buffer-min-length-product", buffer: "storage", product: "missing" }],
    [
      {
        kind: "checked-nonnegative-int64-product", name: "capacity",
        left: "count", right: "count",
      },
      {
        kind: "checked-nonnegative-int64-product", name: "capacity",
        left: "count", right: "count",
      },
    ],
    [{
      kind: "checked-nonnegative-int64-product", name: "not-valid!",
      left: "count", right: "count",
    }],
    [{
      kind: "buffer-min-length-affine", buffer: "storage", scalar: "count",
      offset: -1,
    }],
    [{
      kind: "buffer-min-length-affine", buffer: "storage", scalar: "count",
      offset: "9223372036854775808",
    }],
  ]) {
    const ir = await witness();
    installCheckedRegionDeclarations(ir, [structuredDeclaration(
      "checked_region_relational_scalar_entry", guard,
    )]);
    assert.throws(() => generateHostCore(ir), /invalid checked private region/);
  }

  const badArity = await witness();
  installCheckedRegionDeclarations(badArity, [optimizedDeclaration]);
  badArity.functions.find((fn) => fn.name === "checked_region_entry")
    .body.find((operation) => operation.kind === "native.call")
    .arguments.pop();
  assert.throws(() => generateHostCore(badArity), /invalid arity/);

  const badType = await witness();
  installCheckedRegionDeclarations(badType, [optimizedDeclaration]);
  badType.functions.find((fn) => fn.name === "checked_region_entry")
    .body.find((operation) => operation.kind === "native.call")
    .arguments[1].type = "uint64";
  assert.throws(() => generateHostCore(badType), /invalid argument 1/);

  const badConstant = await witness();
  installCheckedRegionDeclarations(badConstant, [structuredDeclaration(
    "checked_region_loop_entry",
    [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
      { kind: "int64-range", parameter: "count", minimum: 0, maximum: 4 },
    ],
  )]);
  const constant = badConstant.functions.find((fn) =>
    fn.name === "checked_region_loop_entry"
  ).body.find((operation) => operation.kind === "int64.constant");
  constant.value = "9223372036854775808";
  assert.throws(() => generateHostCore(badConstant), /outside its scalar domain/);

  const staleShort = await witness();
  installCheckedRegionDeclarations(staleShort, [structuredDeclaration(
    "checked_region_relational_short_entry",
    [{
      kind: "buffer-min-length-scalar", buffer: "storage", scalar: "count",
    }],
    ["direct-buffer-access"],
  )]);
  const shortFunction = staleShort.functions.find((fn) =>
    fn.name === "checked_region_relational_short_entry"
  );
  const short = shortFunction.body.find((operation) =>
    operation.kind === "bool.short_circuit"
  );
  assert.ok(short);
  // A hostile post-lowering mutation makes the short-circuit overwrite the
  // variable that carried the guarded count expression. The verifier must
  // invalidate every relational fact for that target.
  short.target = "stop";
  const [shortRegion] = prepareCheckedRegions(staleShort);
  const shortVariant = shortRegion.variants[0];
  let access;
  const findAccess = (value) => {
    if (value === null || typeof value !== "object") return;
    if (value.kind === "uint64.buffer.set") access = value;
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance") findAccess(child);
    }
  };
  findAccess(shortVariant.body);
  assert.ok(access);
  assert.equal(access.checkedRegionProof, undefined);
});

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
  checkedRegionDirectCallEmission,
  checkedRegionDirectResultEmission,
  checkedRegionInt64ArithmeticEmission,
  checkedRegionInt64RangeIncrementEmission,
  checkedRegionVirtualUInt64Emission,
  installCheckedRegionDeclarations,
  isCheckedRegionBufferAccess,
  prepareCheckedRegions,
} = require("../checked-regions.cjs");
const { generateTaggedFunctions } = require("../tagged-backend.cjs");
const { lowerSource } = require("../ir.cjs");
const {
  checkedRegionSmallHighFaninLeaf,
} = require("../tagged-backend.cjs");

const witnessPath = join(__dirname, "checked_private_region_witness.py");
const witnessSource = readFileSync(witnessPath, "utf8");

async function witness(sourcePath = witnessPath, source = witnessSource) {
  const ir = await lowerSource(source, sourcePath);
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

const positiveRangeSuccessorDeclaration = {
  entry: "checked_region_positive_range_successor_entry",
  functions: ["checked_region_positive_range_successor_entry"],
  capabilities: ["int64-arithmetic"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 0 },
    {
      kind: "int64-range",
      parameter: "start",
      minimum: 0,
      maximum: "9223372036854775807",
    },
  ],
};

const positiveRangeSuccessorDirectDeclaration = {
  entry: "checked_region_positive_range_successor_direct_entry",
  functions: [
    "checked_region_positive_range_successor_direct_entry",
    "checked_region_positive_range_successor_helper",
  ],
  capabilities: ["int64-arithmetic"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 0 },
    {
      kind: "int64-range",
      parameter: "start",
      minimum: 0,
      maximum: "9223372036854775807",
    },
  ],
  localVariants: [{
    function: "checked_region_positive_range_successor_helper",
    mode: "direct-result",
    guard: [{
      kind: "int64-range",
      parameter: "start",
      minimum: 0,
      maximum: "9223372036854775807",
    }],
    capabilities: ["int64-arithmetic"],
  }],
};

const positiveRangeSuccessorCallDeclaration = {
  entry: "checked_region_positive_range_successor_call_entry",
  functions: [
    "checked_region_positive_range_successor_call_entry",
    "checked_region_positive_range_successor_call_helper",
  ],
  capabilities: ["int64-arithmetic"],
  guard: positiveRangeSuccessorDeclaration.guard,
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

const validatedViewDeclaration = {
  entry: "checked_region_validated_view_entry",
  functions: ["checked_region_validated_view_entry"],
  capabilities: ["virtual-fixed-uint64-views"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 0 },
    { kind: "buffer-min-length", parameter: "other", minimum: 0 },
  ],
};

const validatedIntegerViewDeclaration = {
  entry: "checked_region_validated_integer_view_entry",
  functions: ["checked_region_validated_integer_view_entry"],
  capabilities: ["virtual-fixed-uint64-views"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 0 },
  ],
};

const graphSpanViewDeclaration = {
  entry: "checked_region_graph_span_entry",
  functions: [
    "checked_region_graph_span_entry",
    "checked_region_graph_span_helper",
  ],
  capabilities: ["virtual-fixed-uint64-views"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
  ],
};

const mutableGraphSpanViewDeclaration = {
  entry: "checked_region_graph_span_mutable_entry",
  functions: [
    "checked_region_graph_span_mutable_entry",
    "checked_region_graph_span_mutable_helper",
  ],
  capabilities: ["virtual-fixed-uint64-views"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
    { kind: "int64-range", parameter: "count", minimum: 0, maximum: 2 },
  ],
};

const localCopyDeclaration = {
  entry: "checked_region_local_copy_entry",
  functions: [
    "checked_region_local_copy_entry",
    "checked_region_local_copy_helper",
  ],
  capabilities: ["virtual-fixed-uint64-views"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 0 },
  ],
  localVariants: [{
    function: "checked_region_local_copy_helper",
    guard: [
      { kind: "int64-range", parameter: "degree", minimum: -1, maximum: 3 },
    ],
    capabilities: ["interval-view-access"],
  }],
};

const directCopyDeclaration = {
  entry: "checked_region_direct_copy_entry",
  functions: [
    "checked_region_direct_copy_entry",
    "checked_region_local_copy_helper",
  ],
  capabilities: ["virtual-fixed-uint64-views"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 12 },
  ],
  localVariants: [{
    function: "checked_region_local_copy_helper",
    mode: "direct-result",
    guard: [
      { kind: "int64-range", parameter: "degree", minimum: -1, maximum: 3 },
    ],
    capabilities: ["int64-arithmetic", "interval-view-access"],
  }],
};

const unitRangeDeclaration = {
  entry: "checked_region_unit_range_entry",
  functions: ["checked_region_unit_range_entry"],
  capabilities: ["int64-range-induction"],
  guard: [{
    kind: "int64-range",
    parameter: "start",
    minimum: "-9223372036854775808",
    maximum: "9223372036854775807",
  }],
};

test("force-inline selection uses only authenticated direct edges", async () => {
  const original = [
    "    result: int64 = checked_region_local_copy_helper(storage, 0, 3, 4)",
    "    result = checked_region_local_copy_helper(storage, 4, 3, 0)",
    "    result = checked_region_local_copy_helper(storage, 2, -1, 6)",
  ].join("\n");
  const entryCalls = [
    "    result: int64 = checked_region_local_copy_helper(storage, 0, 3, 4)",
    "    result = checked_region_local_copy_helper(storage, 4, 3, 0)",
    "    result = checked_region_local_copy_helper(storage, 2, -1, 6)",
    "    result = checked_region_local_copy_helper(storage, 0, 3, 4)",
    "    result = checked_region_direct_copy_peer(storage)",
  ].join("\n");
  const peer = [
    "@native",
    "def checked_region_direct_copy_peer(storage: UInt64Buffer) -> int64:",
    "    result: int64 = checked_region_local_copy_helper(storage, 0, 3, 4)",
    "    result = checked_region_local_copy_helper(storage, 4, 3, 0)",
    "    result = checked_region_local_copy_helper(storage, 2, -1, 6)",
    "    result = checked_region_local_copy_helper(storage, 0, 3, 4)",
    "    return result",
    "",
    "",
  ].join("\n");
  const source = witnessSource
    .replace(original, entryCalls)
    .replace(
      "@native\ndef checked_region_direct_copy_entry(",
      `${peer}@native\ndef checked_region_direct_copy_entry(`,
    );
  assert.notEqual(source, witnessSource);
  const ir = await witness(witnessPath, source);
  const highFaninDeclaration = structuredClone(directCopyDeclaration);
  highFaninDeclaration.functions.splice(
    1,
    0,
    "checked_region_direct_copy_peer",
  );
  installCheckedRegionDeclarations(ir, [highFaninDeclaration]);
  const [region] = prepareCheckedRegions(ir);
  const entry = region.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_direct_copy_entry"
  );
  const fast = region.variants.find(fn =>
    fn.name.includes("checked_region_local_copy_helper__local_fast_0")
  );
  const functions = new Map(region.variants.map(fn => [fn.name, fn]));
  assert.ok(entry);
  assert.ok(fast);
  const directCalls = [];
  const callers = new Set();
  for (const caller of functions.values()) {
    for (const operation of caller.body) {
      if (operation.kind !== "native.call") continue;
      const direct = checkedRegionDirectCallEmission(
        caller,
        operation,
        functions,
      );
      if (direct?.function !== fast.name || direct.guard !== undefined) continue;
      directCalls.push({ caller, operation });
      callers.add(caller.name);
    }
  }
  assert.equal(directCalls.length, 8);
  assert.equal(callers.size, 2);
  assert.equal(checkedRegionSmallHighFaninLeaf(fast, functions), true);
  const core = generateHostCore(ir, { moduleIdentity: "0123456789abcdef" });
  assert.match(
    core.source,
    new RegExp(
      `SAGEJS_CHECKED_REGION_FORCE_INLINE int64_t sagejs_direct_${fast.name}`,
    ),
  );

  // The selector replays direct-call authority. Mutating one edge drops the
  // authenticated fan-in below the threshold even though its fallback target
  // and the other seven source calls remain unchanged.
  const { caller, operation } = directCalls[0];
  operation.arguments[1].name = operation.arguments[2].name;
  assert.equal(
    checkedRegionDirectCallEmission(caller, operation, functions),
    undefined,
  );
  assert.equal(checkedRegionSmallHighFaninLeaf(fast, functions), false);
});

const guardedDirectCopyDeclaration = {
  entry: "checked_region_direct_copy_entry",
  functions: [
    "checked_region_direct_copy_entry",
    "checked_region_local_copy_helper",
  ],
  capabilities: ["virtual-fixed-uint64-views"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 12 },
  ],
  localVariants: [{
    function: "checked_region_local_copy_helper",
    mode: "guarded-direct-result",
    guard: [
      { kind: "buffer-min-length", parameter: "storage", minimum: 12 },
      { kind: "int64-range", parameter: "start", minimum: 0, maximum: 8 },
      { kind: "int64-range", parameter: "degree", minimum: -1, maximum: 3 },
      { kind: "int64-range", parameter: "output", minimum: 0, maximum: 8 },
    ],
    edges: [{
      operationOrigin: "checked_region_direct_copy_entry:25",
    }],
    capabilities: ["int64-arithmetic", "interval-view-access"],
  }],
};

const refinedDirectCopyDeclaration = {
  entry: "checked_region_refined_copy_entry",
  functions: [
    "checked_region_refined_copy_entry",
    "checked_region_local_copy_helper",
  ],
  capabilities: ["direct-buffer-access", "virtual-fixed-uint64-views"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 12 },
    {
      kind: "int64-range",
      parameter: "degree",
      minimum: Number.MIN_SAFE_INTEGER,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    { kind: "int64-range", parameter: "count", minimum: -2, maximum: 2 },
  ],
  localVariants: [{
    function: "checked_region_local_copy_helper",
    mode: "direct-result",
    guard: [
      { kind: "int64-range", parameter: "degree", minimum: -1, maximum: 3 },
    ],
    capabilities: ["int64-arithmetic", "interval-view-access"],
  }],
};

const orRefinedDirectCopyDeclaration = {
  entry: "checked_region_or_refined_copy_entry",
  functions: [
    "checked_region_or_refined_copy_entry",
    "checked_region_local_copy_helper",
  ],
  capabilities: ["virtual-fixed-uint64-views"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 8 },
  ],
  localVariants: [{
    function: "checked_region_local_copy_helper",
    mode: "direct-result",
    guard: [
      { kind: "int64-range", parameter: "degree", minimum: -1, maximum: 3 },
    ],
    capabilities: ["int64-arithmetic", "interval-view-access"],
  }],
};

function summaryDirectDeclaration(entry, functions, guard) {
  return {
    entry,
    functions: [entry, ...functions, "checked_region_local_copy_helper"],
    capabilities: [
      "direct-buffer-access",
      "int64-arithmetic",
      "interval-view-access",
      "scalar-return-summaries",
      "virtual-fixed-uint64-views",
    ],
    guard: [
      { kind: "buffer-min-length", parameter: "storage", minimum: 12 },
      ...guard,
    ],
    localVariants: [{
      function: "checked_region_local_copy_helper",
      mode: "direct-result",
      guard: [
        { kind: "int64-range", parameter: "degree", minimum: -1, maximum: 3 },
      ],
      capabilities: ["int64-arithmetic", "interval-view-access"],
    }],
  };
}

const identitySummaryDeclaration = summaryDirectDeclaration(
  "checked_region_summary_entry",
  ["checked_region_summary_wrapper", "checked_region_summary_identity"],
  [{ kind: "int64-range", parameter: "degree", minimum: 0, maximum: 3 }],
);

const transitiveSummaryViewDeclaration = {
  entry: "checked_region_summary_view_entry",
  functions: [
    "checked_region_summary_view_entry",
    "checked_region_summary_view_helper",
    "checked_region_summary_wrapper",
    "checked_region_summary_identity",
  ],
  capabilities: [
    "scalar-return-summaries",
    "virtual-fixed-uint64-views",
  ],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
    { kind: "int64-range", parameter: "start", minimum: 0, maximum: 2 },
  ],
  localVariants: [],
};

const graphGuardRootDeclaration = {
  entry: "checked_region_guard_root_entry",
  functions: [
    "checked_region_guard_root_entry",
    "checked_region_guard_root_helper",
  ],
  capabilities: ["virtual-fixed-uint64-views"],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
    { kind: "int64-range", parameter: "start", minimum: 0, maximum: 2 },
  ],
  localVariants: [{
    function: "checked_region_guard_root_helper",
    mode: "guarded",
    edges: [],
    guard: [
      { kind: "buffer-min-length", parameter: "storage", minimum: 4 },
      { kind: "int64-range", parameter: "start", minimum: 0, maximum: 2 },
    ],
    capabilities: ["virtual-fixed-uint64-views"],
  }],
};

const intervalSummaryDeclaration = summaryDirectDeclaration(
  "checked_region_summary_interval_entry",
  ["checked_region_summary_interval"],
  [{ kind: "int64-range", parameter: "selector", minimum: -10, maximum: 10 }],
);

const whileSummaryDeclaration = {
  entry: "checked_region_summary_while_entry",
  functions: [
    "checked_region_summary_while_entry",
    "checked_region_summary_affine_square",
    "checked_region_summary_affine_multiply",
    "checked_region_summary_affine_remainder",
    "checked_region_local_copy_helper",
  ],
  capabilities: [
    "scalar-return-summaries",
    "virtual-fixed-uint64-views",
  ],
  guard: [
    { kind: "buffer-min-length", parameter: "storage", minimum: 8 },
    { kind: "int64-range", parameter: "degree", minimum: -1, maximum: 3 },
    {
      kind: "int64-range",
      parameter: "divisor_degree",
      minimum: 2,
      maximum: 4,
    },
    { kind: "int64-range", parameter: "exponent", minimum: 1, maximum: 8 },
    { kind: "int64-range", parameter: "stop", minimum: -10, maximum: 10 },
  ],
  localVariants: [{
    function: "checked_region_local_copy_helper",
    mode: "direct-result",
    guard: [
      { kind: "int64-range", parameter: "degree", minimum: -1, maximum: 3 },
    ],
    capabilities: ["int64-arithmetic", "interval-view-access"],
  }],
};

const breakWhileSummaryDeclaration = {
  ...whileSummaryDeclaration,
  entry: "checked_region_summary_break_while_entry",
  functions: [
    "checked_region_summary_break_while_entry",
    "checked_region_summary_local_bounded",
    ...whileSummaryDeclaration.functions.slice(1),
  ],
};

const degradingWhileSummaryDeclaration = {
  ...whileSummaryDeclaration,
  entry: "checked_region_summary_while_degrading_entry",
  functions: [
    "checked_region_summary_while_degrading_entry",
    ...whileSummaryDeclaration.functions.slice(1),
  ],
  guard: [
    whileSummaryDeclaration.guard[0],
    { kind: "buffer-min-length", parameter: "second", minimum: 8 },
    { kind: "buffer-min-length", parameter: "third", minimum: 8 },
    { kind: "buffer-min-length", parameter: "other", minimum: 0 },
    ...whileSummaryDeclaration.guard.slice(1),
  ],
};

function hostileSummaryDeclaration(entry, helper, guards) {
  return {
    entry,
    functions: [entry, helper, "checked_region_local_copy_helper"],
    capabilities: [
      "scalar-return-summaries",
      "virtual-fixed-uint64-views",
    ],
    guard: [
      { kind: "buffer-min-length", parameter: "storage", minimum: 8 },
      ...guards,
    ],
    localVariants: [{
      function: "checked_region_local_copy_helper",
      mode: "direct-result",
      guard: [
        { kind: "int64-range", parameter: "degree", minimum: -1, maximum: 3 },
      ],
      capabilities: ["int64-arithmetic", "interval-view-access"],
    }],
  };
}

const partialOverflowSummaryDeclaration = hostileSummaryDeclaration(
  "checked_region_summary_partial_overflow_entry",
  "checked_region_summary_partial_overflow",
  [{
    kind: "int64-range",
    parameter: "value",
    minimum: 0,
    maximum: "9223372036854775807",
  }],
);

const recomputedThresholdSummaryDeclaration = hostileSummaryDeclaration(
  "checked_region_summary_recomputed_threshold_entry",
  "checked_region_summary_recomputed_threshold",
  [
    { kind: "int64-range", parameter: "value", minimum: 3, maximum: 3 },
    { kind: "int64-range", parameter: "rounds", minimum: 5, maximum: 5 },
  ],
);

const nestedStepSummaryDeclaration = hostileSummaryDeclaration(
  "checked_region_summary_nested_step_entry",
  "checked_region_summary_nested_step",
  [
    { kind: "int64-range", parameter: "value", minimum: 3, maximum: 3 },
    { kind: "int64-range", parameter: "rounds", minimum: 1, maximum: 1 },
  ],
);

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

function executableText(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function directFunctionText(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `SAGEJS_CHECKED_REGION_(?:HOT|FORCE)_INLINE [^\\n]+ ` +
      `sagejs_direct_${escaped}\\([^;]+\\)\\n\\{`,
  ).exec(source);
  assert.ok(match, `missing direct ${name}`);
  const start = match.index;
  const next = source.indexOf("\n}\n", start);
  assert.notEqual(next, -1, `unterminated direct ${name}`);
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
  assert.match(core.source, /#define SAGEJS_CHECKED_REGION_FORCE_INLINE/);
  assert.match(
    core.source,
    /static inline __attribute__\(\(hot, always_inline\)\)/,
  );
  assert.match(
    core.source,
    /#define SAGEJS_CHECKED_REGION_HOT_INLINE static __inline/,
  );
  assert.match(
    core.source,
    /#define SAGEJS_CHECKED_REGION_FORCE_INLINE static __forceinline/,
  );
  assert.match(
    core.source,
    /#define SAGEJS_CHECKED_REGION_COLD static __attribute__\(\(cold\)\)/,
  );
  assert.match(
    core.source,
    /#define SAGEJS_CHECKED_REGION_UNLIKELY\(condition\) \\\n    __builtin_expect\(!!\(condition\), 0\)/,
  );
  assert.match(
    core.source,
    /#define SAGEJS_CHECKED_REGION_UNLIKELY\(condition\) \(condition\)/,
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
  assert.match(
    variantEntry,
    /if \(SAGEJS_CHECKED_REGION_UNLIKELY\(!tagged_sagejs_checked_r0_checked_region_helper\(/,
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
  assert.doesNotMatch(checkedFallback, /SAGEJS_CHECKED_REGION_UNLIKELY/);
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

test("int64 interval proofs require unchanged complete private graphs", async () => {
  async function prepared() {
    const ir = installCheckedRegionDeclarations(await witness(), [
      optimizedDeclaration,
    ]);
    const [region] = prepareCheckedRegions(ir);
    const functions = new Map(region.variants.map(fn => [fn.name, fn]));
    const helper = region.variants.find(fn =>
      fn.checkedRegionVariant.original === "checked_region_helper"
    );
    const entry = region.variants.find(fn =>
      fn.checkedRegionVariant.original === "checked_region_entry"
    );
    const operation = helper.body.find(candidate =>
      candidate.kind === "int64.binary" && candidate.operation === "add"
    );
    assert.ok(entry);
    assert.ok(helper);
    assert.ok(operation);
    return { entry, functions, helper, operation, region };
  }

  const intact = await prepared();
  assert.equal(
    checkedRegionInt64ArithmeticEmission(
      intact.helper, intact.functions,
    ).isAuthorized(intact.operation),
    true,
  );
  const direct = functionText(
    generateTaggedFunctions(intact.region.variants, {
      functions: intact.region.variants,
    }).functions + "\n",
    intact.helper.name,
  );
  assert.doesNotMatch(direct, /sagejs_word_add_int64/);

  const operand = await prepared();
  operand.operation.left = "result";
  assert.equal(
    checkedRegionInt64ArithmeticEmission(
      operand.helper, operand.functions,
    ).isAuthorized(operand.operation),
    false,
  );
  const checked = functionText(
    generateTaggedFunctions(operand.region.variants, {
      functions: operand.region.variants,
    }).functions + "\n",
    operand.helper.name,
  );
  assert.match(checked, /sagejs_word_add_int64/);

  const sibling = await prepared();
  sibling.entry.body.at(-1).value = "index";
  assert.equal(
    checkedRegionInt64ArithmeticEmission(
      sibling.helper, sibling.functions,
    ).isAuthorized(sibling.operation),
    false,
  );

  const root = await prepared();
  root.entry.checkedRegionGraphRoot = Object.freeze({
    ...root.entry.checkedRegionGraphRoot,
    guard: Object.freeze(root.entry.checkedRegionGraphRoot.guard.slice(1)),
  });
  assert.equal(
    checkedRegionInt64ArithmeticEmission(
      root.helper, root.functions,
    ).isAuthorized(root.operation),
    false,
  );

  const partial = await prepared();
  partial.functions.delete(partial.entry.name);
  assert.equal(
    checkedRegionInt64ArithmeticEmission(
      partial.helper, partial.functions,
    ).isAuthorized(partial.operation),
    false,
  );

  const forged = await prepared();
  forged.operation.checkedRegionProof = Object.freeze({
    ...forged.operation.checkedRegionProof,
    minimum: "-9223372036854775808",
  });
  assert.equal(
    checkedRegionInt64ArithmeticEmission(
      forged.helper, forged.functions,
    ).isAuthorized(forged.operation),
    false,
  );
});

test("positive int64 range successors use authenticated relational bounds", async () => {
  function rangeSuccessorOperations(fn) {
    const operations = [];
    const visit = (value) => {
      if (value === null || typeof value !== "object") return;
      if (value.kind === "int64.binary" && value.operation === "add" &&
          value.checkedRegionProof?.authority ===
            "checked-region-int64-positive-range-successor-v1") {
        operations.push(value);
      }
      for (const [key, child] of Object.entries(value)) {
        if (key !== "provenance") visit(child);
      }
    };
    visit(fn.body);
    return operations;
  }

  function findRangeSuccessor(fn) {
    let loop;
    const visit = (value) => {
      if (value === null || typeof value !== "object") return;
      if (value.kind === "loop.range_int64") loop = value;
      for (const [key, child] of Object.entries(value)) {
        if (key !== "provenance") visit(child);
      }
    };
    visit(fn.body);
    const operations = rangeSuccessorOperations(fn);
    assert.ok(loop);
    assert.equal(operations.length, 3);
    return { loop, operations };
  }

  async function prepared() {
    const ir = installCheckedRegionDeclarations(await witness(), [
      positiveRangeSuccessorDeclaration,
    ]);
    const [region] = prepareCheckedRegions(ir);
    const fn = region.variants[0];
    const functions = new Map(region.variants.map(value => [value.name, value]));
    const { loop, operations } = findRangeSuccessor(fn);
    return {
      fn,
      functions,
      ir,
      loop,
      operation: operations[0],
      operations,
      region,
    };
  }

  const intact = await prepared();
  assert.equal(intact.operation.checkedRegionProof.rangeOperand,
    intact.loop.index);
  assert.equal(intact.operation.checkedRegionProof.incrementOperand,
    intact.operation.right);
  assert.equal(intact.operation.checkedRegionProof.upperBound,
    "parameter:stop");
  assert.equal(intact.operation.checkedRegionProof.minimum, "1");
  const commuted = intact.operations[1];
  assert.equal(commuted.checkedRegionProof.rangeOperand, intact.loop.index);
  assert.equal(commuted.checkedRegionProof.incrementOperand, commuted.left);
  const propagated = intact.operations[2];
  assert.notEqual(propagated.checkedRegionProof.rangeOperand,
    intact.loop.index);
  assert.equal(propagated.checkedRegionProof.upperBound, "parameter:stop");
  for (const operation of intact.operations) {
    assert.equal(
      checkedRegionInt64ArithmeticEmission(
        intact.fn, intact.functions,
      ).isAuthorized(operation),
      true,
    );
  }
  const source = generateHostCore(intact.ir, {
    moduleIdentity: "0123456789abcdef",
  }).source;
  const body = functionText(
    source,
    "sagejs_checked_r0_checked_region_positive_range_successor_entry",
  );
  assert.doesNotMatch(
    body,
    new RegExp(`sagejs_word_add_int64\\([^;]+${intact.operation.target}`),
  );
  // The distinct range-latch check remains until its own theorem authorizes
  // that compiler-generated update.
  assert.equal((body.match(/sagejs_word_add_int64/g) || []).length, 1);
  const fallback = functionText(
    source,
    "sagejs_checked_fallback_checked_region_positive_range_successor_entry",
  );
  assert.ok((fallback.match(/sagejs_word_add_int64/g) || []).length >= 2);

  if (process.platform !== "win32") {
    const temporary = mkdtempSync(join(
      tmpdir(), "sagejs-positive-range-successor-",
    ));
    try {
      writeFileSync(join(temporary, "kernel_core.h"),
        generateHostCore(intact.ir, {
          moduleIdentity: "0123456789abcdef",
        }).header);
      writeFileSync(join(temporary, "runtime.c"), `${source}
int main(void)
{
    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    sagejs_uint64_buffer storage = {NULL, 0};
    int64_t output = -INT64_C(1);
    if (!tagged_checked_region_positive_range_successor_entry(
            &status, &output, storage, INT64_MAX - INT64_C(1), INT64_MAX))
        return 1;
    if (status.code != SAGEJS_NATIVE_OK || output != INT64_MAX)
        return 2;
    sagejs_native_status_reset(&status);
    if (!tagged_checked_region_positive_range_successor_entry(
            &status, &output, storage, INT64_MAX, INT64_MAX))
        return 3;
    if (status.code != SAGEJS_NATIVE_OK || output != INT64_C(0))
        return 4;
    sagejs_native_status_reset(&status);
    if (!tagged_checked_region_positive_range_successor_entry(
            &status, &output, storage, -INT64_C(1), INT64_C(0)))
        return 5;
    if (status.code != SAGEJS_NATIVE_OK || output != INT64_C(0))
        return 6;
    return 0;
}
`);
      const linked = spawnSync(process.env.CC || "cc", [
        "-std=c11", "-Werror", "-fsanitize=undefined",
        "-fno-sanitize-recover=undefined", "-I", temporary,
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

  for (const mutate of [
    (value) => { value.operation.left = value.loop.stop; },
    (value) => { value.loop.index = value.loop.stop; },
    (value) => { value.loop.step = value.loop.stop; },
    (value) => { value.loop.stop = value.loop.start; },
    (value) => {
      value.operation.checkedRegionProof = Object.freeze({
        ...value.operation.checkedRegionProof,
        upperBound: "parameter:start",
      });
    },
    (value) => {
      value.fn.checkedRegionGraphRoot = Object.freeze({
        ...value.fn.checkedRegionGraphRoot,
        guard: Object.freeze(value.fn.checkedRegionGraphRoot.guard.slice(1)),
      });
    },
    (value) => { value.functions.delete(value.fn.name); },
  ]) {
    const hostile = await prepared();
    mutate(hostile);
    assert.equal(
      checkedRegionInt64ArithmeticEmission(
        hostile.fn, hostile.functions,
      ).isAuthorized(hostile.operation),
      false,
    );
  }

  const callIr = installCheckedRegionDeclarations(await witness(), [
    positiveRangeSuccessorCallDeclaration,
  ]);
  const [callRegion] = prepareCheckedRegions(callIr);
  const callFunctions = new Map(
    callRegion.variants.map(fn => [fn.name, fn]),
  );
  const callEntry = callRegion.variants.find(fn =>
    fn.checkedRegionVariant.original ===
      "checked_region_positive_range_successor_call_entry"
  );
  const callHelper = callRegion.variants.find(fn =>
    fn.checkedRegionVariant.original ===
      "checked_region_positive_range_successor_call_helper"
  );
  assert.ok(callEntry);
  assert.ok(callHelper);
  const [callOperation] = rangeSuccessorOperations(callHelper);
  assert.ok(callOperation);
  assert.equal(callOperation.checkedRegionProof.rangeOperand, "value");
  assert.equal(callOperation.checkedRegionProof.upperBound, "parameter:stop");
  assert.equal(
    checkedRegionInt64ArithmeticEmission(
      callHelper, callFunctions,
    ).isAuthorized(callOperation),
    true,
  );
  const callBody = functionText(
    generateHostCore(callIr).source,
    "sagejs_checked_r0_checked_region_positive_range_successor_call_helper",
  );
  assert.doesNotMatch(callBody, /sagejs_word_add_int64/);
  const callLoop = callEntry.body.find(operation =>
    operation.kind === "loop.range_int64"
  );
  assert.ok(callLoop);
  callLoop.stop = callLoop.start;
  assert.equal(
    checkedRegionInt64ArithmeticEmission(
      callHelper, callFunctions,
    ).isAuthorized(callOperation),
    false,
  );

  const directIr = installCheckedRegionDeclarations(await witness(), [
    positiveRangeSuccessorDirectDeclaration,
  ]);
  const [directRegion] = prepareCheckedRegions(directIr);
  const directFunctions = new Map(
    directRegion.variants.map(fn => [fn.name, fn]),
  );
  const fast = directRegion.variants.find(fn =>
    fn.name.includes(
      "checked_region_positive_range_successor_helper__local_fast_0",
    )
  );
  assert.ok(fast);
  assert.ok(checkedRegionDirectResultEmission(fast));
  for (const directOperation of findRangeSuccessor(fast).operations) {
    assert.equal(
      checkedRegionInt64ArithmeticEmission(
        fast, directFunctions,
      ).isAuthorized(directOperation),
      true,
    );
  }
  const directSource = generateHostCore(directIr, {
    moduleIdentity: "0123456789abcdef",
  }).source;
  const directBody = directFunctionText(directSource, fast.name);
  for (const operation of findRangeSuccessor(fast).operations) {
    assert.doesNotMatch(
      directBody,
      new RegExp(`sagejs_word_add_int64\\([^;]+${operation.target}`),
    );
  }
  assert.equal((directBody.match(/sagejs_word_add_int64/g) || []).length, 1);
  assert.doesNotMatch(directBody, /sagejs_native_status_set|goto fail/);
  assert.match(
    functionText(
      directSource,
      "sagejs_checked_r0_checked_region_positive_range_successor_direct_entry",
    ),
    new RegExp(`sagejs_direct_${fast.name}`),
  );
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
  assert.doesNotMatch(reboundBody, /sagejs_local_tagged_view/);
  assert.match(reboundBody, /sagejs_virtual_uint64_data_0/);

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
      true,
      `${mutation} redefinition is captured at the view program point`,
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
    true,
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
    true,
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

test("callee fixed views require the authenticated private graph", async () => {
  const optimized = await witness();
  installCheckedRegionDeclarations(optimized, [graphSpanViewDeclaration]);
  const [region] = prepareCheckedRegions(optimized);
  const entry = region.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_graph_span_entry"
  );
  const helper = region.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_graph_span_helper"
  );
  const functions = new Map(region.variants.map(fn => [fn.name, fn]));
  const view = helper.body.find(operation =>
    operation.kind === "uint64.buffer.view"
  );
  assert.equal(
    checkedRegionVirtualUInt64Emission(helper).claim(view, "view"),
    undefined,
  );
  assert.equal(
    checkedRegionVirtualUInt64Emission(helper, functions)
      .claim(view, "view")?.mode,
    "fixed",
  );

  const core = generateHostCore(optimized, {
    moduleIdentity: "0123456789abcdef",
  });
  const privateBody = functionText(core.source, helper.name);
  assert.doesNotMatch(privateBody, /UInt64Buffer view is outside its buffer/);
  assert.match(core.source, /UInt64Buffer view is outside its buffer/);

  const call = entry.body.find(operation => operation.kind === "native.call");
  const originalFunction = call.function;
  call.function = entry.name;
  assert.equal(
    checkedRegionVirtualUInt64Emission(helper, functions)
      .claim(view, "view"),
    undefined,
  );
  call.function = originalFunction;
  assert.equal(
    checkedRegionVirtualUInt64Emission(helper, functions)
      .claim(view, "view")?.mode,
    "fixed",
  );

  const withoutOwner = new Map(functions);
  withoutOwner.delete(helper.name);
  assert.equal(
    checkedRegionVirtualUInt64Emission(helper, withoutOwner)
      .claim(view, "view"),
    undefined,
  );

  if (process.platform !== "win32") {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-graph-view-"));
    try {
      writeFileSync(join(temporary, "kernel_core.h"), core.header);
      writeFileSync(join(temporary, "runtime.c"), `${core.source}
#include <string.h>
int main(void)
{
    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    uint64_t words[4] = {UINT64_C(2), UINT64_C(3), UINT64_C(5), UINT64_C(7)};
    sagejs_uint64_buffer storage = {words, 4};
    uint64_t output = UINT64_C(99);
    if (!tagged_checked_region_graph_span_entry(&status, &output, storage) ||
        status.code != SAGEJS_NATIVE_OK || output != UINT64_C(5))
        return 1;
    sagejs_native_status_reset(&status);
    storage.length = 3;
    if (tagged_checked_region_graph_span_entry(&status, &output, storage))
        return 2;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR || status.message == NULL ||
        strcmp(status.message, "UInt64Buffer view is outside its buffer") != 0 ||
        output != UINT64_C(5))
        return 3;
    return 0;
}
`);
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

test("unsupported-loop span facts discard every mutable name", async () => {
  const optimized = await witness();
  installCheckedRegionDeclarations(optimized, [mutableGraphSpanViewDeclaration]);
  const [region] = prepareCheckedRegions(optimized);
  const helper = region.variants.find(fn =>
    fn.checkedRegionVariant.original ===
      "checked_region_graph_span_mutable_helper"
  );
  const functions = new Map(region.variants.map(fn => [fn.name, fn]));
  const view = helper.body.find(operation =>
    operation.kind === "uint64.buffer.view"
  );
  assert.equal(
    checkedRegionVirtualUInt64Emission(helper, functions)
      .claim(view, "view")?.mode,
    "validated",
  );
  const body = functionText(generateHostCore(optimized).source, helper.name);
  assert.match(body, /UInt64Buffer view is outside its buffer/);
});

test("validated local UInt64 views snapshot checked construction", async () => {
  const ir = await witness();
  installCheckedRegionDeclarations(ir, [
    validatedViewDeclaration,
    validatedIntegerViewDeclaration,
  ]);
  const regions = prepareCheckedRegions(ir);
  const region = regions.find(candidate =>
    candidate.entry === validatedViewDeclaration.entry
  );
  const variant = region.variants[0];
  const authorized = checkedRegionVirtualUInt64Emission(variant);
  assert.equal(authorized.isVirtualLocal("view"), true);
  assert.equal(authorized.isVirtualLocal("alias"), true);
  assert.equal(authorized.validatedViews().length, 1);

  const core = generateHostCore(ir, { moduleIdentity: "0123456789abcdef" });
  const body = functionText(
    core.source,
    "sagejs_checked_r0_checked_region_validated_view_entry",
  );
  assert.doesNotMatch(body, /sagejs_uint64_buffer sagejs_local_tagged_(?:view|alias)/);
  assert.match(body, /UInt64Buffer view is outside its buffer/);
  assert.match(body, /sagejs_virtual_uint64_data_0/);
  assert.match(body, /sagejs_virtual_uint64_length_0/);
  assert.match(body, /sagejs_tagged_to_int64/);
  assert.match(body, /sagejs_signed_buffer_index/);
  assert.doesNotMatch(body, /sagejs_local_tagged_storage\.data\[/);
  assert.match(body, /sagejs_local_tagged_sagejs_virtual_uint64_data_0/);
  assert.match(body, /sagejs_local_tagged_sagejs_virtual_uint64_length_0/);

  const integerBody = functionText(
    core.source,
    "sagejs_checked_r1_checked_region_validated_integer_view_entry",
  );
  const startConversion = integerBody.indexOf(
    "sagejs_tagged_to_int64(sagejs_tagged_arg_start",
  );
  const lengthConversion = integerBody.indexOf(
    "sagejs_tagged_to_int64(sagejs_tagged_arg_length",
  );
  assert.ok(startConversion >= 0 && startConversion < lengthConversion);
  assert.doesNotMatch(integerBody, /sagejs_local_tagged_view/);

  const fallback = functionText(
    core.source,
    "sagejs_checked_fallback_checked_region_validated_view_entry",
  );
  assert.match(fallback, /sagejs_uint64_buffer sagejs_local_tagged_view/);
  assert.match(fallback, /sagejs_uint64_buffer sagejs_local_tagged_alias/);

  if (process.platform !== "win32") {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-validated-view-"));
    try {
      writeFileSync(join(temporary, "kernel_core.h"), core.header);
      const runtimeSource = `${core.source}
#include <string.h>
int main(void)
{
    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    uint64_t words[4] = {UINT64_C(2), UINT64_C(3), UINT64_C(5), UINT64_C(7)};
    uint64_t other_words[2] = {UINT64_C(11), UINT64_C(13)};
    sagejs_uint64_buffer storage = {words, 4};
    sagejs_uint64_buffer other = {other_words, 2};
    uint64_t output = UINT64_C(99);
    if (!tagged_sagejs_checked_r0_checked_region_validated_view_entry(
            &status, &output, storage, other, INT64_C(1), INT64_C(2),
            INT64_C(1), UINT64_C(17)))
        return 1;
    if (status.code != SAGEJS_NATIVE_OK || output != UINT64_C(17) ||
        words[2] != UINT64_C(17) || other_words[1] != UINT64_C(13))
        return 2;
    sagejs_native_status_reset(&status);
    if (tagged_sagejs_checked_r0_checked_region_validated_view_entry(
            &status, &output, storage, other, INT64_C(4), INT64_C(0),
            INT64_C(0), UINT64_C(19)))
        return 3;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR || status.message == NULL ||
        strcmp(status.message, "UInt64Buffer index out of range") != 0)
        return 4;
    sagejs_native_status_reset(&status);
    if (tagged_sagejs_checked_r0_checked_region_validated_view_entry(
            &status, &output, storage, other, INT64_C(5), INT64_C(0),
            INT64_C(0), UINT64_C(19)))
        return 5;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR || status.message == NULL ||
        strcmp(status.message, "UInt64Buffer view is outside its buffer") != 0)
        return 6;
    sagejs_native_status_reset(&status);
    sagejs_uint64_buffer empty = {NULL, 0};
    if (tagged_sagejs_checked_r0_checked_region_validated_view_entry(
            &status, &output, empty, other, INT64_C(0), INT64_C(0),
            INT64_C(0), UINT64_C(19)))
        return 7;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR || status.message == NULL ||
        strcmp(status.message, "UInt64Buffer index out of range") != 0)
        return 8;
    sagejs_native_status_reset(&status);
    sagejs_tagged_int integer_start;
    sagejs_tagged_int integer_length;
    sagejs_tagged_init(&integer_start);
    sagejs_tagged_init(&integer_length);
    sagejs_tagged_set_small(&integer_start, INT64_C(1));
    sagejs_tagged_set_small(&integer_length, INT64_C(2));
    if (!tagged_sagejs_checked_r1_checked_region_validated_integer_view_entry(
            &status, &output, storage, &integer_start, &integer_length,
            INT64_C(1)) || output != UINT64_C(17))
        return 9;
    sagejs_native_status_reset(&status);
    sagejs_tagged_set_small(&integer_start, -INT64_C(1));
    if (tagged_sagejs_checked_r1_checked_region_validated_integer_view_entry(
            &status, &output, storage, &integer_start, &integer_length,
            INT64_C(0)))
        return 10;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR || status.message == NULL ||
        strcmp(status.message, "UInt64Buffer view is outside its buffer") != 0)
        return 11;
    sagejs_native_status_reset(&status);
    sagejs_tagged_set_small(&integer_start, INT64_C(1));
    sagejs_tagged_set_small(&integer_length, INT64_C(1));
    sagejs_tagged_make_big(&integer_start);
    mpz_mul_2exp(integer_start.big, integer_start.big, 100);
    if (tagged_sagejs_checked_r1_checked_region_validated_integer_view_entry(
            &status, &output, storage, &integer_start, &integer_length,
            INT64_C(0)))
        return 12;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR || status.message == NULL ||
        strcmp(status.message, "UInt64Buffer view is outside its buffer") != 0)
        return 13;
    sagejs_tagged_clear(&integer_length);
    sagejs_tagged_clear(&integer_start);
    return 0;
}
`;
      writeFileSync(join(temporary, "runtime.c"), runtimeSource);
      const linked = spawnSync(process.env.CC || "cc", [
        "-std=c11", "-Werror", "-I", temporary,
        join(temporary, "runtime.c"), "-lgmp", "-lm", "-o",
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

test("graph fixed views authenticate the public dispatch guard root", async () => {
  const ir = await witness();
  installCheckedRegionDeclarations(ir, [graphGuardRootDeclaration]);
  const [region] = prepareCheckedRegions(ir);
  const entry = region.variants.find(fn =>
    fn.checkedRegionVariant.original === graphGuardRootDeclaration.entry
  );
  const helper = region.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_guard_root_helper" &&
    fn.checkedRegionLocalCapabilities !== undefined
  );
  const functions = new Map(region.variants.map(fn => [fn.name, fn]));
  const view = helper.body.find(operation =>
    operation.kind === "uint64.buffer.view"
  );
  assert.ok(entry.checkedRegionGraphRoot);
  assert.strictEqual(entry.checkedRegionGraphRoot.guard, region.guard);
  assert.equal(
    checkedRegionVirtualUInt64Emission(helper, functions)
      .claim(view, "view")?.mode,
    "fixed",
  );
  const partialFunctions = new Map(functions);
  partialFunctions.delete(helper.name);
  assert.equal(
    checkedRegionVirtualUInt64Emission(helper, partialFunctions)
      .claim(view, "view"),
    undefined,
  );

  const originalRoot = entry.checkedRegionGraphRoot;
  entry.checkedRegionGraphRoot = Object.freeze({
    ...originalRoot,
    guard: Object.freeze([
      Object.freeze({
        kind: "buffer-min-length",
        parameter: "storage",
        parameterType: "UInt64Buffer",
        minimum: 1,
      }),
    ]),
  });
  assert.equal(
    checkedRegionVirtualUInt64Emission(helper, functions).claim(view, "view"),
    undefined,
  );

  entry.checkedRegionGraphRoot = originalRoot;
  assert.equal(
    checkedRegionVirtualUInt64Emission(helper, functions)
      .claim(view, "view")?.mode,
    "fixed",
  );
  delete entry.checkedRegionGraphRoot;
  assert.equal(
    checkedRegionVirtualUInt64Emission(helper, functions).claim(view, "view"),
    undefined,
  );

  entry.checkedRegionGraphRoot = Object.freeze({
    ...originalRoot,
    entry: "checked_region_guard_root_helper",
  });
  assert.equal(
    checkedRegionVirtualUInt64Emission(helper, functions).claim(view, "view"),
    undefined,
  );
  entry.checkedRegionGraphRoot = originalRoot;

  const source = generateHostCore(ir).source;
  const fastBody = functionText(
    source,
    helper.name,
  );
  assert.doesNotMatch(fastBody, /UInt64Buffer view is outside its buffer/);
});

test("validated view snapshots do not trust operation-id uniqueness", async () => {
  const ir = await witness();
  const original = ir.functions.find(fn =>
    fn.name === "checked_region_two_validated_views_entry"
  );
  const views = original.body.filter(operation =>
    operation.kind === "uint64.buffer.view"
  );
  assert.equal(views.length, 2);
  views[1].id = views[0].id;
  installCheckedRegionDeclarations(ir, [{
    entry: original.name,
    functions: [original.name],
    capabilities: ["virtual-fixed-uint64-views"],
    guard: [
      { kind: "buffer-min-length", parameter: "storage", minimum: 0 },
    ],
  }]);
  const source = generateHostCore(ir).source;
  const body = functionText(
    source,
    "sagejs_checked_r0_checked_region_two_validated_views_entry",
  );
  assert.match(body, /sagejs_virtual_uint64_data_0/);
  assert.match(body, /sagejs_virtual_uint64_data_1/);
  assert.match(body, /sagejs_virtual_uint64_length_0/);
  assert.match(body, /sagejs_virtual_uint64_length_1/);
  assert.doesNotMatch(
    body,
    /sagejs_uint64_buffer sagejs_local_tagged_(?:first|second)(?:\s|=)/,
  );
  if (process.platform !== "win32") {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-duplicate-view-id-"));
    try {
      writeFileSync(join(temporary, "kernel_core.h"),
        generateHostCore(ir).header);
      writeFileSync(join(temporary, "kernel_core.c"), source);
      const compiled = spawnSync(process.env.CC || "cc", [
        "-std=c11", "-Werror", "-I", temporary, "-c",
        join(temporary, "kernel_core.c"), "-o", join(temporary, "kernel_core.o"),
      ], { encoding: "utf8" });
      assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
});

test("guarded local variants prove unit-step virtual-view indices", async () => {
  const ir = await witness();
  installCheckedRegionDeclarations(ir, [localCopyDeclaration]);
  const [region] = prepareCheckedRegions(ir);
  const slow = region.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_local_copy_helper" &&
    fn.checkedRegionLocalCapabilities === undefined
  );
  const fast = region.variants.find(fn =>
    fn.checkedRegionLocalCapabilities?.includes("interval-view-access")
  );
  assert.ok(slow);
  assert.ok(fast);
  const proved = [];
  const visit = value => {
    if (value === null || typeof value !== "object") return;
    const proof = value.checkedRegionVirtualUInt64ViewProof
      ?.logicalIndexProof;
    if (proof !== undefined) proved.push([value, proof]);
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance") visit(child);
    }
  };
  visit(fast.body);
  assert.equal(proved.length, 5);
  assert.deepEqual(new Set(proved.map(([, proof]) => proof.step)),
    new Set(["-1", "1"]));
  assert.equal(proved.every(([, proof]) =>
    proof.indexMinimum === "0" && proof.indexMaximum === "3" &&
    proof.logicalLength === "4"
  ), true);

  const core = generateHostCore(ir, { moduleIdentity: "0123456789abcdef" });
  const wrapper = functionText(
    core.source,
    "sagejs_checked_r0_checked_region_local_copy_helper",
  );
  assert.match(wrapper, /sagejs_tagged_arg_degree >= \(-INT64_C\(1\)\)/);
  assert.match(wrapper, /sagejs_tagged_arg_degree <= INT64_C\(3\)/);
  assert.match(wrapper, /__local_fast_0/);
  assert.match(wrapper, /tagged_checked_region_local_copy_helper/);

  const fastBody = functionText(
    core.source,
    "sagejs_checked_r0_checked_region_local_copy_helper__local_fast_0",
  );
  assert.match(fastBody, /UInt64Buffer view is outside its buffer/);
  assert.doesNotMatch(fastBody, /UInt64Buffer index out of range/);
  assert.equal((fastBody.match(/sagejs_word_add_int64/g) || []).length, 5);
  const ordinary = functionText(core.source, "checked_region_local_copy_helper");
  assert.match(ordinary, /UInt64Buffer index out of range/);
  assert.ok((ordinary.match(/sagejs_word_add_int64/g) || []).length >= 5);

  if (process.platform !== "win32") {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-local-view-range-"));
    try {
      writeFileSync(join(temporary, "kernel_core.h"), core.header);
      const runtimeSource = `${core.source}
#include <string.h>
static int run_copy(int64_t degree, int64_t start, int64_t output,
                    uint64_t *words, const uint64_t *expected)
{
    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    sagejs_uint64_buffer storage = {words, 12};
    int64_t result = INT64_C(99);
    if (!tagged_checked_region_local_copy_entry(
            &status, &result, storage, start, degree, output))
        return 1;
    if (status.code != SAGEJS_NATIVE_OK || result != degree)
        return 2;
    return memcmp(words, expected, 12 * sizeof(uint64_t)) != 0 ? 3 : 0;
}
int main(void)
{
    uint64_t right[12] = {1,2,3,4,5,6,7,8,9,10,11,12};
    const uint64_t right_expected[12] = {1,2,1,2,3,4,7,8,9,10,11,12};
    if (run_copy(INT64_C(3), INT64_C(0), INT64_C(2),
                 right, right_expected)) return 1;
    uint64_t left[12] = {1,2,3,4,5,6,7,8,9,10,11,12};
    const uint64_t left_expected[12] = {3,4,5,6,5,6,7,8,9,10,11,12};
    if (run_copy(INT64_C(3), INT64_C(2), INT64_C(0),
                 left, left_expected)) return 2;
    uint64_t zero[12] = {1,2,3,4,5,6,7,8,9,10,11,12};
    const uint64_t zero_expected[12] = {1,2,0,0,0,0,7,8,9,10,11,12};
    if (run_copy(-INT64_C(1), INT64_C(0), INT64_C(2),
                 zero, zero_expected)) return 3;

    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    sagejs_uint64_buffer storage = {right, 12};
    int64_t result = INT64_C(99);
    if (tagged_checked_region_local_copy_entry(
            &status, &result, storage, INT64_C(0), INT64_C(4), INT64_C(2)))
        return 4;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR || status.message == NULL ||
        strcmp(status.message, "UInt64Buffer index out of range") != 0)
        return 5;
    sagejs_native_status_reset(&status);
    if (tagged_checked_region_local_copy_entry(
            &status, &result, storage, INT64_C(0), INT64_MAX, INT64_C(0)))
        return 6;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR || status.message == NULL ||
        strcmp(status.message, "int64 arithmetic overflow") != 0)
        return 7;
    sagejs_native_status_reset(&status);
    if (tagged_checked_region_local_copy_entry(
            &status, &result, storage, INT64_C(10), INT64_C(0), INT64_C(0)))
        return 8;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR || status.message == NULL ||
        strcmp(status.message, "UInt64Buffer view is outside its buffer") != 0)
        return 9;
    return 0;
}
`;
      writeFileSync(join(temporary, "runtime.c"), runtimeSource);
      const linked = spawnSync(process.env.CC || "cc", [
        "-std=c11", "-Werror", "-I", temporary,
        join(temporary, "runtime.c"), "-lgmp", "-lm", "-o",
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

  delete proved[0][0].checkedRegionVirtualUInt64ViewProof;
  const revoked = checkedRegionVirtualUInt64Emission(fast);
  assert.equal(revoked.validatedViews().length, 0);
});

test("private direct-result variants rewrite only proved call edges", async () => {
  const ir = await witness();
  installCheckedRegionDeclarations(ir, [directCopyDeclaration]);
  const [region] = prepareCheckedRegions(ir);
  const entry = region.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_direct_copy_entry"
  );
  const slow = region.variants.find(fn =>
    fn.name.endsWith("checked_region_local_copy_helper")
  );
  const fast = region.variants.find(fn =>
    fn.name.includes("checked_region_local_copy_helper__local_fast_0")
  );
  assert.ok(entry);
  assert.ok(slow);
  assert.ok(fast);
  assert.ok(checkedRegionDirectResultEmission(fast));
  const functions = new Map(region.variants.map(fn => [fn.name, fn]));
  const calls = entry.body.filter(operation => operation.kind === "native.call");
  assert.equal(calls.length, 4);
  const directCalls = calls.filter(operation =>
    checkedRegionDirectCallEmission(entry, operation, functions) !== undefined
  );
  assert.equal(directCalls.length, 3);
  assert.equal(calls.every(operation =>
    operation.function === slow.name
  ), true);
  const callerViews = checkedRegionVirtualUInt64Emission(entry);
  const sentinelView = entry.body.find(operation =>
    operation.kind === "uint64.buffer.view"
  );
  assert.equal(callerViews.claim(sentinelView, "view")?.mode, "fixed");
  assert.equal(entry.body.filter(operation =>
    ["uint64.buffer.get", "uint64.buffer.set"].includes(operation.kind) &&
    callerViews.claim(operation, "access") !== undefined
  ).length, 2);

  const core = generateHostCore(ir, { moduleIdentity: "0123456789abcdef" });
  const directBody = directFunctionText(core.source, fast.name);
  assert.doesNotMatch(
    executableText(directBody),
    /\bstatus\b|sagejs_tagged_output_|goto fail|sagejs_native_status_set/,
  );
  assert.equal((directBody.match(/sagejs_word_add_int64/g) || []).length, 3);
  assert.match(directBody, /return sagejs_local_tagged_degree;/);
  assert.match(core.source,
    new RegExp(`tagged_${slow.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\(`));
  assert.equal((core.source.match(new RegExp(
    `= sagejs_direct_${fast.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\(`,
    "g",
  )) || []).length, 3);

  if (process.platform !== "win32") {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-direct-result-"));
    try {
      writeFileSync(join(temporary, "kernel_core.h"), core.header);
      const runtimeSource = `${core.source}
#include <string.h>
int main(void)
{
    uint64_t words[12] = {1,2,3,4,5,6,7,8,9,10,11,12};
    const uint64_t expected[12] = {1,2,1,2,3,4,0,0,0,0,11,12};
    sagejs_uint64_buffer storage = {words, 12};
    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    int64_t result = INT64_C(99);
    if (!tagged_checked_region_direct_copy_entry(
            &status, &result, storage, INT64_C(0), INT64_C(3), INT64_C(2)))
        return 1;
    if (status.code != SAGEJS_NATIVE_OK || result != INT64_C(3) ||
        memcmp(words, expected, sizeof(words)) != 0)
        return 2;
    sagejs_native_status_reset(&status);
    if (tagged_checked_region_direct_copy_entry(
            &status, &result, storage, INT64_C(10), INT64_C(0), INT64_C(0)))
        return 3;
    if (status.code != SAGEJS_NATIVE_RANGE_ERROR || status.message == NULL ||
        strcmp(status.message, "UInt64Buffer view is outside its buffer") != 0)
        return 4;
    return 0;
}
`;
      writeFileSync(join(temporary, "runtime.c"), runtimeSource);
      const linked = spawnSync(process.env.CC || "cc", [
        "-std=c11", "-Werror", "-I", temporary,
        join(temporary, "runtime.c"), "-lgmp", "-lm", "-o",
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

test("direct-result validation ignores status words in provenance comments", async () => {
  const ir = await witness("/tmp/status-in-source-path/witness.py");
  installCheckedRegionDeclarations(ir, [directCopyDeclaration]);
  assert.doesNotThrow(() =>
    generateHostCore(ir, { moduleIdentity: "0123456789abcdef" })
  );
});

test("guarded direct results use a residual edge guard and checked fallback", async () => {
  const ir = await witness();
  installCheckedRegionDeclarations(ir, [guardedDirectCopyDeclaration]);
  const [region] = prepareCheckedRegions(ir);
  const entry = region.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_direct_copy_entry"
  );
  const fast = region.variants.find(fn =>
    fn.name.includes("checked_region_local_copy_helper__local_fast_0")
  );
  assert.ok(entry);
  assert.ok(fast);
  assert.ok(checkedRegionDirectResultEmission(fast));
  const functions = new Map(region.variants.map(fn => [fn.name, fn]));
  const calls = entry.body.filter(operation => operation.kind === "native.call");
  const emissions = calls.map(operation =>
    checkedRegionDirectCallEmission(entry, operation, functions)
  );
  assert.equal(emissions.filter(Boolean).length, 4);
  assert.equal(emissions.filter(emission => emission.guard === undefined).length, 3);
  const guarded = emissions.find(emission => emission.guard !== undefined);
  assert.deepEqual(guarded.guard.map(predicate => [
    predicate.kind,
    predicate.parameter,
  ]), [
    ["int64-range", "start"],
    ["int64-range", "degree"],
    ["int64-range", "output"],
  ]);

  const core = generateHostCore(ir, { moduleIdentity: "0123456789abcdef" });
  const entryBody = functionText(
    core.source,
    "sagejs_checked_r0_checked_region_direct_copy_entry",
  );
  assert.equal((entryBody.match(/= sagejs_direct_/g) || []).length, 4);
  assert.match(entryBody, /sagejs_local_tagged_start >= INT64_C\(0\)/);
  assert.match(entryBody, /sagejs_local_tagged_degree >= \(-INT64_C\(1\)\)/);
  assert.match(entryBody, /sagejs_local_tagged_output <= INT64_C\(8\)/);
  assert.doesNotMatch(entryBody, /sagejs_tagged_arg_storage\.length/);
  assert.match(entryBody,
    /else if \(SAGEJS_CHECKED_REGION_UNLIKELY\(!tagged_sagejs_checked_r0_checked_region_local_copy_helper/);
  assert.equal((core.source.match(new RegExp(
    `SAGEJS_CHECKED_REGION_HOT_INLINE int64_t sagejs_direct_${fast.name}` +
      `\\([^;]+\\)\\n\\{`,
    "g",
  )) || []).length, 1);
  assert.doesNotMatch(core.source, new RegExp(
    `(?:HOT_INLINE|COLD) int tagged_${fast.name}\\(`,
  ));

  if (process.platform !== "win32") {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-guarded-direct-result-"));
    try {
      writeFileSync(join(temporary, "kernel_core.h"), core.header);
      const runtimeSource = `${core.source}
#include <string.h>
static int run_case(int64_t start, int64_t degree, int64_t output,
                    const uint64_t *expected, int expected_ok,
                    const char *expected_message)
{
    uint64_t words[12] = {1,2,3,4,5,6,7,8,9,10,11,12};
    sagejs_uint64_buffer storage = {words, 12};
    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    int64_t result = INT64_C(99);
    int ok = tagged_checked_region_direct_copy_entry(
        &status, &result, storage, start, degree, output);
    if (ok != expected_ok) return 1;
    if (expected_ok) {
        if (status.code != SAGEJS_NATIVE_OK || result != degree) return 2;
    } else if (status.code != SAGEJS_NATIVE_RANGE_ERROR ||
               status.message == NULL ||
               strcmp(status.message, expected_message) != 0) return 3;
    return memcmp(words, expected, sizeof(words)) != 0 ? 4 : 0;
}
int main(void)
{
    const uint64_t right[12] = {1,2,1,2,3,4,0,0,0,0,11,12};
    if (run_case(0, 3, 2, right, 1, NULL)) return 1;
    const uint64_t left[12] = {3,4,1,2,1,2,0,0,0,0,11,12};
    if (run_case(2, 3, 0, left, 1, NULL)) return 2;
    const uint64_t exact[12] = {1,2,3,4,1,2,0,0,0,0,11,12};
    if (run_case(2, 3, 2, exact, 1, NULL)) return 3;
    const uint64_t fallback[12] = {1,2,3,4,1,2,0,0,0,0,11,12};
    if (run_case(0, 4, 2, fallback, 0,
                 "UInt64Buffer index out of range")) return 4;
    if (run_case(9, 0, 0, fallback, 0,
                 "UInt64Buffer view is outside its buffer")) return 5;
    if (run_case(0, 0, 9, fallback, 0,
                 "UInt64Buffer view is outside its buffer")) return 6;
    if (run_case(-1, 0, 0, fallback, 0,
                 "UInt64Buffer view is outside its buffer")) return 7;
    if (run_case(0, 0, -1, fallback, 0,
                 "UInt64Buffer view is outside its buffer")) return 8;
    const uint64_t negative_degree[12] = {0,0,0,0,1,2,0,0,0,0,11,12};
    if (run_case(0, -2, 0, negative_degree, 1, NULL)) return 9;
    const uint64_t partial[12] = {1,2,0,0,1,2,0,0,0,0,11,12};
    if (run_case(4, 4, 0, partial, 0,
                 "UInt64Buffer index out of range")) return 10;
    return 0;
}
`;
      writeFileSync(join(temporary, "runtime.c"), runtimeSource);
      const linked = spawnSync(process.env.CC || "cc", [
        "-std=c11", "-Werror", "-I", temporary,
        join(temporary, "runtime.c"), "-lgmp", "-lm", "-o",
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

  calls.at(-1).arguments[1].name = calls.at(-1).arguments[2].name;
  assert.equal(
    checkedRegionDirectCallEmission(entry, calls.at(-1), functions),
    undefined,
  );

  const changedProvenance = await witness();
  installCheckedRegionDeclarations(
    changedProvenance, [guardedDirectCopyDeclaration],
  );
  const [changedRegion] = prepareCheckedRegions(changedProvenance);
  const changedEntry = changedRegion.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_direct_copy_entry"
  );
  const changedFunctions = new Map(changedRegion.variants.map(fn => [
    fn.name, fn,
  ]));
  const changedCall = changedEntry.body.find(operation =>
    operation.origins?.includes("checked_region_direct_copy_entry:25")
  );
  changedCall.origins = Object.freeze(["hostile:replacement"]);
  assert.equal(
    checkedRegionDirectCallEmission(
      changedEntry, changedCall, changedFunctions,
    ),
    undefined,
  );

  const hostileMutations = [
    (operation) => {
      const claim = structuredClone(
        operation.checkedRegionGuardedDirectCallProof,
      );
      claim.guard[0].maximum = "7";
      operation.checkedRegionGuardedDirectCallProof = claim;
    },
    (operation) => {
      const claim = structuredClone(
        operation.checkedRegionGuardedDirectCallProof,
      );
      claim.fullGuard[1].maximum = "7";
      operation.checkedRegionGuardedDirectCallProof = claim;
    },
    (operation) => {
      const claim = structuredClone(
        operation.checkedRegionGuardedDirectCallProof,
      );
      claim.parameters[1].argument = claim.parameters[2].argument;
      operation.checkedRegionGuardedDirectCallProof = claim;
    },
    (operation) => {
      operation.function = "hostile_fallback";
    },
    (operation) => {
      operation.target = undefined;
    },
    (operation) => {
      operation.returnType = "uint64";
    },
  ];
  for (const mutate of hostileMutations) {
    const hostile = await witness();
    installCheckedRegionDeclarations(hostile, [guardedDirectCopyDeclaration]);
    const [hostileRegion] = prepareCheckedRegions(hostile);
    const hostileEntry = hostileRegion.variants.find(fn =>
      fn.checkedRegionVariant.original === "checked_region_direct_copy_entry"
    );
    const hostileFunctions = new Map(hostileRegion.variants.map(fn => [
      fn.name, fn,
    ]));
    const hostileCall = hostileEntry.body.find(operation =>
      operation.origins?.includes("checked_region_direct_copy_entry:25")
    );
    mutate(hostileCall);
    assert.equal(
      checkedRegionDirectCallEmission(
        hostileEntry, hostileCall, hostileFunctions,
      ),
      undefined,
    );
  }

  const changedDirectGuard = await witness();
  installCheckedRegionDeclarations(
    changedDirectGuard, [guardedDirectCopyDeclaration],
  );
  const [directGuardRegion] = prepareCheckedRegions(changedDirectGuard);
  const directGuardEntry = directGuardRegion.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_direct_copy_entry"
  );
  const directGuardFast = directGuardRegion.variants.find(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  );
  const directGuardFunctions = new Map(directGuardRegion.variants.map(fn => [
    fn.name, fn,
  ]));
  const directGuardCall = directGuardEntry.body.find(operation =>
    operation.origins?.includes("checked_region_direct_copy_entry:25")
  );
  const directReturn = directGuardFast.body.at(-1);
  const changedResultClaim = structuredClone(
    directReturn.checkedRegionDirectResultProof,
  );
  changedResultClaim.fullGuard[1].maximum = "7";
  directReturn.checkedRegionDirectResultProof = changedResultClaim;
  assert.equal(checkedRegionDirectResultEmission(directGuardFast), undefined);
  assert.equal(
    checkedRegionDirectCallEmission(
      directGuardEntry, directGuardCall, directGuardFunctions,
    ),
    undefined,
  );

  const wrongEdge = structuredClone(guardedDirectCopyDeclaration);
  wrongEdge.localVariants[0].edges[0].operationOrigin = "missing:operation";
  const unmatched = await witness();
  installCheckedRegionDeclarations(unmatched, [wrongEdge]);
  assert.throws(
    () => prepareCheckedRegions(unmatched),
    /guarded direct edge missing:operation matched 0 calls/,
  );

  const duplicateResolution = await witness();
  const duplicateEntry = duplicateResolution.functions.find(fn =>
    fn.name === "checked_region_direct_copy_entry"
  );
  const duplicateCall = duplicateEntry.body.find(operation =>
    operation.id === "checked_region_direct_copy_entry:25"
  );
  duplicateCall.origins = Object.freeze([
    duplicateCall.id,
    "checked_region_direct_copy_entry:25:alias",
  ]);
  const duplicateDeclaration = structuredClone(guardedDirectCopyDeclaration);
  duplicateDeclaration.localVariants[0].edges.push({
    operationOrigin: "checked_region_direct_copy_entry:25:alias",
  });
  installCheckedRegionDeclarations(
    duplicateResolution, [duplicateDeclaration],
  );
  assert.throws(
    () => prepareCheckedRegions(duplicateResolution),
    /guarded direct edges resolve to the same call/,
  );

  for (const [operationOrigin, mutate] of [
    ["checked_region_direct_copy_entry:13", (operation) => {
      operation.results = [];
    }],
    ["checked_region_direct_copy_entry:25", (operation) => {
      operation.target = "sentinel_value";
    }],
  ]) {
    const malformed = await witness();
    const malformedOriginal = malformed.functions.find(fn =>
      fn.name === "checked_region_direct_copy_entry"
    );
    mutate(malformedOriginal.body.find(operation =>
      operation.id === operationOrigin
    ));
    installCheckedRegionDeclarations(
      malformed, [guardedDirectCopyDeclaration],
    );
    const [malformedRegion] = prepareCheckedRegions(malformed);
    const malformedEntry = malformedRegion.variants.find(fn =>
      fn.checkedRegionVariant.original === "checked_region_direct_copy_entry"
    );
    const malformedFunctions = new Map(malformedRegion.variants.map(fn => [
      fn.name, fn,
    ]));
    const malformedCall = malformedEntry.body.find(operation =>
      operation.origins?.includes(operationOrigin)
    );
    assert.equal(
      checkedRegionDirectCallEmission(
        malformedEntry, malformedCall, malformedFunctions,
      ),
      undefined,
    );
  }

  const portable = structuredClone(await witness());
  installCheckedRegionDeclarations(portable, [guardedDirectCopyDeclaration]);
  const serialized = structuredClone(portable);
  assert.deepEqual(prepareCheckedRegions(serialized), []);
});

test("raising comparisons refine direct-call facts across immutable ranges", async () => {
  const prepared = await witness();
  installCheckedRegionDeclarations(prepared, [refinedDirectCopyDeclaration]);
  const [region] = prepareCheckedRegions(prepared);
  const entry = region.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_refined_copy_entry"
  );
  const functions = new Map(region.variants.map(fn => [fn.name, fn]));
  const call = entry.body.find(operation => operation.kind === "native.call");
  assert.ok(call);
  assert.ok(checkedRegionDirectCallEmission(entry, call, functions));
  const loop = entry.body.find(operation => operation.kind === "loop.range_int64");
  assert.ok(loop);
  assert.equal(loop.body.filter(operation =>
    ["uint64.buffer.get", "uint64.buffer.set"].includes(operation.kind) &&
    isCheckedRegionBufferAccess(operation)
  ).length, 2);

  const core = generateHostCore(prepared, { moduleIdentity: "0123456789abcdef" });
  assert.equal((core.source.match(/= sagejs_direct_.*local_copy_helper/g) || []).length, 1);

  const reversed = await witness();
  const reversedEntry = reversed.functions.find(fn =>
    fn.name === "checked_region_refined_copy_entry"
  );
  const reversedGuards = reversedEntry.body.filter(operation =>
    operation.kind === "if"
  ).slice(0, 2);
  for (const guard of reversedGuards) {
    const comparison = guard.condition.operations.find(operation =>
      operation.kind === "int64.compare"
    );
    [comparison.left, comparison.right] = [comparison.right, comparison.left];
    comparison.operation = comparison.operation === "lt" ? "gt" : "lt";
  }
  installCheckedRegionDeclarations(reversed, [refinedDirectCopyDeclaration]);
  const [reversedRegion] = prepareCheckedRegions(reversed);
  const reversedPreparedEntry = reversedRegion.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_refined_copy_entry"
  );
  const reversedFunctions = new Map(reversedRegion.variants.map(fn => [fn.name, fn]));
  const reversedCall = reversedPreparedEntry.body.find(operation =>
    operation.kind === "native.call"
  );
  assert.ok(checkedRegionDirectCallEmission(
    reversedPreparedEntry, reversedCall, reversedFunctions,
  ));

  for (const [relation, raiseInAlternative] of [["ne", false], ["eq", true]]) {
    const equality = await witness();
    const equalityEntry = equality.functions.find(fn =>
      fn.name === "checked_region_refined_copy_entry"
    );
    const guards = equalityEntry.body.filter(operation => operation.kind === "if");
    const comparison = guards[1].condition.operations.find(operation =>
      operation.kind === "int64.compare"
    );
    comparison.operation = relation;
    if (raiseInAlternative) {
      guards[1].alternative = guards[1].body;
      guards[1].body = [];
    }
    equalityEntry.body.splice(equalityEntry.body.indexOf(guards[0]), 1);
    equalityEntry.locals.push({ name: "equality_value", type: "uint64" });
    const equalityCallIndex = equalityEntry.body.findIndex(operation =>
      operation.kind === "native.call"
    );
    equalityEntry.body.splice(equalityCallIndex, 0, {
      kind: "uint64.buffer.get",
      buffer: "storage",
      bufferType: "UInt64Buffer",
      index: "degree",
      indexType: "int64",
      target: "equality_value",
      id: `checked_region_refined_copy_entry:equality-${relation}`,
    });
    installCheckedRegionDeclarations(equality, [refinedDirectCopyDeclaration]);
    const [equalityRegion] = prepareCheckedRegions(equality);
    const equalityPreparedEntry = equalityRegion.variants.find(fn =>
      fn.checkedRegionVariant.original === "checked_region_refined_copy_entry"
    );
    const equalityAccess = equalityPreparedEntry.body.find(operation =>
      operation.id.endsWith(`:equality-${relation}`)
    );
    assert.ok(isCheckedRegionBufferAccess(equalityAccess), relation);
  }

  const nonRaising = await witness();
  const nonRaisingEntry = nonRaising.functions.find(fn =>
    fn.name === "checked_region_refined_copy_entry"
  );
  nonRaisingEntry.body.find(operation => operation.kind === "if").body = [];
  installCheckedRegionDeclarations(nonRaising, [refinedDirectCopyDeclaration]);
  const [nonRaisingRegion] = prepareCheckedRegions(nonRaising);
  assert.equal(nonRaisingRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  const returnBeforeRaise = await witness();
  const returningEntry = returnBeforeRaise.functions.find(fn =>
    fn.name === "checked_region_refined_copy_entry"
  );
  returningEntry.body.find(operation => operation.kind === "if").body.unshift({
    kind: "return",
    value: "degree",
    type: "int64",
    id: "checked_region_refined_copy_entry:hostile-early-return",
  });
  installCheckedRegionDeclarations(
    returnBeforeRaise, [refinedDirectCopyDeclaration],
  );
  const [returningRegion] = prepareCheckedRegions(returnBeforeRaise);
  // The early-return arm does not reach the later copy. Its false successor
  // still carries the comparison refinement and is safe to specialize.
  assert.equal(returningRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), true);

  const unknownOperand = await witness();
  const unknownEntry = unknownOperand.functions.find(fn =>
    fn.name === "checked_region_refined_copy_entry"
  );
  const unknownCondition = unknownEntry.body.find(operation =>
    operation.kind === "if"
  ).condition;
  unknownCondition.operations = unknownCondition.operations.filter(operation =>
    operation.kind !== "int64.constant"
  );
  installCheckedRegionDeclarations(unknownOperand, [refinedDirectCopyDeclaration]);
  let unknownRegion;
  assert.doesNotThrow(() => {
    [unknownRegion] = prepareCheckedRegions(unknownOperand);
  });
  assert.equal(unknownRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  const overwrittenCondition = await witness();
  const overwrittenEntry = overwrittenCondition.functions.find(fn =>
    fn.name === "checked_region_refined_copy_entry"
  );
  const overwrittenGuard = overwrittenEntry.body.find(operation =>
    operation.kind === "if"
  );
  overwrittenGuard.condition.operations.push({
    kind: "int64.constant",
    target: overwrittenGuard.condition.value,
    value: "0",
    id: "checked_region_refined_copy_entry:hostile-condition-overwrite",
  });
  installCheckedRegionDeclarations(
    overwrittenCondition, [refinedDirectCopyDeclaration],
  );
  const [overwrittenRegion] = prepareCheckedRegions(overwrittenCondition);
  assert.equal(overwrittenRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  const mixedComparison = await witness();
  const mixedEntry = mixedComparison.functions.find(fn =>
    fn.name === "checked_region_refined_copy_entry"
  );
  const mixedGuard = mixedEntry.body.filter(operation =>
    operation.kind === "if"
  )[1];
  const mixedConstant = mixedGuard.condition.operations.find(operation =>
    operation.kind === "int64.constant"
  );
  const mixedCompare = mixedGuard.condition.operations.find(operation =>
    operation.kind === "int64.compare"
  );
  mixedConstant.kind = "uint64.constant";
  mixedCompare.kind = "uint64.compare";
  mixedEntry.locals.find(local => local.name === mixedConstant.target).type = "uint64";
  installCheckedRegionDeclarations(
    mixedComparison, [refinedDirectCopyDeclaration],
  );
  const [mixedRegion] = prepareCheckedRegions(mixedComparison);
  assert.equal(mixedRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  const nonBooleanCondition = await witness();
  const nonBooleanEntry = nonBooleanCondition.functions.find(fn =>
    fn.name === "checked_region_refined_copy_entry"
  );
  const nonBooleanGuard = nonBooleanEntry.body.find(operation =>
    operation.kind === "if"
  );
  nonBooleanEntry.locals.find(local =>
    local.name === nonBooleanGuard.condition.value
  ).type = "int64";
  installCheckedRegionDeclarations(
    nonBooleanCondition, [refinedDirectCopyDeclaration],
  );
  const [nonBooleanRegion] = prepareCheckedRegions(nonBooleanCondition);
  assert.equal(nonBooleanRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  for (const [guardIndex, boundary] of [
    [0, "-9223372036854775808"],
    [1, "9223372036854775807"],
  ]) {
    const endpoint = await witness();
    const endpointEntry = endpoint.functions.find(fn =>
      fn.name === "checked_region_refined_copy_entry"
    );
    const endpointGuard = endpointEntry.body.filter(operation =>
      operation.kind === "if"
    )[guardIndex];
    endpointGuard.condition.operations.find(operation =>
      operation.kind === "int64.constant"
    ).value = boundary;
    const endpointDeclaration = structuredClone(refinedDirectCopyDeclaration);
    endpointDeclaration.guard[1].minimum = "-9223372036854775808";
    endpointDeclaration.guard[1].maximum = "9223372036854775807";
    installCheckedRegionDeclarations(endpoint, [endpointDeclaration]);
    const [endpointRegion] = prepareCheckedRegions(endpoint);
    assert.equal(endpointRegion.variants.some(fn =>
      checkedRegionDirectResultEmission(fn) !== undefined
    ), false, boundary);
  }

  const mutatedRange = await witness();
  const mutatedEntry = mutatedRange.functions.find(fn =>
    fn.name === "checked_region_refined_copy_entry"
  );
  const mutatedLoop = mutatedEntry.body.find(operation =>
    operation.kind === "loop.range_int64"
  );
  mutatedLoop.body.unshift({
    kind: "int64.constant",
    target: "degree",
    value: "9",
    id: `${mutatedLoop.id}:hostile-degree-write`,
  });
  installCheckedRegionDeclarations(mutatedRange, [refinedDirectCopyDeclaration]);
  const [mutatedRegion] = prepareCheckedRegions(mutatedRange);
  assert.equal(mutatedRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  // The caller/callee authority binds the final condition graph. A mutation
  // after preparation cannot retain the direct edge.
  const preparedGuard = entry.body.find(operation => operation.kind === "if");
  preparedGuard.condition.operations.find(operation =>
    operation.kind === "int64.compare"
  ).operation = "ge";
  assert.equal(
    checkedRegionDirectCallEmission(entry, call, functions),
    undefined,
  );
});

test("false OR preflights refine typed domains with dominating literals", async () => {
  const directEmission = (ir) => {
    installCheckedRegionDeclarations(ir, [orRefinedDirectCopyDeclaration]);
    const [region] = prepareCheckedRegions(ir);
    const entry = region.variants.find(fn =>
      fn.checkedRegionVariant.original === "checked_region_or_refined_copy_entry"
    );
    const functions = new Map(region.variants.map(fn => [fn.name, fn]));
    const call = entry.body.find(operation => operation.kind === "native.call");
    assert.ok(call);
    return checkedRegionDirectCallEmission(entry, call, functions);
  };

  // `degree` has no scalar guard fact. Its declared int64 domain plus the
  // false successor of both OR comparisons establishes -1 <= degree <= 3.
  assert.ok(directEmission(await witness()));

  const reorderRightLiteral = async () => {
    const ir = await witness();
    const entry = ir.functions.find(fn =>
      fn.name === "checked_region_or_refined_copy_entry"
    );
    const condition = entry.body.find(operation => operation.kind === "if")
      .condition;
    const short = condition.operations.find(operation =>
      operation.kind === "bool.short_circuit"
    );
    const operations = short.right.operations;
    const literal = operations.find(operation =>
      operation.kind === "int64.constant"
    );
    const comparison = operations.find(operation =>
      operation.kind === "int64.compare"
    );
    assert.ok(literal);
    assert.ok(comparison);
    operations.splice(operations.indexOf(literal), 1);
    operations.splice(operations.indexOf(comparison) + 1, 0, literal);
    return ir;
  };

  // A value produced after its comparison cannot authenticate that path.
  assert.equal(directEmission(await reorderRightLiteral()), undefined);

  const reorderedLeft = await witness();
  const reorderedLeftEntry = reorderedLeft.functions.find(fn =>
    fn.name === "checked_region_or_refined_copy_entry"
  );
  const reorderedLeftOperations = reorderedLeftEntry.body.find(operation =>
    operation.kind === "if"
  ).condition.operations;
  const reorderedLeftLiteral = reorderedLeftOperations.find(operation =>
    operation.kind === "int64.constant"
  );
  const reorderedLeftComparison = reorderedLeftOperations.find(operation =>
    operation.kind === "int64.compare"
  );
  reorderedLeftOperations.splice(
    reorderedLeftOperations.indexOf(reorderedLeftLiteral), 1,
  );
  reorderedLeftOperations.splice(
    reorderedLeftOperations.indexOf(reorderedLeftComparison) + 1,
    0,
    reorderedLeftLiteral,
  );
  assert.equal(directEmission(reorderedLeft), undefined);

  const colliding = await witness();
  const collidingEntry = colliding.functions.find(fn =>
    fn.name === "checked_region_or_refined_copy_entry"
  );
  const collidingCondition = collidingEntry.body.find(operation =>
    operation.kind === "if"
  ).condition;
  const collidingShort = collidingCondition.operations.find(operation =>
    operation.kind === "bool.short_circuit"
  );
  const collidingOperations = collidingShort.right.operations;
  const collidingLiteral = collidingOperations.find(operation =>
    operation.kind === "int64.constant"
  );
  const collidingComparison = collidingOperations.find(operation =>
    operation.kind === "int64.compare"
  );
  collidingOperations.splice(collidingOperations.indexOf(collidingComparison), 0, {
    ...collidingLiteral,
    id: `${collidingLiteral.id}:hostile-collision`,
  });
  // Even two individually dominating constants are ambiguous producers and
  // must not seed a summary-derived fact.
  assert.equal(directEmission(colliding), undefined);
});

test("successful scalar summaries propagate with transitive authority", async () => {
  const identity = await witness();
  installCheckedRegionDeclarations(identity, [identitySummaryDeclaration]);
  const [identityRegion] = prepareCheckedRegions(identity);
  const identityEntry = identityRegion.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_summary_entry"
  );
  const identityFunctions = new Map(
    identityRegion.variants.map(fn => [fn.name, fn]),
  );
  const identityDirect = identityEntry.body.find(operation =>
    operation.kind === "native.call" &&
    checkedRegionDirectCallEmission(
      identityEntry, operation, identityFunctions,
    ) !== undefined
  );
  assert.ok(identityDirect);
  assert.deepEqual(
    identityDirect.checkedRegionDirectCallProof.summaryDependencies.map(name =>
      identityFunctions.get(name).checkedRegionVariant.original
    ).sort(),
    ["checked_region_summary_identity", "checked_region_summary_wrapper"],
  );
  const identityOperations = [];
  const collectIdentityOperations = value => {
    if (value === null || typeof value !== "object") return;
    if (typeof value.kind === "string") identityOperations.push(value);
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance") collectIdentityOperations(child);
    }
  };
  collectIdentityOperations(identityEntry.body);
  const summaryArithmetic = identityOperations.find(operation =>
    operation.kind === "int64.binary" && operation.operation === "add" &&
    operation.left === "summarized"
  );
  const summaryRootAccess = identityOperations.find(operation =>
    operation.kind === "uint64.buffer.get" &&
    operation.buffer === "storage" && operation.index === "summarized"
  );
  const summaryViewAccess = identityOperations.find(operation =>
    operation.kind === "uint64.buffer.get" && operation.buffer === "view"
  );
  assert.ok(summaryArithmetic);
  assert.ok(summaryRootAccess);
  assert.ok(summaryViewAccess);
  assert.notEqual(
    summaryArithmetic.checkedRegionProof?.authority,
    "checked-region-int64-interval-v1",
  );
  assert.equal(isCheckedRegionBufferAccess(summaryRootAccess), false);
  assert.equal(
    checkedRegionVirtualUInt64Emission(identityEntry)
      .claim(summaryViewAccess, "access")?.logicalIndexProof,
    undefined,
  );
  assert.doesNotThrow(() => generateHostCore(identity));

  const identityHelper = identityRegion.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_summary_identity"
  );
  identityHelper.body.at(-1).value = "fail";
  assert.equal(checkedRegionDirectCallEmission(
    identityEntry, identityDirect, identityFunctions,
  ), undefined);
  assert.notEqual(
    summaryArithmetic.checkedRegionProof?.authority,
    "checked-region-int64-interval-v1",
  );
  assert.equal(isCheckedRegionBufferAccess(summaryRootAccess), false);
  assert.equal(
    checkedRegionVirtualUInt64Emission(identityEntry)
      .claim(summaryViewAccess, "access")?.logicalIndexProof,
    undefined,
  );
  assert.doesNotThrow(() => generateHostCore(identity));

  // A summarized start flows through a second private call before constructing
  // this fixed-length view.  The complete private graph authenticates the
  // transitive root/start facts, while element bounds remain independently
  // checked because no logical-index proof was established.
  const transitiveView = await witness();
  installCheckedRegionDeclarations(
    transitiveView, [transitiveSummaryViewDeclaration],
  );
  const [transitiveRegion] = prepareCheckedRegions(transitiveView);
  const transitiveHelper = transitiveRegion.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_summary_view_helper"
  );
  const transitiveFunctions = new Map(
    transitiveRegion.variants.map(fn => [fn.name, fn]),
  );
  const transitiveViewOperation = transitiveHelper.body.find(operation =>
    operation.kind === "uint64.buffer.view"
  );
  const transitiveAccess = transitiveHelper.body.find(operation =>
    operation.kind === "uint64.buffer.get"
  );
  const transitiveEmission = checkedRegionVirtualUInt64Emission(
    transitiveHelper,
    transitiveFunctions,
  );
  assert.equal(
    transitiveEmission.claim(transitiveViewOperation, "view")?.mode,
    "fixed",
  );
  const transitiveAccessClaim = transitiveEmission.claim(
    transitiveAccess, "access",
  );
  assert.equal(transitiveAccessClaim?.mode, "fixed");
  assert.equal(transitiveAccessClaim?.logicalIndexProof, undefined);
  const transitiveSource = generateHostCore(transitiveView).source;
  const transitiveBody = functionText(transitiveSource, transitiveHelper.name);
  assert.doesNotMatch(transitiveBody, /UInt64Buffer view is outside its buffer/);
  assert.match(transitiveBody, /UInt64Buffer index out of range/);
  const transitiveIdentity = transitiveRegion.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_summary_identity"
  );
  transitiveIdentity.body.at(-1).value = "fail";
  assert.equal(
    checkedRegionVirtualUInt64Emission(
      transitiveHelper,
      transitiveFunctions,
    ).claim(transitiveViewOperation, "view"),
    undefined,
  );
  assert.equal(
    transitiveEmission.claim(transitiveAccess, "access")?.logicalIndexProof,
    undefined,
  );
  assert.doesNotThrow(() => generateHostCore(transitiveView));

  const interval = await witness();
  installCheckedRegionDeclarations(interval, [intervalSummaryDeclaration]);
  const [intervalRegion] = prepareCheckedRegions(interval);
  const intervalEntry = intervalRegion.variants.find(fn =>
    fn.checkedRegionVariant.original ===
      "checked_region_summary_interval_entry"
  );
  const intervalFunctions = new Map(
    intervalRegion.variants.map(fn => [fn.name, fn]),
  );
  assert.ok(intervalEntry.body.find(operation =>
    operation.kind === "native.call" &&
    checkedRegionDirectCallEmission(
      intervalEntry, operation, intervalFunctions,
    ) !== undefined
  ));

  const incompatibleReturn = await witness();
  const incompatibleInterval = incompatibleReturn.functions.find(fn =>
    fn.name === "checked_region_summary_interval"
  );
  const incompatibleReturns = [];
  const collectReturns = value => {
    if (value === null || typeof value !== "object") return;
    if (value.kind === "return") incompatibleReturns.push(value);
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance") collectReturns(child);
    }
  };
  collectReturns(incompatibleInterval.body);
  incompatibleReturns[1].type = "uint64";
  installCheckedRegionDeclarations(
    incompatibleReturn, [intervalSummaryDeclaration],
  );
  const [incompatibleRegion] = prepareCheckedRegions(incompatibleReturn);
  assert.equal(incompatibleRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  const overflow = await witness();
  const overflowIdentity = overflow.functions.find(fn =>
    fn.name === "checked_region_summary_identity"
  );
  overflowIdentity.locals.push(
    { name: "summary_one", type: "int64" },
    { name: "summary_sum", type: "int64" },
  );
  const overflowReturn = overflowIdentity.body.at(-1);
  overflowIdentity.body.splice(-1, 0,
    {
      kind: "int64.constant",
      target: "summary_one",
      value: "1",
      id: "checked_region_summary_identity:hostile-one",
    },
    {
      kind: "int64.binary",
      operation: "add",
      left: "value",
      right: "summary_one",
      target: "summary_sum",
      id: "checked_region_summary_identity:hostile-overflow",
    },
  );
  overflowReturn.value = "summary_sum";
  installCheckedRegionDeclarations(overflow, [identitySummaryDeclaration]);
  const [overflowRegion] = prepareCheckedRegions(overflow);
  assert.equal(overflowRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  const missingReturn = await witness();
  const missingIdentity = missingReturn.functions.find(fn =>
    fn.name === "checked_region_summary_identity"
  );
  missingIdentity.body.pop();
  installCheckedRegionDeclarations(missingReturn, [identitySummaryDeclaration]);
  const [missingRegion] = prepareCheckedRegions(missingReturn);
  assert.equal(missingRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  const wrongTarget = await witness();
  const wrongEntry = wrongTarget.functions.find(fn =>
    fn.name === "checked_region_summary_entry"
  );
  const summaryCall = wrongEntry.body.find(operation =>
    operation.kind === "native.call" &&
    operation.function === "checked_region_summary_wrapper"
  );
  wrongEntry.locals.find(local => local.name === summaryCall.target).type = "uint64";
  installCheckedRegionDeclarations(wrongTarget, [identitySummaryDeclaration]);
  const [wrongRegion] = prepareCheckedRegions(wrongTarget);
  assert.equal(wrongRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  const wrongArgument = await witness();
  const wrongArgumentEntry = wrongArgument.functions.find(fn =>
    fn.name === "checked_region_summary_entry"
  );
  wrongArgumentEntry.body.find(operation =>
    operation.kind === "native.call" &&
    operation.function === "checked_region_summary_wrapper"
  ).arguments[0].type = "uint64";
  installCheckedRegionDeclarations(wrongArgument, [identitySummaryDeclaration]);
  assert.throws(
    () => prepareCheckedRegions(wrongArgument),
    /invalid argument 0/,
  );

  const recursive = await witness();
  const recursiveWrapper = recursive.functions.find(fn =>
    fn.name === "checked_region_summary_wrapper"
  );
  recursiveWrapper.body.find(operation =>
    operation.kind === "native.call"
  ).function = "checked_region_summary_wrapper";
  installCheckedRegionDeclarations(recursive, [identitySummaryDeclaration]);
  assert.throws(
    () => prepareCheckedRegions(recursive),
    /does not admit recursion/,
  );
});

test("case-wise affine summaries stabilize a bounded scalar while", async () => {
  const collectCalls = fn => {
    const calls = [];
    const visit = value => {
      if (value === null || typeof value !== "object") return;
      if (value.kind === "native.call") calls.push(value);
      for (const [key, child] of Object.entries(value)) {
        if (key !== "provenance") visit(child);
      }
    };
    visit(fn.body);
    return calls;
  };

  const ir = await witness();
  installCheckedRegionDeclarations(ir, [whileSummaryDeclaration]);
  const [region] = prepareCheckedRegions(ir);
  const entry = region.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_summary_while_entry"
  );
  const functions = new Map(region.variants.map(fn => [fn.name, fn]));
  const copyCalls = collectCalls(entry).filter(operation =>
    functions.get(operation.function)?.checkedRegionVariant?.original ===
      "checked_region_local_copy_helper"
  );
  assert.equal(copyCalls.length, 3);
  assert.equal(copyCalls.every(operation =>
    checkedRegionDirectCallEmission(entry, operation, functions) !== undefined
  ), true);
  assert.equal(copyCalls.every(operation =>
    operation.checkedRegionDirectCallProof.summaryDependencies.length > 0
  ), true);
  assert.deepEqual(new Set(copyCalls.flatMap(operation =>
    operation.checkedRegionDirectCallProof.summaryDependencies.map(name =>
      functions.get(name).checkedRegionVariant.original
    )
  )), new Set([
    "checked_region_local_copy_helper",
    "checked_region_summary_affine_multiply",
    "checked_region_summary_affine_remainder",
    "checked_region_summary_affine_square",
  ]));
  assert.doesNotThrow(() => generateHostCore(ir));

  // The graph authority covers both the case-wise successful-return theorem
  // and the scalar loop transfer. Mutating either after preparation revokes
  // every edge that consumed those facts.
  const remainder = region.variants.find(fn =>
    fn.checkedRegionVariant.original ===
      "checked_region_summary_affine_remainder"
  );
  const countdown = [];
  const collectCountdown = value => {
    if (value === null || typeof value !== "object") return;
    if (value.kind === "int64.binary" && value.target === "degree") {
      countdown.push(value);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance") collectCountdown(child);
    }
  };
  collectCountdown(remainder.body);
  countdown.at(-1).operation = "add";
  assert.equal(copyCalls.some(operation =>
    checkedRegionDirectCallEmission(entry, operation, functions) !== undefined
  ), false);
  assert.doesNotThrow(() => generateHostCore(ir));

  const hostile = await witness();
  const hostileEntry = hostile.functions.find(fn =>
    fn.name === "checked_region_summary_while_entry"
  );
  const hostileWhile = hostileEntry.body.find(operation =>
    operation.kind === "while"
  );
  hostileWhile.body.find(operation =>
    operation.kind === "int64.binary" && operation.target === "bit"
  ).operation = "add";
  installCheckedRegionDeclarations(hostile, [whileSummaryDeclaration]);
  const [hostileRegion] = prepareCheckedRegions(hostile);
  const hostilePreparedEntry = hostileRegion.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_summary_while_entry"
  );
  const hostileFunctions = new Map(
    hostileRegion.variants.map(fn => [fn.name, fn]),
  );
  assert.equal(collectCalls(hostilePreparedEntry).some(operation =>
    checkedRegionDirectCallEmission(
      hostilePreparedEntry, operation, hostileFunctions,
    ) !== undefined
  ), false);

  // A literal threshold must dominate its comparison. Hostile IR that reads
  // the temporary before its producer cannot inherit the loop theorem.
  const reordered = await witness();
  const reorderedEntry = reordered.functions.find(fn =>
    fn.name === "checked_region_summary_while_entry"
  );
  const reorderedCondition = reorderedEntry.body.find(operation =>
    operation.kind === "while"
  ).condition.operations;
  reorderedCondition.reverse();
  installCheckedRegionDeclarations(reordered, [whileSummaryDeclaration]);
  const [reorderedRegion] = prepareCheckedRegions(reordered);
  const reorderedPreparedEntry = reorderedRegion.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_summary_while_entry"
  );
  const reorderedFunctions = new Map(
    reorderedRegion.variants.map(fn => [fn.name, fn]),
  );
  assert.equal(collectCalls(reorderedPreparedEntry).some(operation =>
    checkedRegionDirectCallEmission(
      reorderedPreparedEntry, operation, reorderedFunctions,
    ) !== undefined
  ), false);

  // Buffer facts degrade only after three loop transfers through this alias
  // chain, later than the scalar interval stabilizes. Convergence must compare
  // every proof-relevant component, or the first-buffer copy would inherit a
  // stale eight-slot fact and become direct.
  const degrading = await witness();
  installCheckedRegionDeclarations(
    degrading, [degradingWhileSummaryDeclaration],
  );
  const [degradingRegion] = prepareCheckedRegions(degrading);
  const degradingEntry = degradingRegion.variants.find(fn =>
    fn.checkedRegionVariant.original ===
      "checked_region_summary_while_degrading_entry"
  );
  const degradingFunctions = new Map(
    degradingRegion.variants.map(fn => [fn.name, fn]),
  );
  const degradingCopy = collectCalls(degradingEntry).find(operation =>
    degradingFunctions.get(operation.function)?.checkedRegionVariant?.original ===
      "checked_region_local_copy_helper"
  );
  assert.ok(degradingCopy);
  assert.equal(checkedRegionDirectCallEmission(
    degradingEntry, degradingCopy, degradingFunctions,
  ), undefined);
});

test("unsupported while loops admit only immediate successful call chains", async () => {
  const collectCalls = fn => {
    const calls = [];
    const visit = value => {
      if (value === null || typeof value !== "object") return;
      if (value.kind === "native.call") calls.push(value);
      for (const [key, child] of Object.entries(value)) {
        if (key !== "provenance") visit(child);
      }
    };
    visit(fn.body);
    return calls;
  };
  const prepare = async (mutate = () => {}) => {
    const ir = await witness();
    mutate(ir);
    installCheckedRegionDeclarations(ir, [breakWhileSummaryDeclaration]);
    const [region] = prepareCheckedRegions(ir);
    const entry = region.variants.find(fn =>
      fn.checkedRegionVariant.original ===
        "checked_region_summary_break_while_entry"
    );
    const functions = new Map(region.variants.map(fn => [fn.name, fn]));
    const copies = collectCalls(entry).filter(operation =>
      functions.get(operation.function)?.checkedRegionVariant?.original ===
        "checked_region_local_copy_helper"
    );
    return { ir, region, entry, functions, copies };
  };

  const prepared = await prepare();
  assert.equal(prepared.copies.length, 3);
  const emissions = prepared.copies.map(operation =>
    checkedRegionDirectCallEmission(
      prepared.entry, operation, prepared.functions,
    )
  );
  assert.equal(emissions[0] !== undefined, true);
  assert.equal(emissions[1] !== undefined, true);
  assert.equal(emissions[2], undefined);
  for (const operation of prepared.copies.slice(0, 2)) {
    const proof = operation.checkedRegionDirectCallProof.localSuccessProof;
    assert.equal(
      proof.authority,
      "checked-region-unsupported-loop-local-success-v1",
    );
    assert.equal(typeof proof.loop, "string");
    assert.equal(typeof proof.producer, "string");
    assert.equal(proof.forwarders.length, 1);
    assert.equal(proof.consumer, operation.id);
    assert.ok(
      operation.checkedRegionDirectCallProof.summaryDependencies.length > 0,
    );
  }
  assert.doesNotThrow(() => generateHostCore(prepared.ir));

  // The caller snapshot authenticates the forwarding chain. Rewriting its
  // source after authorization must revoke the direct edge.
  const forwarded = prepared.entry.body.find(operation =>
    operation.kind === "while"
  ).body.find(operation => operation.kind === "int64.copy");
  forwarded.source = "degree";
  assert.equal(prepared.copies.some(operation =>
    checkedRegionDirectCallEmission(
      prepared.entry, operation, prepared.functions,
    ) !== undefined
  ), false);

  // A broken forwarding chain is never authorized when first analyzed.
  const hostile = await prepare(ir => {
    const entry = ir.functions.find(fn =>
      fn.name === "checked_region_summary_break_while_entry"
    );
    const loop = entry.body.find(operation => operation.kind === "while");
    loop.body.find(operation => operation.kind === "int64.copy").source =
      "degree";
  });
  assert.equal(checkedRegionDirectCallEmission(
    hostile.entry, hostile.copies[0], hostile.functions,
  ), undefined);
  assert.notEqual(checkedRegionDirectCallEmission(
    hostile.entry, hostile.copies[1], hostile.functions,
  ), undefined);
  assert.equal(checkedRegionDirectCallEmission(
    hostile.entry, hostile.copies[2], hostile.functions,
  ), undefined);

  // Even a later owner rebinding makes that owner non-invariant for an
  // arbitrary iteration, so no chain in the loop may inherit its entry fact.
  const rebound = await prepare(ir => {
    const entry = ir.functions.find(fn =>
      fn.name === "checked_region_summary_break_while_entry"
    );
    const loop = entry.body.find(operation => operation.kind === "while");
    loop.body.push({
      kind: "uint64.buffer.copy",
      target: "storage",
      source: "storage",
      id: "checked_region_summary_break_while_entry:hostile-storage-rebind",
      origins: [
        "checked_region_summary_break_while_entry:hostile-storage-rebind",
      ],
    });
  });
  assert.equal(rebound.copies.some(operation =>
    checkedRegionDirectCallEmission(
      rebound.entry, operation, rebound.functions,
    ) !== undefined
  ), false);

  // Successful-return dependencies are part of the edge authority. Mutating
  // the summarized producer after preparation revokes both local edges.
  const dependencyMutation = await prepare();
  const bounded = dependencyMutation.region.variants.find(fn =>
    fn.checkedRegionVariant.original ===
      "checked_region_summary_local_bounded"
  );
  const arithmetic = bounded.body.find(operation =>
    operation.kind === "int64.binary"
  );
  arithmetic.operation = "add";
  assert.equal(dependencyMutation.copies.some(operation =>
    checkedRegionDirectCallEmission(
      dependencyMutation.entry, operation, dependencyMutation.functions,
    ) !== undefined
  ), false);
});

test("scalar summaries reject under-approximated cases and mutable loops", async () => {
  const declarations = [
    partialOverflowSummaryDeclaration,
    recomputedThresholdSummaryDeclaration,
    nestedStepSummaryDeclaration,
  ];
  for (const declaration of declarations) {
    const ir = await witness();
    installCheckedRegionDeclarations(ir, [declaration]);
    const [region] = prepareCheckedRegions(ir);
    const entry = region.variants.find(fn =>
      fn.checkedRegionVariant.original === declaration.entry
    );
    const functions = new Map(region.variants.map(fn => [fn.name, fn]));
    const calls = [];
    const visit = value => {
      if (value === null || typeof value !== "object") return;
      if (value.kind === "native.call") calls.push(value);
      for (const [key, child] of Object.entries(value)) {
        if (key !== "provenance") visit(child);
      }
    };
    visit(entry.body);
    const copy = calls.find(operation =>
      functions.get(operation.function)?.checkedRegionVariant?.original ===
        "checked_region_local_copy_helper"
    );
    assert.ok(copy, declaration.entry);
    assert.equal(
      checkedRegionDirectCallEmission(entry, copy, functions),
      undefined,
      declaration.entry,
    );
  }
});

test("direct-result authority revokes mutations and rejects unsafe shapes", async () => {
  const ir = await witness();
  installCheckedRegionDeclarations(ir, [directCopyDeclaration]);
  const [region] = prepareCheckedRegions(ir);
  const entry = region.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_direct_copy_entry"
  );
  const fast = region.variants.find(fn =>
    fn.name.includes("checked_region_local_copy_helper__local_fast_0")
  );
  const functions = new Map(region.variants.map(fn => [fn.name, fn]));
  const calls = entry.body.filter(operation => operation.kind === "native.call");
  assert.equal(calls.filter(operation =>
    checkedRegionDirectCallEmission(entry, operation, functions)
  ).length, 3);

  calls[0].arguments[1].name = calls[0].arguments[2].name;
  assert.equal(checkedRegionDirectCallEmission(entry, calls[0], functions), undefined);
  const loop = fast.body.find(operation => operation.kind === "if")
    .body.find(operation => operation.kind === "loop.range_int64");
  loop.incrementProof = { authority: "hostile", operation: loop.id };
  assert.ok(checkedRegionDirectResultEmission(fast));
  const core = generateHostCore(ir);
  const directBody = directFunctionText(core.source, fast.name);
  assert.match(directBody, /sagejs_word_add_int64/);
  assert.doesNotMatch(directBody, /\+=/);

  fast.params[1].type = "uint64";
  assert.equal(checkedRegionDirectResultEmission(fast), undefined);
  assert.equal(checkedRegionDirectCallEmission(entry, calls[1], functions), undefined);
  assert.doesNotThrow(() => generateHostCore(ir));

  const changedTarget = await witness();
  installCheckedRegionDeclarations(changedTarget, [directCopyDeclaration]);
  const [targetRegion] = prepareCheckedRegions(changedTarget);
  const targetEntry = targetRegion.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_direct_copy_entry"
  );
  const targetFunctions = new Map(targetRegion.variants.map(fn => [fn.name, fn]));
  const targetCall = targetEntry.body.find(operation =>
    operation.kind === "native.call" &&
    checkedRegionDirectCallEmission(targetEntry, operation, targetFunctions)
  );
  targetCall.function = "checked_region_direct_zero_helper";
  assert.equal(
    checkedRegionDirectCallEmission(targetEntry, targetCall, targetFunctions),
    undefined,
  );

  const changedBody = await witness();
  installCheckedRegionDeclarations(changedBody, [directCopyDeclaration]);
  const [bodyRegion] = prepareCheckedRegions(changedBody);
  const bodyEntry = bodyRegion.variants.find(fn =>
    fn.checkedRegionVariant.original === "checked_region_direct_copy_entry"
  );
  const bodyFast = bodyRegion.variants.find(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  );
  const bodyFunctions = new Map(bodyRegion.variants.map(fn => [fn.name, fn]));
  bodyFast.body.at(-1).value = bodyFast.params[1].name;
  assert.equal(checkedRegionDirectResultEmission(bodyFast), undefined);
  assert.equal(bodyEntry.body.filter(operation => operation.kind === "native.call")
    .some(operation =>
      checkedRegionDirectCallEmission(bodyEntry, operation, bodyFunctions)
    ), false);
  assert.doesNotThrow(() => generateHostCore(changedBody));

  const noEdges = await witness();
  const noEdgeDeclaration = structuredClone(directCopyDeclaration);
  noEdgeDeclaration.guard[0].minimum = 0;
  installCheckedRegionDeclarations(noEdges, [noEdgeDeclaration]);
  const [noEdgeRegion] = prepareCheckedRegions(noEdges);
  assert.equal(noEdgeRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  const failedLeaf = await witness();
  const failedLeafDeclaration = structuredClone(directCopyDeclaration);
  failedLeafDeclaration.localVariants[0].capabilities = [];
  installCheckedRegionDeclarations(failedLeaf, [failedLeafDeclaration]);
  const [failedLeafRegion] = prepareCheckedRegions(failedLeaf);
  assert.equal(failedLeafRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  const buffer = await witness();
  const bufferHelper = buffer.functions.find(fn =>
    fn.name === "checked_region_direct_zero_helper"
  );
  bufferHelper.params = [{ name: "storage", type: "UInt64Buffer" }];
  bufferHelper.returnType = "UInt64Buffer";
  bufferHelper.locals = [];
  bufferHelper.body = [{
    kind: "return",
    value: "storage",
    type: "UInt64Buffer",
    id: "checked_region_direct_zero_helper:buffer-return",
  }];
  const bufferEntry = buffer.functions.find(fn =>
    fn.name === "checked_region_direct_zero_entry"
  );
  bufferEntry.params.push({ name: "storage", type: "UInt64Buffer" });
  bufferEntry.returnType = "UInt64Buffer";
  bufferEntry.locals[0].type = "UInt64Buffer";
  bufferEntry.body[0].returnType = "UInt64Buffer";
  bufferEntry.body[0].arguments = [{ name: "storage", type: "UInt64Buffer" }];
  bufferEntry.body[1].type = "UInt64Buffer";
  const bufferDeclaration = {
    entry: "checked_region_direct_zero_entry",
    functions: [
      "checked_region_direct_zero_entry",
      "checked_region_direct_zero_helper",
    ],
    capabilities: [],
    guard: [
      { kind: "int64-range", parameter: "dummy", minimum: 0, maximum: 0 },
    ],
    localVariants: [{
      function: "checked_region_direct_zero_helper",
      mode: "direct-result",
      guard: [],
      capabilities: [],
    }],
  };
  installCheckedRegionDeclarations(buffer, [bufferDeclaration]);
  const [bufferRegion] = prepareCheckedRegions(buffer);
  assert.equal(bufferRegion.variants.some(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  ), false);

  const zero = await witness();
  const zeroDeclaration = {
    entry: "checked_region_direct_zero_entry",
    functions: [
      "checked_region_direct_zero_entry",
      "checked_region_direct_zero_helper",
    ],
    capabilities: [],
    guard: [
      { kind: "int64-range", parameter: "dummy", minimum: 0, maximum: 0 },
    ],
    localVariants: [{
      function: "checked_region_direct_zero_helper",
      mode: "direct-result",
      guard: [],
      capabilities: [],
    }],
  };
  installCheckedRegionDeclarations(zero, [zeroDeclaration]);
  const [zeroRegion] = prepareCheckedRegions(zero);
  const zeroFast = zeroRegion.variants.find(fn =>
    checkedRegionDirectResultEmission(fn) !== undefined
  );
  assert.ok(zeroFast);
  const zeroCore = generateHostCore(zero);
  assert.match(zeroCore.source,
    new RegExp(`sagejs_direct_${zeroFast.name}\\(void\\)`));

  const forged = await witness();
  const forgedHelper = forged.functions.find(fn =>
    fn.name === "checked_region_local_copy_helper"
  );
  let forgedValidation;
  const findValidation = value => {
    if (value === null || typeof value !== "object" ||
        forgedValidation !== undefined) return;
    if (value.kind === "range.validate_step") {
      forgedValidation = value;
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance") findValidation(child);
    }
  };
  findValidation(forgedHelper.body);
  assert.ok(forgedValidation);
  forgedValidation.checkedRegionProof = Object.freeze({
    authority: "checked-region-nonzero-int64-step-v1",
    operation: forgedValidation.id,
    step: forgedValidation.step,
    minimum: "1",
    maximum: "1",
  });
  const forgedCore = generateHostCore(forged);
  const forgedBody = functionText(
    forgedCore.source, "checked_region_local_copy_helper",
  );
  assert.match(forgedBody, /range\(\) arg 3 must not be zero/);
});

test("local interval-view proofs fail closed under hostile IR changes", async () => {
  const tooWide = await witness();
  const wide = structuredClone(localCopyDeclaration);
  wide.localVariants[0].guard[0].maximum = 4;
  installCheckedRegionDeclarations(tooWide, [wide]);
  const [wideRegion] = prepareCheckedRegions(tooWide);
  const wideFast = wideRegion.variants.find(fn =>
    fn.checkedRegionLocalCapabilities?.includes("interval-view-access")
  );
  const wideCore = generateHostCore(tooWide);
  const wideBody = functionText(wideCore.source, wideFast.name);
  assert.match(wideBody, /UInt64Buffer index out of range/);

  const mutatedIterator = await witness();
  const original = mutatedIterator.functions.find(fn =>
    fn.name === "checked_region_local_copy_helper"
  );
  const firstLoop = original.body.find(operation => operation.kind === "if")
    .body.find(operation => operation.kind === "loop.range_int64");
  firstLoop.body.unshift({
    kind: "int64.constant",
    target: firstLoop.index,
    value: "0",
    id: `${firstLoop.id}:hostile-index-write`,
  });
  installCheckedRegionDeclarations(mutatedIterator, [localCopyDeclaration]);
  const [mutatedRegion] = prepareCheckedRegions(mutatedIterator);
  const mutatedFast = mutatedRegion.variants.find(fn =>
    fn.checkedRegionLocalCapabilities?.includes("interval-view-access")
  );
  const mutatedLoop = mutatedFast.body.find(operation => operation.kind === "if")
    .body.find(operation => operation.kind === "loop.range_int64");
  assert.equal(mutatedLoop.body.some(operation =>
    operation.checkedRegionVirtualUInt64ViewProof?.logicalIndexProof !== undefined
  ), false);

  const mutatedControl = await witness();
  const controlOriginal = mutatedControl.functions.find(fn =>
    fn.name === "checked_region_local_copy_helper"
  );
  const controlLoop = controlOriginal.body.find(operation =>
    operation.kind === "if"
  ).body.find(operation => operation.kind === "loop.range_int64");
  controlLoop.body.unshift({
    kind: "int64.constant",
    target: controlLoop.iterator,
    value: "0",
    id: `${controlLoop.id}:hostile-iterator-write`,
  });
  installCheckedRegionDeclarations(mutatedControl, [localCopyDeclaration]);
  const [controlRegion] = prepareCheckedRegions(mutatedControl);
  const controlFast = controlRegion.variants.find(fn =>
    fn.checkedRegionLocalCapabilities?.includes("interval-view-access")
  );
  const preparedControlLoop = controlFast.body.find(operation =>
    operation.kind === "if"
  ).body.find(operation => operation.kind === "loop.range_int64");
  assert.equal(preparedControlLoop.body.some(operation =>
    operation.checkedRegionVirtualUInt64ViewProof?.logicalIndexProof !== undefined
  ), false);

  const nonUnit = await witness();
  const nonUnitOriginal = nonUnit.functions.find(fn =>
    fn.name === "checked_region_local_copy_helper"
  );
  const nonUnitLoop = nonUnitOriginal.body.find(operation =>
    operation.kind === "if"
  ).body.find(operation => operation.kind === "loop.range_int64");
  nonUnitLoop.step = nonUnitLoop.start;
  installCheckedRegionDeclarations(nonUnit, [localCopyDeclaration]);
  const [nonUnitRegion] = prepareCheckedRegions(nonUnit);
  const nonUnitFast = nonUnitRegion.variants.find(fn =>
    fn.checkedRegionLocalCapabilities?.includes("interval-view-access")
  );
  const preparedNonUnitLoop = nonUnitFast.body.find(operation =>
    operation.kind === "if"
  ).body.find(operation => operation.kind === "loop.range_int64");
  assert.equal(preparedNonUnitLoop.body.some(operation =>
    operation.checkedRegionVirtualUInt64ViewProof?.logicalIndexProof !== undefined
  ), false);

  const postPrepare = await witness();
  installCheckedRegionDeclarations(postPrepare, [localCopyDeclaration]);
  const [postRegion] = prepareCheckedRegions(postPrepare);
  const postFast = postRegion.variants.find(fn =>
    fn.checkedRegionLocalCapabilities?.includes("interval-view-access")
  );
  const range = postFast.body.find(operation => operation.kind === "if")
    .body.find(operation => operation.kind === "loop.range_int64");
  range.stop = range.start;
  assert.equal(
    checkedRegionVirtualUInt64Emission(postFast).validatedViews().length,
    0,
  );
  const revokedCore = generateHostCore({
    version: postPrepare.version,
    records: postPrepare.records,
    functions: [...postPrepare.functions, postFast],
    foreignLibraries: postPrepare.foreignLibraries,
    callGraph: { ...postPrepare.callGraph, [postFast.name]: [] },
    nativeSourceDependencies: postPrepare.nativeSourceDependencies,
  });
  const revokedBody = functionText(revokedCore.source, postFast.name);
  assert.match(revokedBody, /UInt64Buffer index out of range/);
  assert.match(revokedBody, /sagejs_uint64_buffer sagejs_local_tagged_source/);

  for (const bad of [
    {
      ...structuredClone(localCopyDeclaration),
      localVariants: [{
        ...structuredClone(localCopyDeclaration.localVariants[0]),
        function: "missing",
      }],
    },
    {
      ...structuredClone(localCopyDeclaration),
      localVariants: [
        structuredClone(localCopyDeclaration.localVariants[0]),
        structuredClone(localCopyDeclaration.localVariants[0]),
      ],
    },
    {
      ...structuredClone(localCopyDeclaration),
      localVariants: [{
        ...structuredClone(localCopyDeclaration.localVariants[0]),
        capabilities: ["forged-capability"],
      }],
    },
  ]) {
    const malformed = await witness();
    installCheckedRegionDeclarations(malformed, [bad]);
    assert.throws(() => prepareCheckedRegions(malformed), /local variant/);
  }
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

test("authenticated private unit ranges elide normal and continue latch checks", async () => {
  const ir = await witness();
  installCheckedRegionDeclarations(ir, [unitRangeDeclaration]);
  const [region] = prepareCheckedRegions(ir);
  const fn = region.variants.find(candidate =>
    candidate.checkedRegionVariant?.original === unitRangeDeclaration.entry
  );
  const functions = new Map(region.variants.map(candidate => [
    candidate.name, candidate,
  ]));
  const ranges = [];
  const visit = value => {
    if (value === null || typeof value !== "object") return;
    if (value.kind === "loop.range_int64" && Array.isArray(value.body)) {
      ranges.push(value);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance") visit(child);
    }
  };
  visit(fn.body);
  assert.equal(ranges.length, 2);
  const emission = checkedRegionInt64RangeIncrementEmission(fn, functions);
  assert.ok(ranges.every(range => emission.isAuthorized(range)));
  assert.deepEqual(
    ranges.map(range => range.checkedRegionRangeIncrementProof.unitStep).sort(),
    ["-1", "1"],
  );

  const source = generateHostCore(ir).source;
  const optimized = executableText(functionText(source, fn.name));
  assert.doesNotMatch(optimized, /sagejs_word_add_int64/);
  assert.equal((optimized.match(/\+=/g) || []).length, 4);
  const fallback = executableText(functionText(
    source,
    "sagejs_checked_fallback_checked_region_unit_range_entry",
  ));
  assert.ok((fallback.match(/sagejs_word_add_int64/g) || []).length >= 4);
});

test("authenticated unit range latches work in direct-result clones", async () => {
  const declaration = structuredClone(directCopyDeclaration);
  declaration.localVariants[0].capabilities.push("int64-range-induction");
  const ir = await witness();
  installCheckedRegionDeclarations(ir, [declaration]);
  const [region] = prepareCheckedRegions(ir);
  const fast = region.variants.find(fn =>
    fn.name.includes("checked_region_local_copy_helper__local_fast_0")
  );
  assert.ok(checkedRegionDirectResultEmission(fast));
  const functions = new Map(region.variants.map(fn => [fn.name, fn]));
  const emission = checkedRegionInt64RangeIncrementEmission(fast, functions);
  const ranges = [];
  const visit = value => {
    if (value === null || typeof value !== "object") return;
    if (value.kind === "loop.range_int64" && Array.isArray(value.body)) {
      ranges.push(value);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance") visit(child);
    }
  };
  visit(fast.body);
  assert.equal(ranges.length, 3);
  assert.ok(ranges.every(range => emission.isAuthorized(range)));
  const direct = executableText(directFunctionText(
    generateHostCore(ir).source, fast.name,
  ));
  assert.doesNotMatch(direct, /sagejs_word_add_int64/);
});

test("unit latches are independent of source indices and nested index reuse", async () => {
  const indexWrite = {
    entry: "checked_region_unit_range_index_write_entry",
    functions: ["checked_region_unit_range_index_write_entry"],
    capabilities: ["int64-range-induction"],
    guard: [{
      kind: "int64-range",
      parameter: "start",
      minimum: "-9223372036854775808",
      maximum: "9223372036854775807",
    }],
  };
  const nested = {
    entry: "checked_region_nested_unit_range_entry",
    functions: ["checked_region_nested_unit_range_entry"],
    capabilities: ["int64-range-induction"],
    guard: [{
      kind: "int64-range", parameter: "outer_stop", minimum: 0, maximum: 3,
    }],
  };
  const ir = await witness();
  installCheckedRegionDeclarations(ir, [indexWrite, nested]);
  const regions = prepareCheckedRegions(ir);
  for (const region of regions) {
    const fn = region.variants.find(candidate =>
      candidate.name === region.variantEntry
    );
    const functions = new Map(region.variants.map(candidate => [
      candidate.name, candidate,
    ]));
    const ranges = [];
    const visit = value => {
      if (value === null || typeof value !== "object") return;
      if (value.kind === "loop.range_int64" && Array.isArray(value.body)) {
        ranges.push(value);
      }
      for (const [key, child] of Object.entries(value)) {
        if (key !== "provenance") visit(child);
      }
    };
    visit(fn.body);
    assert.ok(ranges.length >= 1);
    const emission = checkedRegionInt64RangeIncrementEmission(fn, functions);
    assert.ok(ranges.every(range => emission.isAuthorized(range)));
    const body = executableText(functionText(
      generateHostCore(ir).source, fn.name,
    ));
    assert.doesNotMatch(body, /sagejs_word_add_int64/);
  }
});

test("private unit range authority rejects forged and stale loop shapes", async () => {
  async function prepared(declaration = unitRangeDeclaration) {
    const ir = await witness();
    installCheckedRegionDeclarations(ir, [declaration]);
    const [region] = prepareCheckedRegions(ir);
    const fn = region.variants.find(candidate =>
      candidate.checkedRegionVariant?.original === unitRangeDeclaration.entry
    );
    const functions = new Map(region.variants.map(candidate => [
      candidate.name, candidate,
    ]));
    const ranges = [];
    const continues = [];
    const visit = value => {
      if (value === null || typeof value !== "object") return;
      if (value.kind === "loop.range_int64" && Array.isArray(value.body)) {
        ranges.push(value);
      }
      if (value.kind === "loop.continue") continues.push(value);
      for (const [key, child] of Object.entries(value)) {
        if (key !== "provenance") visit(child);
      }
    };
    visit(fn.body);
    return { ir, fn, functions, ranges, continues };
  }

  function emittedVariant(state) {
    return generateTaggedFunctions(
      [state.fn], { functions: [...state.functions.values()] },
    ).functions;
  }

  const noCapability = structuredClone(unitRangeDeclaration);
  noCapability.capabilities = [];
  const forged = await prepared(noCapability);
  forged.ranges[0].checkedRegionRangeIncrementProof = {
    authority: "checked-region-int64-unit-range-increment-v1",
    operation: forged.ranges[0].id,
    index: forged.ranges[0].index,
    iterator: forged.ranges[0].iterator,
    start: forged.ranges[0].start,
    stop: forged.ranges[0].stop,
    step: forged.ranges[0].step,
    direction: "positive",
    unitStep: "1",
  };
  forged.ranges[0].incrementProof = { authority: "hostile" };
  forged.continues[0].range.incrementProof = { authority: "hostile" };
  assert.equal(
    checkedRegionInt64RangeIncrementEmission(
      forged.fn, forged.functions,
    ).isAuthorized(forged.ranges[0]),
    false,
  );
  assert.match(emittedVariant(forged), /sagejs_word_add_int64/);

  const mutations = [
    state => { state.ranges[0].stop = state.ranges[0].start; },
    state => { state.ranges[0].step = state.ranges[0].start; },
    state => { state.ranges[0].iterator = state.ranges[0].index; },
    state => { state.continues[0].range.step = state.ranges[0].start; },
    state => {
      state.ranges[0].body.unshift({
        kind: "int64.copy",
        target: state.ranges[0].iterator,
        source: state.ranges[0].start,
      });
    },
  ];
  for (const mutate of mutations) {
    const stale = await prepared();
    assert.ok(checkedRegionInt64RangeIncrementEmission(
      stale.fn, stale.functions,
    ).isAuthorized(stale.ranges[0]));
    mutate(stale);
    assert.ok(stale.ranges.every(range =>
      !checkedRegionInt64RangeIncrementEmission(
        stale.fn, stale.functions,
      ).isAuthorized(range)
    ));
    assert.match(emittedVariant(stale), /sagejs_word_add_int64/);
  }

  const wrongOwnerIr = await witness();
  const original = wrongOwnerIr.functions.find(fn =>
    fn.name === unitRangeDeclaration.entry
  );
  const outer = original.body.find(operation => operation.kind === "if")
    .body.find(operation => operation.kind === "loop.range_int64");
  const conditional = outer.body.find(operation => operation.kind === "if");
  const continuation = conditional.body.pop();
  outer.body.unshift({
    kind: "while",
    condition: { operations: [], value: "skip" },
    body: [continuation],
  });
  installCheckedRegionDeclarations(wrongOwnerIr, [unitRangeDeclaration]);
  const [wrongOwnerRegion] = prepareCheckedRegions(wrongOwnerIr);
  const wrongOwner = wrongOwnerRegion.variants.find(candidate =>
    candidate.checkedRegionVariant?.original === unitRangeDeclaration.entry
  );
  const wrongOwnerFunctions = new Map(wrongOwnerRegion.variants.map(fn => [
    fn.name, fn,
  ]));
  const authorizedLoop = wrongOwner.body.find(operation =>
    operation.kind === "if"
  ).body.find(operation => operation.kind === "loop.range_int64");
  assert.ok(checkedRegionInt64RangeIncrementEmission(
    wrongOwner, wrongOwnerFunctions,
  ).isAuthorized(authorizedLoop));
  assert.match(generateTaggedFunctions(
    [wrongOwner], { functions: [...wrongOwnerFunctions.values()] },
  ).functions, /sagejs_word_add_int64/);
});

test("private unit range boundary latches are free of signed overflow", {
  skip: process.platform === "win32" ? "UBSan harness is Unix-only" : false,
}, async () => {
  const ir = await witness();
  installCheckedRegionDeclarations(ir, [unitRangeDeclaration, {
    entry: "checked_region_unit_range_index_write_entry",
    functions: ["checked_region_unit_range_index_write_entry"],
    capabilities: ["int64-range-induction"],
    guard: [{
      kind: "int64-range",
      parameter: "start",
      minimum: "-9223372036854775808",
      maximum: "9223372036854775807",
    }],
  }]);
  const core = generateHostCore(ir, {
    moduleIdentity: "0123456789abcdef",
  });
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-unit-range-ubsan-"));
  try {
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "runtime.c"), `${core.source}
int main(void)
{
    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    int64_t output = 0;
    if (!tagged_checked_region_unit_range_entry(&status, &output,
            INT64_MAX - 1, INT64_MAX, 0, 0) || output != INT64_MAX - 1)
        return 1;
    if (!tagged_checked_region_unit_range_entry(&status, &output,
            INT64_MAX - 1, INT64_MAX, 0, 1) || output != INT64_MAX - 1)
        return 2;
    if (!tagged_checked_region_unit_range_entry(&status, &output,
            INT64_MIN + 1, INT64_MIN, 1, 0) || output != INT64_MIN + 1)
        return 3;
    if (!tagged_checked_region_unit_range_entry(&status, &output,
            INT64_MIN + 1, INT64_MIN, 1, 1) || output != INT64_MIN + 1)
        return 4;
    if (!tagged_checked_region_unit_range_entry(&status, &output,
            INT64_MAX, INT64_MAX, 0, 0) || output != INT64_MAX)
        return 5;
    if (!tagged_checked_region_unit_range_index_write_entry(
            &status, &output, INT64_MAX - 1, INT64_MAX) ||
        output != INT64_MAX)
        return 6;
    if (status.code != SAGEJS_NATIVE_OK)
        return 7;
    return 0;
}
`);
    const executable = join(temporary, "runtime");
    const compiled = spawnSync(process.env.CC || "cc", [
      "-std=c11", "-O1", "-fsanitize=undefined",
      "-fno-sanitize-recover=all", "-I", temporary,
      join(temporary, "runtime.c"), "-lgmp", "-lm", "-o", executable,
    ], { encoding: "utf8" });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
    const executed = spawnSync(executable, [], { encoding: "utf8" });
    assert.equal(executed.status, 0, executed.stderr || executed.stdout);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

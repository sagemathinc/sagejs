"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { generateHostCore } = require("../c-backend.cjs");
const {
  installCheckedRegionDeclarations,
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

function functionText(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `static int tagged_${escaped}\\([^;]+\\)\\n\\{`,
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
    /sagejs_tagged_arg_storage\.length >= \(\(size_t\) 4\)/,
  );
  assert.match(entry, /sagejs_tagged_arg_index >= INT64_C\(0\)/);
  assert.match(entry, /tagged_sagejs_checked_r0_checked_region_entry/);

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

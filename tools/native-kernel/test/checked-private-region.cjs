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

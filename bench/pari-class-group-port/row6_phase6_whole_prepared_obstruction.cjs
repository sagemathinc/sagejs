#!/usr/bin/env node
"use strict";

// Executable fail-closed audit for the remaining row-6 prepared boundary.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = name => fs.readFileSync(path.join(__dirname, name), "utf8");

function inspect() {
  const prefix = read("row6_phase6_prepared_prefix_root.generated.py");
  const gate = read("row6_prepared_gate_c_host.cjs");
  const ancestry = read("row6_terminal_class_ancestry.cjs");
  const terminal = read("row6_phase6_resident_terminal_host.cjs");
  const native = fs.readFileSync(path.resolve(__dirname,
    "../../src/lib/sagejs/native.py"), "utf8");

  assert.match(prefix, /count = pari_row6_prepared_factor_base_root\(/);
  assert.match(prefix, /initial_count = pari_row6_prepared_initial_relations\(/);
  assert.match(prefix,
    /integer_buffer_view\(factor_initial_primes, 0, 740\)/);
  assert.doesNotMatch(prefix, /subprocess|filesystem|json/i);

  // Gate C's current correctness implementation deliberately destroys one
  // allocation graph before constructing the next.  Therefore it cannot be
  // inserted into the already prepared aggregate ABI merely by adding calls:
  // the complete argument owners do not coexist as one prepared invocation.
  assert.match(gate, /first\.hnf = null; if \(global\.gc\) global\.gc\(\)/);
  assert.match(gate, /const restored = allocate\(/);
  assert.match(gate, /const av = \{\}; let bytes = 0/);
  assert.match(gate, /await compile\("collected_log_embeddings\.py"/);
  assert.match(gate, /await compile\("hnfspec_complete\.py"/);
  assert.match(gate, /await compile\("hnfadd\.py"/);

  // The current ancestry producer is detached replay, not retained HNF state.
  assert.match(ancestry, /await compiled\("hnfspec_complete\.py"/);
  assert.match(ancestry, /await compiled\("hnfadd\.py"/);
  assert.match(ancestry, /reverseSchedule\(/);

  // The fused suffix itself is ready, but its invocation is allocated from
  // Gate/factor/ancestry mappings only after those owners have been projected.
  assert.match(terminal,
    /async function prepareResident\(preparedEnvelope, gate, factor, ancestry\)/);
  assert.match(terminal, /const input = \{/);

  // Exact-buffer slices are available and close the factor->initial edge.
  // There is no corresponding signed-64 view for passing a live suffix of the
  // collector's relation matrix to HNF without copy/storage staging.
  assert.match(native, /def integer_buffer_view\(/);
  assert.doesNotMatch(native, /def int64_buffer_view\(/);

  return Object.freeze({
    schema: "sagejs.pari-class-group/row6-phase6-whole-prepared-obstruction-v1",
    connectedPreparedPrefix: Object.freeze({
      stages: Object.freeze(["factor-base", "initial-relations"]),
      oneNativeCall: true,
      subprocesses: 0,
      filesystemOwnerBoundaries: 0,
    }),
    connectedTerminalSuffix: Object.freeze({
      stages: Object.freeze(["analytic", "post-HNF", "Smith", "units", "class"]),
      oneNativeCall: true,
      subprocesses: 0,
      filesystemOwnerBoundaries: 0,
    }),
    missingConnectedMiddle: Object.freeze([
      "collector scratch is destroyed and rebuilt around initial HNF",
      "continuation HNF storage is allocated from data-dependent live dimensions",
      "collector IntegerBuffer columns are host-copied into Int64 HNF owners",
      "column ancestry reruns HNF instead of consuming retained transforms",
      "terminal invocation buffers are allocated only after mapping projection",
    ]),
    requiredClosure: Object.freeze([
      "one bounded Gate-C private root with sequential local workspace lifetimes",
      "a signed-64 borrowed view or an explicit bounded in-root copy workspace",
      "native retained reverse-HNF ancestry state",
      "direct buffer handoff from Gate C into the fused terminal root",
    ]),
    completePreparedKernel: false,
    timingEligible: false,
    ratioPublished: false,
  });
}

if (require.main === module)
  process.stdout.write(`${JSON.stringify(inspect(), null, 2)}\n`);
module.exports = { inspect };

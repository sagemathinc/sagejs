#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const corpus = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const degree90 = corpus.cases.find(({ id }) => id === "hecke-degree-90");
assert.ok(degree90);

const compositeChild =
  "1468588851873139652328002230184119685254565706227317949965724009981865250400607326096407311894801725250971698120310219181360356904490718140678735443880006414418537521228710571214121475373058473640943137698376565506826457500079874226576383492804757052703603473979302588176259205506831058686632866130725721293004467361141625717482258416359127506831963388523138379338745180611439893097753";

// Loading a production native module is a real cold-process cost, but it is
// not arithmetic. Record it explicitly before making the first and only call
// on the degree-90 child. In particular, there is no same-input warmup hidden
// outside the reported construction and proof intervals.
const source = String.raw`
import json
import time

script_started = time.perf_counter_ns()
imports_started = time.perf_counter_ns()
from sagejs.native import execution_mode
from sagejs.number_fields import buchmann_lenstra as bl
from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent
imports_finished = time.perf_counter_ns()

autoload_started = time.perf_counter_ns()
fused_mode = execution_mode(bl.packed_composite_dedekind_basis_in_place)
batch_mode = execution_mode(bl.packed_order_contains_vectors_in_place)
autoload_finished = time.perf_counter_ns()

coefficients = [${degree90.polynomial.coefficients.join(",")}]
component = DiscriminantComponent(${compositeChild}, "composite")
equation_discriminant = ${degree90.equationDiscriminant}

construction_started = time.perf_counter_ns()
result = bl.buchmann_lenstra_overorder(
    coefficients,
    component,
    equation_discriminant=equation_discriminant,
)
construction_finished = time.perf_counter_ns()
assert result.state == "complete"

original = bl._dedekind_generator_lattice_is_order
compact_closure_ns = 0
def timed_closure(*args):
    global compact_closure_ns
    started = time.perf_counter_ns()
    answer = original(*args)
    compact_closure_ns += time.perf_counter_ns() - started
    return answer

bl._dedekind_generator_lattice_is_order = timed_closure
try:
    proof_started = time.perf_counter_ns()
    accepted = bl.check_buchmann_lenstra_result(
        coefficients,
        result,
        equation_discriminant=equation_discriminant,
    )
    proof_finished = time.perf_counter_ns()
finally:
    bl._dedekind_generator_lattice_is_order = original
assert accepted

construction_ns = construction_finished - construction_started
proof_ns = proof_finished - proof_started
print(json.dumps({
    "schema": "sagejs.number-fields/degree90-bl-checker-timing-v1",
    "fixture": "hecke-degree-90",
    "degree": len(coefficients) - 1,
    "support_bits": component.value.bit_length(),
    "shift_count": len(result.evidence["obstruction"]) - 1,
    "module_import_seconds": (imports_finished - imports_started) / 1e9,
    "native_autoload_seconds": (autoload_finished - autoload_started) / 1e9,
    "construction_seconds": construction_ns / 1e9,
    "compact_closure_seconds": compact_closure_ns / 1e9,
    "other_certificate_seconds": (proof_ns - compact_closure_ns) / 1e9,
    "proof_seconds": proof_ns / 1e9,
    "exact_child_seconds": (construction_ns + proof_ns) / 1e9,
    "script_seconds": (proof_finished - script_started) / 1e9,
    "fused_mode": fused_mode,
    "batch_mode": batch_mode,
    "same_input_warmups": 0,
}, sort_keys=True))
None
`;

const wallStarted = process.hrtime.bigint();
const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), "--python", "-"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 120_000,
  maxBuffer: 4 * 1024 * 1024,
});
const processWallSeconds = Number(process.hrtime.bigint() - wallStarted) / 1e9;
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout);
const receipt = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
receipt.process_wall_seconds = processWallSeconds;
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);

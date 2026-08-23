// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");
const corpus = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const degree90 = corpus.cases.find(({ id }) => id === "hecke-degree-90");
assert.ok(degree90);

// The exact 1277-bit child selected by the certified split replay for the
// standard degree-90 fixture. It is deliberately not a prime factorization:
// the composite BL path must remain split-aware and factorization-free.
const compositeChild =
  "1468588851873139652328002230184119685254565706227317949965724009981865250400607326096407311894801725250971698120310219181360356904490718140678735443880006414418537521228710571214121475373058473640943137698376565506826457500079874226576383492804757052703603473979302588176259205506831058686632866130725721293004467361141625717482258416359127506831963388523138379338745180611439893097753";

test(
  "degree-90 BL replay streams closure and rejects lattice corruption",
  { timeout: 60_000 },
  async () => {
    const session = await createSage();
    try {
      const source = String.raw`
import json, time
from sagejs.native import execution_mode
from sagejs.number_fields import buchmann_lenstra as bl
from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent, OrderBasis

coefficients = [${degree90.polynomial.coefficients.join(",")}]
modulus = ${compositeChild}
equation_discriminant = ${degree90.equationDiscriminant}
component = DiscriminantComponent(modulus, "composite")
started = time.perf_counter_ns()
result = bl.buchmann_lenstra_overorder(
    coefficients,
    component,
    equation_discriminant=equation_discriminant,
)
assert result.state == "complete"
assert result.index == modulus ** 5
assert bl.check_buchmann_lenstra_result(
    coefficients,
    result,
    equation_discriminant=equation_discriminant,
)
replay_micros = (time.perf_counter_ns() - started) // 1000

workspace_words, output_words = bl._packed_order_table_word_capacities(
    coefficients, result.basis
)
degree = result.basis.degree
workspace_bytes = (degree * degree + 2 * degree - 1) * workspace_words * 8
maximum_bits = max(
    abs(value).bit_length()
    for value in (
        [entry for row in result.basis.numerator for entry in row]
        + coefficients
        + [result.basis.denominator]
    )
)
old_words = max(16, (4 * degree * (maximum_bits + 1) + 63) // 64 + 8)
old_table_bytes = degree * degree * degree * old_words * 8
assert old_table_bytes > 40_000_000_000
assert workspace_bytes < 16 * 1024 * 1024

saved_generator = list(result.evidence["overorder_generator"])
result.evidence["overorder_generator"] = list(saved_generator)
result.evidence["overorder_generator"][0] += 1
assert not bl.check_buchmann_lenstra_result(
    coefficients,
    result,
    equation_discriminant=equation_discriminant,
)
result.evidence["overorder_generator"] = saved_generator

saved_basis = result.basis
bad_rows = [list(row) for row in saved_basis.numerator]
bad_rows[0][1] += 1
result.basis = OrderBasis(bad_rows, saved_basis.denominator, canonical=True)
assert not bl.check_buchmann_lenstra_result(
    coefficients,
    result,
    equation_discriminant=equation_discriminant,
)
result.basis = saved_basis
assert bl.check_buchmann_lenstra_result(
    coefficients,
    result,
    equation_discriminant=equation_discriminant,
)

print(json.dumps({
    "replay_micros": replay_micros,
    "workspace_words": workspace_words,
    "output_words": output_words,
    "workspace_bytes": workspace_bytes,
    "old_table_bytes": old_table_bytes,
    "table_mode": execution_mode(bl.packed_order_table_in_place),
    "membership_mode": execution_mode(bl.packed_order_contains_vector_in_place),
}, sort_keys=True))
None
`;
      const result = await session.evaluate(source);
      assert.equal(result.stderr ?? "", "");
      const receipt = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
      assert.ok(receipt.replay_micros < 20_000_000, JSON.stringify(receipt));
      assert.match(receipt.table_mode, /^(native-capable|compiled)$/);
      assert.match(receipt.membership_mode, /^(native-capable|compiled)$/);
    } finally {
      await session.close();
    }
  },
);

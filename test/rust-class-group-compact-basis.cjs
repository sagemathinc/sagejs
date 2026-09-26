// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("row-6 compact ideals use the exported prepared basis", async () => {
  const sage = await createSage();
  try {
    const result = await sage.evaluate(`
from sagejs.number_fields import rust_class_group_presentation as presentation
R.<x> = QQ[]
K.<a> = NumberField(x^3 - 2000000000010*x + 2000000000018)
O = K.maximal_order()
basis = presentation._authenticated_service_basis(
    K,
    ['3', '0', '0', '0', '3', '0', '-1333333333340', '1', '1'],
    '3',
)
rows = [['1', '0', '2'], ['0', '1', '6'], ['0', '0', '11']]
ideal = presentation._authenticated_service_ideal(
    K, basis, rows, 'row-6 compact generator'
)
encoded = presentation._ideal_prepared_basis_rows(
    K, basis, ideal, 'row-6 compact generator'
)
closed = all(left * right in ideal for left in O.basis() for right in ideal.basis())
[ideal.norm(), encoded, closed, basis != tuple(O.basis())]
`);
    assert.equal(
      result.repr,
      "[11, ((1, 0, 2), (0, 1, 6), (0, 0, 11)), True, True]",
    );
  } finally {
    await sage.close();
  }
});

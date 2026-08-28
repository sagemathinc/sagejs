// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const definition = `
from sagejs.compiler import optimize, optimization_contract

@optimize(
    require="math.strict-float-region.v1",
    coverage="all-loops",
    target="v8",
    guard_failure="error",
)
def recurrence(count: int, value: float, multiplier: float) -> float:
    for _index in range(count):
        value = value * multiplier
    return value
`;

test("guard_failure=error prevents a silently generic optimized function", async () => {
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(`${definition}
print(recurrence(3, float(2), float(3)))
print(optimization_contract(recurrence))
try:
    recurrence(3, 2, 3)
except RuntimeError as error:
    print(type(error).__name__, str(error))
`);
    assert.match(result.stdout, /^54\.0\n/);
    assert.match(result.stdout, /'guard_failure': 'error'/);
    assert.match(
      result.stdout,
      /RuntimeError optimizer runtime guard failed for .*: live-in-not-binary64\n$/,
    );
    assert.equal(result.optimization.authority, "compiler-verified-static");
    assert.equal(result.optimization.program.contracts.length, 1);
    assert.equal(result.optimization.program.contracts[0].status, "satisfied");
    assert.equal(result.optimization.program.regions[0].target.kind, "v8");
  } finally {
    await session.close();
  }
});

test("guard_failure=fallback retains exact generic semantics", async () => {
  const session = await createSage({ mode: "python" });
  try {
    const source = definition.replace(
      'guard_failure="error"',
      'guard_failure="fallback"',
    );
    const result = await session.evaluate(`${source}
answer = recurrence(3, 2, 3)
print(answer, type(answer).__name__)
`);
    assert.equal(result.stdout, "54 ρσ_int\n");
  } finally {
    await session.close();
  }
});

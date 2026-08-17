"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");

const source = String.raw`
import sys
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.number_fields.maximal_order_contracts import (
    ComponentSplit,
    DiscriminantComponent,
    LocalOrderResult,
    MaximalOrderCertificate,
    MaximalOrderTrace,
    OrderBasis,
    SelectionDecision,
)

basis = OrderBasis([[2, 0], [0, 2]], 2)
assert basis.to_dict()["numerator"] == [[1, 0], [0, 1]]
assert basis.to_dict()["denominator"] == 1
assert basis.determinant_numerator == 1
assert OrderBasis.from_dict(basis.to_dict()).canonical_key() == basis.canonical_key()

component = DiscriminantComponent(49, "composite", base=7, exponent=2,
                                  evidence={"source": "perfect-power"})
split = ComponentSplit(49, 7, 7, {"operation": "gcd"})
split_result = LocalOrderResult("split", "round4", component, split=split)
assert split_result.to_dict()["split"]["left"] == 7

prime = DiscriminantComponent(7, "proven-prime", evidence={"proof": "trial"})
local = LocalOrderResult(
    "complete", "round2", prime, basis=basis, index=1, discriminant=-23,
    evidence={"locally_maximal": True},
)
certificate = MaximalOrderCertificate(
    -23, -23, 1, basis, [prime], [local],
    {"contains_one": True, "closed": True},
)
assert certificate.to_dict()["schema"].endswith("certificate-v1")

decision = SelectionDecision("round2", "tiny shallow local problem",
                             {"degree": 2, "valuation": 1})
assert decision.to_dict()["algorithm"] == "round2"

trace = MaximalOrderTrace(True)
token = trace.begin("factor-discovery", {"bits": 200})
trace.end(token, details={"components": 2})
assert trace.to_dict()["events"][0]["duration_ns"] >= 0

rejected = 0
for action in (
    lambda: OrderBasis([[1, 0]], 1),
    lambda: DiscriminantComponent(15, "prime-ish"),
    lambda: ComponentSplit(15, 1, 15),
    lambda: LocalOrderResult("complete", "round2", prime),
    lambda: MaximalOrderCertificate(-23, -23, 2, basis, [prime], [local], {}),
):
    try:
        action()
    except (TypeError, ValueError):
        rejected += 1
assert rejected == 5
print("maximal-order-contracts-ok")
`;

function run(command, args, environment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /maximal-order-contracts-ok/);
}

test("maximal-order contracts are identical in CPython and Sage.js", () => {
  run(pythonExecutable(), ["-c", source]);
  run(join(root, "bin", "sagejs"), ["--python", "-"], {
    SAGEJS_NATIVE_DISABLE: "1",
  });
});

#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const runtimeRoot = path.resolve(process.env.SAGEJS_REPLAY_RUNTIME_ROOT || root);
const { createSage } = require(path.join(runtimeRoot, "dist/tools/kernel.js"));
const source = fs.readFileSync(
  path.join(__dirname, "regulator_interval_authority.py"),
  "utf8",
);
const replayFixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "regulator-acceptance-replay-fixture.json"),
    "utf8",
  ),
);
const compactFixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "compact_unit_result_fixture.json"),
    "utf8",
  ),
);

async function main() {
  const fixture = {
    units: replayFixture.exact_units_power_coordinates,
    provenance: [
      replayFixture.selected_lattice.unit_transform.slice(0, 7),
      replayFixture.selected_lattice.unit_transform.slice(7, 14),
    ],
    logs: compactFixture.archimedean.packed_logs,
    highRegulator: compactFixture.archimedean.regulator_triplet,
    directRegulator: replayFixture.resident.packed_regulator,
  };
  const session = await createSage({ mode: "python" });
  try {
    const program = source + String.raw`
import copy
import json

fixture = json.loads(${JSON.stringify(JSON.stringify(fixture))})
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - 20018*x + 20034, "a")

def authority(regulator, units=None, provenance=None, logs=None):
    return build_live_regulator_interval_authority(
        K,
        regulator,
        fixture["units"] if units is None else units,
        fixture["provenance"] if provenance is None else provenance,
        fixture["logs"] if logs is None else logs,
    )

high = authority(fixture["highRegulator"])
assert high["evidence"]["live_regulator_contained"] is True
assert high["evidence"]["packed_log_matches"] == [True] * 6
assert high["evidence"]["provenance_full_row_rank"] is True
assert high["authority"] == {
    "scope": "independent-exact-unit-interval-verifier",
    "timed_native_root": False,
    "intervals_generated_from_exact_units": True,
    "serialized_known_envelope_accepted_as_input": False,
    "ulp_corridor_used_for_acceptance": False,
    "external_ulp_fingerprint_may_be_recorded": True,
    "unit_saturation_index_one": False,
    "public_class_unit_complete": False,
}

# One p192 ulp remains comfortably inside the rigorous ball. Acceptance must
# depend on interval membership, not bitwise identity with a known result.
direct = authority(fixture["directRegulator"])
one_ulp = list(fixture["directRegulator"])
one_ulp[0] = str(int(one_ulp[0]) + 1)
one_ulp_result = authority(one_ulp)
assert one_ulp_result["evidence"]["live_regulator_contained"] is True
assert one_ulp_result["authority_sha256"] != direct["authority_sha256"]

def fraction(text):
    if "/" in text:
        numerator, denominator = text.split("/", 1)
        return int(numerator), int(denominator)
    return int(text), 1

lower_n, lower_d = fraction(high["evidence"]["regulator_enclosure"]["ball"]["lower"])
upper_n, upper_d = fraction(high["evidence"]["regulator_enclosure"]["ball"]["upper"])
scale = 2**171
below = [str((lower_n * scale) // lower_d - 1), "192", "20"]
above = [str((upper_n * scale) // upper_d + 1), "192", "20"]

def rejected(call, label):
    try:
        call()
    except (RegulatorIntervalAuthorityFailure, ArithmeticError, ValueError, TypeError):
        return
    raise AssertionError(label + " was accepted")

rejected(lambda: authority(below), "lower endpoint crossing")
rejected(lambda: authority(above), "upper endpoint crossing")

bad_log = list(fixture["logs"])
bad_log[0:3] = [str(2**2175), "2176", "100"]
rejected(lambda: authority(fixture["highRegulator"], logs=bad_log), "foreign log")

bad_units = copy.deepcopy(fixture["units"])
bad_units[0][0] = str(int(bad_units[0][0]) + 1)
rejected(lambda: authority(fixture["highRegulator"], units=bad_units), "nonunit")

dependent = [fixture["provenance"][0], fixture["provenance"][0]]
rejected(
    lambda: authority(fixture["highRegulator"], provenance=dependent),
    "dependent provenance",
)

swapped = [fixture["provenance"][1], fixture["provenance"][0]]
swapped_result = authority(fixture["highRegulator"], provenance=swapped)
assert (
    swapped_result["ordered_inputs"]["unit_provenance_sha256"]
    != high["ordered_inputs"]["unit_provenance_sha256"]
)

print(json.dumps({
    "schema": high["schema"],
    "authoritySha256": high["authority_sha256"],
    "regulatorBall": high["evidence"]["regulator_enclosure"]["ball"],
    "precisionHistory": high["evidence"]["precision_history"],
    "oneUlpWithinBallAccepted": True,
    "endpointCrossingsRejected": 2,
    "semanticMutationsRejected": 3,
    "orderedProvenanceBound": True,
    "ulpAcceptance": False,
}, sort_keys=True))
`;
    const result = await session.evaluate(program, {
      filename: "regulator-interval-authority.py",
    });
    assert.equal(result.stderr || "", "");
    if (result.exitCode !== undefined) assert.equal(result.exitCode, 0);
    process.stdout.write(result.stdout);
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const runtimeRoot = path.resolve(process.env.SAGEJS_REPLAY_RUNTIME_ROOT || root);
const { createSage } = require(path.join(runtimeRoot, "dist/tools/kernel.js"));
const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "regulator-acceptance-replay-fixture.json"), "utf8"),
);
const replaySource = readFileSync(
  path.join(__dirname, "regulator_acceptance_replay.py"),
  "utf8",
);

function pythonLiteral(value) {
  return JSON.stringify(value);
}

async function main() {
  const session = await createSage({ mode: "python" });
  try {
    const source = replaySource + String.raw`
import copy
import json

fixture = json.loads(${pythonLiteral(JSON.stringify(fixture))})
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - 20018*x + 20034, "a")

payload = build_regulator_acceptance_replay(K, fixture)
assert payload["evidence"]["exact_unit_norms"] == ["-1", "-1"]
assert payload["evidence"]["selected_lattice_rank"] == 2
assert payload["evidence"]["packed_log_matches"] == [True] * 6
assert payload["evidence"]["packed_regulator_matches"] is True
assert payload["evidence"]["regulator"]["rigorous"] is True
assert payload["evidence"]["regulator"]["full_rank_certified"] is True
assert payload["evidence"]["precision_decisions"]["actual_history"] == ["128"]
assert payload["assumptions"]["pari_correspondence"]["assumed"] is True
assert payload["assumptions"]["rigorous_local_replay"] == {
    "exact_unit_norms": True,
    "selected_lattice_full_rank": True,
    "weighted_log_regulator_enclosed": True,
    "packed_values_contained": True,
}
assert payload["assumptions"]["public_certification"] == {
    "unit_saturation_index_one": False,
    "factor_base_and_relation_completion": False,
    "class_unit_complete": False,
    "reason": "no independent saturation/index-one or complete class-presentation certificate is supplied",
}
raw, authority = seal_regulator_acceptance_replay(payload)
replayed = cold_replay_regulator_acceptance(K, raw, authority)
assert replayed == payload

def rejected(changed):
    changed_raw, changed_authority = seal_regulator_acceptance_replay(changed)
    try:
        cold_replay_regulator_acceptance(K, changed_raw, changed_authority)
    except (RegulatorReplayFailure, ArithmeticError, ValueError, TypeError):
        return
    raise AssertionError("a coordinated regulator replay mutation was accepted")

changed = copy.deepcopy(payload)
changed["inputs"]["exact_units_power_coordinates"][0][0] = str(
    int(changed["inputs"]["exact_units_power_coordinates"][0][0]) + 1
)
rejected(changed)

changed = copy.deepcopy(payload)
changed["inputs"]["resident"]["packed_logs"][0] = str(
    int(changed["inputs"]["resident"]["packed_logs"][0]) + 2**191
)
rejected(changed)

changed = copy.deepcopy(payload)
changed["inputs"]["selected_lattice"]["unit_transform"][7:] = (
    changed["inputs"]["selected_lattice"]["unit_transform"][:7]
)
changed["inputs"]["selected_lattice"]["relation_provenance"] = list(
    changed["inputs"]["selected_lattice"]["unit_transform"]
)
rejected(changed)

changed = copy.deepcopy(payload)
changed["evidence"]["regulator"]["ball"]["upper"] = "0"
rejected(changed)

changed = copy.deepcopy(payload)
changed["assumptions"]["public_certification"]["class_unit_complete"] = True
rejected(changed)

changed = copy.deepcopy(payload)
changed["evidence"]["precision_decisions"]["actual_history"] = ["64", "128"]
rejected(changed)

print(json.dumps({
    "schema": payload["schema"],
    "field": payload["inputs"]["source"]["field_id"],
    "unit_norms": payload["evidence"]["exact_unit_norms"],
    "regulator": payload["evidence"]["regulator"],
    "precision_decisions": payload["evidence"]["precision_decisions"],
    "selected_lattice_sha256": payload["inputs"]["selected_lattice"]["unit_transform_sha256"],
    "retry_packed_logs_sha256": payload["inputs"]["retry"]["packed_logs_sha256"],
    "envelope_sha256": authority.envelope_sha256,
    "mutations_rejected": 6,
    "pari_correspondence_assumed": True,
    "public_certification": False,
}, sort_keys=True))
`;
    const result = await session.evaluate(source, { filename: "regulator-acceptance-replay.py" });
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

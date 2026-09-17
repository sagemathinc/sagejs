#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const runtimeRoot = path.resolve(process.env.SAGEJS_REPLAY_RUNTIME_ROOT || root);
const regulatorSource = fs.readFileSync(
  path.join(__dirname, "regulator_acceptance_replay.py"),
  "utf8",
);
const regulatorFixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "regulator-acceptance-replay-fixture.json"),
    "utf8",
  ),
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 300000,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function stdinText() {
  return fs.readFileSync(0, "utf8");
}

async function replayRegulator(mode) {
  const { createSage } = require(path.join(runtimeRoot, "dist/tools/kernel.js"));
  const supplied = mode === "verify" ? JSON.parse(stdinText()) : null;
  const session = await createSage({ mode: "python" });
  try {
    const source = regulatorSource + String.raw`
import json

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - 20018*x + 20034, "a")
fixture = json.loads(${JSON.stringify(JSON.stringify(regulatorFixture))})
payload = (
    json.loads(${JSON.stringify(supplied === null ? "null" : JSON.stringify(supplied))})
    if ${supplied === null ? "False" : "True"}
    else build_regulator_acceptance_replay(K, fixture)
)
raw, authority = seal_regulator_acceptance_replay(payload)
assert cold_replay_regulator_acceptance(K, raw, authority) == payload
print(json.dumps({
    "payload": payload,
    "envelope_sha256": authority.envelope_sha256,
    "envelope": json.loads(raw),
    "sha256": authority.envelope_sha256,
}, sort_keys=True))
`;
    const result = await session.evaluate(source, {
      filename: "internal-correspondence-regulator-replay.py",
    });
    assert.equal(result.stderr || "", "");
    if (result.exitCode !== undefined) assert.equal(result.exitCode, 0);
    process.stdout.write(result.stdout);
  } finally {
    session.close();
  }
}

function sourceOracle() {
  if (process.env.SAGEJS_UNIT_ORACLE_PATH) {
    return JSON.parse(fs.readFileSync(process.env.SAGEJS_UNIT_ORACLE_PATH, "utf8"));
  }
  const checker = path.join(runtimeRoot, "bench/pari-class-group-port/check_unit_bridge_cubic.cjs");
  const pari = path.resolve(
    process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4",
  );
  const archive = path.resolve(
    process.env.SAGEJS_PARI_ARCHIVE ||
      "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  return JSON.parse(
    run(process.execPath, [checker, pari, archive], {
      cwd: runtimeRoot,
      env: { ...process.env, SAGEJS_DUMP_UNIT_ORACLE: "1" },
    }),
  );
}

function main() {
  const resident = path.resolve(
    process.env.SAGEJS_RESIDENT_CUBIC ||
      "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
  );
  const regulator = JSON.parse(
    run(process.execPath, [__filename, "--build-regulator"], {
      env: {
        ...process.env,
        SAGEJS_REPLAY_RUNTIME_ROOT: runtimeRoot,
      },
    }),
  );
  const oracle = sourceOracle();
  const program = String.raw`
import copy
import dataclasses
import decimal
import hashlib
import importlib
import json
import os
import pathlib
import subprocess
import sys
import threading
import typing

sys.set_int_max_str_digits(100000)
sys.path[:0] = [sys.argv[1], sys.argv[1] + "/src/lib"]
root, resident, checker, node, runtime_root = sys.argv[1:]
data = json.load(sys.stdin)
oracle = data["oracle"]
regulator = data["regulator"]

success = importlib.import_module("bench.pari-class-group-port.class_group_authentic_success")
presentation = importlib.import_module("bench.pari-class-group-port.presentation_authority")
torsion = importlib.import_module("bench.pari-class-group-port.torsion_authority")
m = importlib.import_module("bench.pari-class-group-port.internal_correspondence_completion")

fixture = root + "/bench/pari-class-group-port/unit-bridge-cubic-fixtures.json"
authentic = success.build_authentic_success_payload(
    resident,
    fixture,
    oracle,
    {"envelope": regulator["envelope"], "sha256": regulator["sha256"]},
)
presentation_payload = presentation.capture_presentation_authority(resident)
torsion_result = torsion.derive_real_cubic_torsion([20034, -20018, 0, 1])

cache = {}
def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)

def regulator_verifier(payload):
    encoded = canonical(payload)
    key = hashlib.sha256(encoded.encode("ascii")).hexdigest()
    if key not in cache:
        environment = dict(os.environ)
        environment["SAGEJS_REPLAY_RUNTIME_ROOT"] = runtime_root
        replay = subprocess.run(
            [node, checker, "--verify-regulator"],
            input=encoded,
            text=True,
            capture_output=True,
            env=environment,
            timeout=120,
        )
        if replay.returncode != 0:
            raise ValueError("regulator replay rejected payload: " + replay.stderr)
        cache[key] = json.loads(replay.stdout)["envelope_sha256"]
    return cache[key]

payload = m.build_internal_correspondence_completion(
    authentic,
    presentation_payload,
    regulator["payload"],
    torsion_result,
    regulator_verifier,
)
assert payload["terminal"] == {
    "status": "pari-correspondence-complete-internal-h1",
    "correspondence_complete": True,
    "composition_driver_published": True,
    "source_leaf_final_driver_published": False,
    "public_complete": False,
    "class_unit_computation_complete": False,
    "standard_public_adapter_eligible": False,
    "unit_saturation_certified": False,
    "missing_public_evidence": [
        "replayable-unit-saturation-index-one-certificate",
        "standard-class-unit-proof-payload-with-factor-base-bound-and-proof-stage",
    ],
}
assert payload["source_authorities"]["regulator_envelope_sha256"] == regulator["envelope_sha256"]
assert payload["class_group"]["class_number"] == "1"
assert payload["class_group"]["generator_ideals"] == []
assert payload["unit_group_correspondence"]["rank"] == "2"
assert payload["unit_group_correspondence"]["exact_unit_norms"] == ["-1", "-1"]
assert payload["unit_group_correspondence"]["regulator_enclosure"]["rigorous"] is True
assert payload["assumptions"]["independent_unit_index_one"] is False
oracle_power_units = []
for integral_unit in oracle["units"]:
    first, second, third = map(int, integral_unit)
    oracle_power_units.append(
        [str(first - 13345 * third), str(second + 2 * third), str(third)]
    )
assert payload["unit_group_correspondence"]["exact_units_power_coordinates"] == oracle_power_units
assert payload["unit_group_correspondence"]["selected_to_correspondence_basis"] == [
    "1", "0", "0", "-1",
]

raw, authority = m.seal_internal_correspondence_completion(payload)
assert m.cold_replay_internal_correspondence_completion(
    raw,
    authority,
    authentic,
    presentation_payload,
    regulator["payload"],
    torsion_result,
    regulator_verifier,
) == payload

def rejected_payload(change):
    changed = copy.deepcopy(payload)
    change(changed)
    changed_raw, changed_authority = m.seal_internal_correspondence_completion(changed)
    try:
        m.cold_replay_internal_correspondence_completion(
            changed_raw,
            changed_authority,
            authentic,
            presentation_payload,
            regulator["payload"],
            torsion_result,
            regulator_verifier,
        )
    except m.InternalCorrespondenceFailure:
        return
    raise AssertionError("coordinated completion mutation was accepted")

mutations = [
    lambda p: p["terminal"].__setitem__("public_complete", True),
    lambda p: p["terminal"].__setitem__("correspondence_complete", False),
    lambda p: p["terminal"].__setitem__("unit_saturation_certified", True),
    lambda p: p["terminal"]["missing_public_evidence"].pop(),
    lambda p: p["assumptions"].__setitem__("independent_unit_index_one", True),
    lambda p: p["unit_group_correspondence"]["exact_units_power_coordinates"][0].__setitem__(0, "0"),
    lambda p: p["source_authorities"].__setitem__("presentation_sha256", "0" * 64),
]
for mutation in mutations:
    rejected_payload(mutation)

changed_authentic = copy.deepcopy(authentic)
changed_authentic["correspondence"]["unit_kernel_provenance"][6] = "2"
try:
    m.cold_replay_internal_correspondence_completion(
        raw, authority, changed_authentic, presentation_payload,
        regulator["payload"], torsion_result, regulator_verifier,
    )
except (m.InternalCorrespondenceFailure, success.AuthenticSuccessFailure):
    pass
else:
    raise AssertionError("mutated unit provenance was accepted")

changed_presentation = copy.deepcopy(presentation_payload)
changed_presentation["relations"][0]["alpha"][0] = str(
    int(changed_presentation["relations"][0]["alpha"][0]) + 1
)
try:
    m.cold_replay_internal_correspondence_completion(
        raw, authority, authentic, changed_presentation,
        regulator["payload"], torsion_result, regulator_verifier,
    )
except (m.InternalCorrespondenceFailure, presentation.PresentationAuthorityFailure):
    pass
else:
    raise AssertionError("mutated principal relation was accepted")

changed_regulator = copy.deepcopy(regulator["payload"])
changed_regulator["inputs"]["resident"]["packed_logs"][0] = str(
    int(changed_regulator["inputs"]["resident"]["packed_logs"][0]) + 2**191
)
try:
    m.cold_replay_internal_correspondence_completion(
        raw, authority, authentic, presentation_payload,
        changed_regulator, torsion_result, regulator_verifier,
    )
except m.InternalCorrespondenceFailure:
    pass
else:
    raise AssertionError("mutated rigorous regulator source was accepted")

print(json.dumps({
    "schema": payload["schema"],
    "field": payload["field"]["id"],
    "classNumber": 1,
    "unitRank": 2,
    "correspondenceComplete": True,
    "publicComplete": False,
    "unitSaturationCertified": False,
    "standardPublicAdapterEligible": False,
    "exactUnits": 2,
    "principalRelations": 73,
    "factorBaseSize": 66,
    "rigorousRegulator": True,
    "mutationsRejected": len(mutations) + 3,
    "completionEnvelopeSha256": authority.expected_sha256,
}, sort_keys=True))
`;
  const result = spawnSync(
    "/usr/bin/python3",
    ["-c", program, root, resident, __filename, process.execPath, runtimeRoot],
    {
      cwd: root,
      input: JSON.stringify({ oracle, regulator }),
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      timeout: 300000,
    },
  );
  assert.equal(result.status, 0, result.stderr || String(result.error));
  process.stdout.write(result.stdout);
}

if (process.argv[2] === "--build-regulator") {
  replayRegulator("build").catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (process.argv[2] === "--verify-regulator") {
  replayRegulator("verify").catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  main();
}

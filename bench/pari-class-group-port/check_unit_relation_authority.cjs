#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const resident = path.resolve(
  process.argv[2] || "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);
const regulatorFixture = path.join(
  __dirname,
  "regulator-acceptance-replay-fixture.json",
);

const program = String.raw`
import copy
import dataclasses
import decimal
import fractions
import hashlib
import importlib
import json
import pathlib
import sys
import threading
import typing

sys.path[:0] = [sys.argv[1], sys.argv[1] + "/src/lib"]
m = importlib.import_module("bench.pari-class-group-port.unit_relation_authority")
p = importlib.import_module("bench.pari-class-group-port.presentation_authority")

resident, fixture = sys.argv[2:4]
presentation = p.capture_presentation_authority(resident)
authority = m.capture_unit_relation_authority(resident, fixture)
summary = m.replay_unit_relation_authority(authority, presentation)

assert summary["active_shape"] == [2, 15]
assert summary["retained_shape"] == [2, 73]
assert summary["nonzero_retained_counts"] == [49, 46]
assert summary["max_abs_retained_exponents"] == [164, 181]
assert summary["unit_norms"] == [-1, -1]
assert summary["unit_saturation_proved"] is False
assert summary["public_completion"] is False
assert authority["torsion_signs"] == ["1", "1"]

def rejected(changed, changed_presentation=None):
    try:
        m.replay_unit_relation_authority(
            changed,
            presentation if changed_presentation is None else changed_presentation,
        )
    except (m.UnitRelationAuthorityFailure, p.PresentationAuthorityFailure):
        return
    raise AssertionError("mutated unit relation authority was accepted")

mutations = []
def mutation(change):
    changed = copy.deepcopy(authority)
    change(changed)
    mutations.append(changed)

mutation(lambda a: a.__setitem__("schema", "forged"))
mutation(lambda a: a["source"].__setitem__("resident_sha256", "0" * 64))
mutation(lambda a: a["unit_kernel_provenance"]["entries"].__setitem__(0, "1"))
mutation(lambda a: a["active_relation_provenance"]["entries"].__setitem__(0, "-16"))
mutation(lambda a: a["active_to_retained_relations"]["entries"].__setitem__(0, "2"))
mutation(lambda a: a["retained_relation_provenance"]["entries"].__setitem__(0, "-16"))
mutation(lambda a: a["published_units_power_basis"]["entries"].__setitem__(0, "1"))
mutation(lambda a: a["published_units_integral_basis"]["entries"].__setitem__(0, "1"))
mutation(lambda a: a["torsion_signs"].__setitem__(0, "-1"))
mutation(lambda a: a["scope"].__setitem__("unit_saturation_proved", True))
mutation(lambda a: a["scope"].__setitem__("public_completion", True))
mutation(lambda a: a["retained_relation_provenance"].__setitem__("shape", ["2", "72"]))
for changed in mutations:
    rejected(changed)

presentation_mutations = []
def presentation_mutation(change):
    changed = copy.deepcopy(presentation)
    change(changed)
    presentation_mutations.append(changed)

presentation_mutation(lambda a: a["relations"][0]["alpha"].__setitem__(0, "0"))
presentation_mutation(lambda a: a["relations"][0]["exponents"].__setitem__(0, "1"))
presentation_mutation(lambda a: a["hnf"]["transform"].__setitem__(0, "2"))
presentation_mutation(lambda a: a["field"]["multiplication_table"].__setitem__(0, "2"))
for changed in presentation_mutations:
    rejected(authority, changed)

# A coordinated edit of the derived 73-word and claimed exact unit still
# cannot replace the independently replayed cleanup/HNF composition.
coordinated = copy.deepcopy(authority)
coordinated["retained_relation_provenance"]["entries"][0] = str(
    int(coordinated["retained_relation_provenance"]["entries"][0]) + 1
)
coordinated["published_units_integral_basis"]["entries"][0] = str(
    int(coordinated["published_units_integral_basis"]["entries"][0]) + 1
)
rejected(coordinated)

print(json.dumps({
    "schema": summary["schema"],
    "field": summary["field"],
    "activeShape": summary["active_shape"],
    "retainedShape": summary["retained_shape"],
    "nonzeroRetainedCounts": summary["nonzero_retained_counts"],
    "maxAbsRetainedExponents": summary["max_abs_retained_exponents"],
    "unitNorms": summary["unit_norms"],
    "torsionSigns": [1, 1],
    "mutationsRejected": len(mutations) + len(presentation_mutations) + 1,
    "authoritySha256": summary["authority_sha256"],
    "unitSaturationProved": False,
    "publicCompletion": False,
}, sort_keys=True))
`;

const result = spawnSync(
  "python3",
  ["-c", program, root, resident, regulatorFixture],
  {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 240000,
  },
);
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);

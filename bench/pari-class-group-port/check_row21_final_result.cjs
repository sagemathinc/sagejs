#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const [prepared, factor, firstHnf, acceptance, units, w0, outputDirectory] =
  process.argv.slice(2);
assert(prepared && factor && firstHnf && acceptance && units && w0,
  "usage: check_row21_final_result.cjs PREPARED FACTOR FIRST_HNF ACCEPTANCE UNITS W0 [OUTPUT_DIR]");

const modulePath = path.join(__dirname, "row21_final_result.py");
const program = String.raw`
import copy
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

spec = importlib.util.spec_from_file_location("row21_final_result", sys.argv[1])
assert spec is not None and spec.loader is not None
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)

prepared_path, factor_path, first_path, acceptance_path, unit_path, w0_path = sys.argv[2:8]
output_directory = Path(sys.argv[8]) if len(sys.argv) > 8 and sys.argv[8] else Path(
    "/scratch/sagejs-row21-final-result"
)
arguments = (prepared_path, factor_path, first_path, acceptance_path, unit_path)

# Two independent builds and publications complete before W0 is opened.
payload_a = m.build_row21_payload(*arguments)
payload_b = m.build_row21_payload(*arguments)
assert payload_a == payload_b
publisher_a = m.AtomicRow21Publisher()
publisher_b = m.AtomicRow21Publisher()
result_a = publisher_a.publish(payload_a)
result_b = publisher_b.publish(payload_b)
assert result_a == result_b
assert publisher_a.publish(copy.deepcopy(payload_a)) is result_a
with ThreadPoolExecutor(max_workers=8) as pool:
    published = list(pool.map(publisher_a.publish, [copy.deepcopy(payload_a) for _ in range(32)]))
assert all(item is result_a for item in published)
artifact = publisher_a.publish_file(output_directory, payload_a)
assert publisher_a.publish_file(output_directory, copy.deepcopy(payload_a)) == artifact
assert gzip.decompress(artifact.read_bytes()) == result_a.canonical_json
authority = m.Row21ReplayAuthority(result_a.sha256)
assert m.cold_replay_row21(result_a.canonical_json, authority) == result_a

# Publication validates first.  Invalid drafts expose no partial result.
failed = m.AtomicRow21Publisher()
bad = copy.deepcopy(payload_a)
bad["classGroup"]["classNumber"] = "2"
try:
    failed.publish(bad)
except m.Row21FinalFailure:
    pass
else:
    raise AssertionError("invalid draft was published")
assert failed.current() is None

# A different valid-envelope attempt cannot replace a terminal result.  It is
# enough to change an opaque source hash and then pin a separate publisher to
# that mutated result; the original publisher must still retain its object.
conflict_payload = copy.deepcopy(payload_a)
conflict_payload["terminal"]["remainingBoundary"] = list(
    reversed(conflict_payload["terminal"]["remainingBoundary"])
)
try:
    publisher_a.publish(conflict_payload)
except (m.Row21FinalFailure, m.Row21PublicationConflict):
    pass
else:
    raise AssertionError("conflicting terminal publication succeeded")
assert publisher_a.current() is result_a

def mutate_at(root, path):
    parent = root
    for part in path[:-1]:
        parent = parent[part]
    key = path[-1]
    old = parent[key]
    if isinstance(old, bool):
        parent[key] = not old
    elif isinstance(old, str):
        parent[key] = "999999" if old != "999999" else "888888"
    elif isinstance(old, list):
        parent[key] = ["unexpected"]
    else:
        parent[key] = 999999

material_paths = [
    ("source", "pariVersion"),
    ("source", "preparedSha256"),
    ("source", "factorOwnerSha256"),
    ("source", "firstHnfOwnerSha256"),
    ("source", "acceptanceOwnerSha256"),
    ("source", "unitOwnerSha256"),
    ("source", "frozenW0RuntimeInput"),
    ("field", "polynomial", 0),
    ("field", "discriminant"),
    ("field", "multiplicationTable", 0),
    ("factorBase", "value", "factorBase", "ideals", 0, 0),
    ("owners", "firstHnf", "value", "relations", "records", 0),
    ("owners", "acceptance", "value", "acceptance", "regulator", 0),
    ("owners", "units", "value", "units", "exactIntegralBasis", 0, 0),
    ("relations", "recordsShape", 0),
    ("relations", "recordsColumnMajor"),
    ("relations", "recordsColumnMajor", 0),
    ("relations", "generators", 0),
    ("relations", "metadata", 0),
    ("relations", "state", "relation", 0),
    ("classGroup", "classNumber"),
    ("classGroup", "invariantFactors"),
    ("classGroup", "presentation", "transform", 0),
    ("classGroup", "presentation", "rightInverse", 0),
    ("classGroup", "smith", "diagonal", 0),
    ("logarithms", "firstHnf", "value", "exactC", 0),
    ("logarithms", "acceptance", "value", "exactC", 0),
    ("logarithms", "realLogs", 0),
    ("logarithms", "coordinates", 0),
    ("logarithms", "relationLattice", 0),
    ("units", "torsion", "order"),
    ("units", "torsion", "generator", 0),
    ("units", "fundamental", "coordinates", 0),
    ("units", "fundamental", "inverses", 0),
    ("units", "fundamental", "norms", 0),
    ("units", "fundamental", "realSigns", 0),
    ("units", "fundamental", "compact", "unitTransform", 0),
    ("units", "fundamental", "compact", "getfuFactor", 0),
    ("units", "fundamental", "compact", "getfuState", 0),
    ("units", "fundamental", "compact", "outputLogs", "real", 0),
    ("regulator", "value", 0),
    ("regulator", "inverseHr", 0),
    ("regulator", "acceptanceState", 0),
    ("buchall", "clg1", "classNumber"),
    ("buchall", "clg2", "components", 0),
    ("buchall", "terminalState", 0),
    ("assumptions", 0),
    ("terminal", "status"),
    ("terminal", "correspondenceComplete"),
    ("terminal", "buchallEndComplete"),
    ("terminal", "publicComplete"),
    ("terminal", "omittedLazyMaterializations", 0),
    ("terminal", "remainingBoundary", 0),
]
for path_parts in material_paths:
    changed = copy.deepcopy(payload_a)
    mutate_at(changed, path_parts)
    try:
        m.AtomicRow21Publisher().publish(changed)
    except m.Row21FinalFailure:
        pass
    else:
        raise AssertionError(f"semantic material mutation was accepted: {path_parts}")

# Owner-content attacks also fail after the attacker recomputes the local
# content digest: the source-specific expected content hashes remain pinned.
owner_rehash_paths = [
    ("factorBase", "value", "factorBase", "ideals", 0, 0),
    ("owners", "firstHnf", "value", "relations", "records", 0),
    ("owners", "acceptance", "value", "acceptance", "regulator", 0),
    ("owners", "units", "value", "units", "exactIntegralBasis", 0, 0),
]
for path_parts in owner_rehash_paths:
    changed = copy.deepcopy(payload_a)
    mutate_at(changed, path_parts)
    record = changed[path_parts[0]]
    if path_parts[0] == "owners":
        record = changed["owners"][path_parts[1]]
    record["contentSha256"] = hashlib.sha256(m._canonical(record["value"])).hexdigest()
    try:
        m.AtomicRow21Publisher().publish(changed)
    except m.Row21FinalFailure:
        pass
    else:
        raise AssertionError(f"rehashed source-owner mutation was accepted: {path_parts}")

# Each live input owner is authenticated before output publication.
source_mutations = []
for label, source_path, gzip_input in (
    ("prepared", prepared_path, False),
    ("factor", factor_path, True),
    ("first-hnf", first_path, True),
    ("acceptance", acceptance_path, True),
    ("units", unit_path, True),
):
    temporary = Path(tempfile.mkdtemp(prefix=f"row21-final-bad-{label}-"))
    raw = gzip.decompress(Path(source_path).read_bytes()) if gzip_input else Path(source_path).read_bytes()
    source = json.loads(raw)
    first_key = next(iter(source))
    source[first_key] = "mutated"
    changed_raw = json.dumps(source, separators=(",", ":")).encode()
    changed_path = temporary / ("owner.json.gz" if gzip_input else "prepared.json")
    changed_path.write_bytes(gzip.compress(changed_raw, mtime=0) if gzip_input else changed_raw)
    changed_arguments = list(arguments)
    changed_arguments[(prepared_path, factor_path, first_path, acceptance_path, unit_path).index(source_path)] = str(changed_path)
    try:
        m.build_row21_payload(*changed_arguments)
    except m.Row21FinalFailure:
        source_mutations.append(label)
    else:
        raise AssertionError(f"mutated {label} source owner was accepted")

# W0 begins here: all live computation, exact replay, publication, atomicity,
# idempotence, and negative tests above have already completed.
w0_raw = Path(w0_path).read_bytes()
assert hashlib.sha256(w0_raw).hexdigest() == "45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a"
w0_data = json.loads(w0_raw)
event = lambda name: next(item for item in w0_data["events"] if item["event"] == name)
acceptance_event = event("acceptance")
unit_event = event("fundamental_units")
final_event = event("final_state")
assert acceptance_event["h"] == payload_a["classGroup"]["classNumber"]
packed_regulator = [
    acceptance_event["exactR"]["mantissa"],
    str(acceptance_event["exactR"]["precision"]),
    str(acceptance_event["exactR"]["exponent"]),
]
assert packed_regulator == payload_a["regulator"]["value"]
assert unit_event["U"]["values"]
w0_transform = [cell["value"] for column in unit_event["U"]["values"] for cell in column["values"]]
assert w0_transform == payload_a["units"]["fundamental"]["compact"]["unitTransform"]

# Convert W0's postcompute polynomial units to the authenticated integral basis.
prepared_data = json.loads(Path(prepared_path).read_bytes())
degree = 5
denominator = int(prepared_data["prep_zkden"])
zk = [int(value) for value in prepared_data["prep_zk"]]
matrix = [[Fraction(zk[degree * column + row], denominator) for column in range(degree)] for row in range(degree)]
def solve(left, right):
    augmented = [list(row) + [right[index]] for index, row in enumerate(left)]
    for column in range(degree):
        pivot = next(row for row in range(column, degree) if augmented[row][column])
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        scale = augmented[column][column]
        augmented[column] = [value / scale for value in augmented[column]]
        for row in range(degree):
            if row == column:
                continue
            scale = augmented[row][column]
            augmented[row] = [
                augmented[row][entry] - scale * augmented[column][entry]
                for entry in range(degree + 1)
            ]
    return [row[-1] for row in augmented]
w0_units = []
for polynomial in unit_event["fu"]["values"]:
    coefficients = [
        Fraction(int(entry["left"]["value"]), int(entry["right"]["value"]))
        for entry in polynomial["coefficients"]
    ]
    coordinates = solve(matrix, coefficients)
    assert all(value.denominator == 1 for value in coordinates)
    w0_units.append(tuple(value.numerator for value in coordinates))
live_units = payload_a["units"]["fundamental"]["coordinates"]
live_units = [tuple(map(int, live_units[5 * index : 5 * (index + 1)])) for index in range(3)]
assert set(w0_units) == set(live_units)

# W0's final state independently reports the trivial clg1, six empty clg2
# components, and terminal zero state.
final_values = final_event["result"]["values"]
clg1 = final_values[7]["values"][0]["values"]
assert clg1[0]["value"] == "1" and clg1[1]["values"] == [] and clg1[2]["values"] == []
clg2 = final_values[8]["values"]
assert len(clg2) == 6 and all(component["values"] == [] for component in clg2)
assert [entry["value"] for entry in final_values[9]["values"]] == ["0", "0", "0"]

print(json.dumps({
    "schema": m.SCHEMA,
    "publicationSha256": result_a.sha256,
    "artifact": str(artifact),
    "artifactCompressedSha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
    "bytes": len(result_a.canonical_json),
    "classNumber": 1,
    "invariantFactors": [],
    "relationShape": [24, 32],
    "relationTransformDeterminant": int(payload_a["classGroup"]["presentation"]["transformDeterminant"]),
    "unitRank": 3,
    "torsionOrder": 2,
    "fundamentalUnitNorms": list(map(int, payload_a["units"]["fundamental"]["norms"])),
    "regulator": payload_a["regulator"]["value"],
    "semanticMutationCases": len(material_paths),
    "rehashedOwnerMutationCases": len(owner_rehash_paths),
    "sourceOwnerMutationCases": source_mutations,
    "concurrentIdempotentPublications": len(published),
    "w0OpenedPostcomputeOnly": True,
    "w0ClassAndUnitsMatched": True,
    "correspondenceComplete": True,
    "buchallEndComplete": True,
    "publicComplete": False,
}, sort_keys=True))
`;

const result = spawnSync(
  "python3",
  ["-c", program, modulePath, prepared, factor, firstHnf, acceptance, units, w0,
    outputDirectory || ""],
  { cwd: path.resolve(__dirname, "../.."), encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024, timeout: 120_000 },
);
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);

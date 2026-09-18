#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const argumentsList = process.argv.slice(2);
assert(argumentsList.length >= 7,
  "usage: check_row23_final_result.cjs PREPARED FACTOR RELATION ACCEPTANCE CLASS UNITS W0 [OUTPUT]");
const modulePath = path.join(__dirname, "row23_final_result.py");

const program = String.raw`
import copy
from concurrent.futures import ThreadPoolExecutor
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

spec = importlib.util.spec_from_file_location("row23_final_result", sys.argv[1])
assert spec is not None and spec.loader is not None
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)

prepared, factor, relation, acceptance, class_owner, units, w0 = sys.argv[2:9]
output = Path(sys.argv[9]) if len(sys.argv) > 9 and sys.argv[9] else Path(
    "/scratch/sagejs-row23-final-result"
)
source_arguments = (prepared, factor, relation, acceptance, class_owner, units)

# The complete live-owner transaction finishes before W0 is opened.
payload_a = m.build_row23_payload(*source_arguments)
payload_b = m.build_row23_payload(*source_arguments)
assert payload_a == payload_b
publisher_a = m.AtomicRow23Publisher()
publisher_b = m.AtomicRow23Publisher()
result_a = publisher_a.publish(payload_a)
result_b = publisher_b.publish(payload_b)
assert result_a == result_b
assert publisher_a.publish(copy.deepcopy(payload_a)) is result_a
with ThreadPoolExecutor(max_workers=8) as pool:
    published = list(pool.map(
        publisher_a.publish, [copy.deepcopy(payload_a) for _ in range(32)]
    ))
assert all(item is result_a for item in published)
artifact = publisher_a.publish_file(output, payload_a)
assert publisher_a.publish_file(output, copy.deepcopy(payload_a)) == artifact
assert gzip.decompress(artifact.read_bytes()) == result_a.canonical_json
authority = m.Row23ReplayAuthority(result_a.sha256)
assert m.cold_replay_row23(result_a.canonical_json, authority) == result_a

# Invalid drafts never become observable.
failed = m.AtomicRow23Publisher()
bad = copy.deepcopy(payload_a)
bad["classGroup"]["classNumber"] = "7"
try:
    failed.publish(bad)
except m.Row23FinalFailure:
    pass
else:
    raise AssertionError("invalid row-23 draft was published")
assert failed.current() is None

conflict = copy.deepcopy(payload_a)
conflict["terminal"]["remainingBoundary"] = list(
    reversed(conflict["terminal"]["remainingBoundary"])
)
try:
    publisher_a.publish(conflict)
except (m.Row23FinalFailure, m.Row23PublicationConflict):
    pass
else:
    raise AssertionError("conflicting row-23 result replaced the terminal result")
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
    elif isinstance(old, int):
        parent[key] = old + 1
    elif isinstance(old, list):
        parent[key] = ["unexpected"]
    elif old is None:
        parent[key] = "unexpected"
    elif isinstance(old, dict):
        parent[key] = {"unexpected": True}
    else:
        raise AssertionError(f"unsupported mutation target {path}")

material_paths = [
    ("source", "pariVersion"),
    ("source", "preparedSha256"),
    ("source", "factorOwnerSha256"),
    ("source", "relationOwnerSha256"),
    ("source", "acceptanceOwnerSha256"),
    ("source", "classOwnerSha256"),
    ("source", "unitOwnerSha256"),
    ("source", "frozenW0RuntimeInput"),
    ("field", "polynomial", 0),
    ("field", "signature", 0),
    ("field", "discriminant"),
    ("field", "multiplicationTable", 0),
    ("owners", "factorBase", "value", "factorBase", "ideals", 0, 0),
    ("owners", "relationHnf", "value", "relations", "recordsColumnMajor", 0),
    ("owners", "acceptance", "value", "acceptance", "regulator", 0),
    ("owners", "classWitness", "value", "presentation", "W", 0),
    ("owners", "units", "value", "unitsIntegralBasis", 0, 0),
    ("factorBase", "rationalPrimes", 0),
    ("factorBase", "descriptors", 0, 0),
    ("factorBase", "ideals", 0, 0),
    ("factorBase", "norms", 0),
    ("factorBase", "permutation", 0),
    ("factorBase", "subfactor", 0),
    ("relations", "recordsColumnMajor", 0),
    ("relations", "principalGenerators", 0),
    ("relations", "metadata", 0),
    ("hnf", "original", 0),
    ("hnf", "cleanupTransform", 0),
    ("hnf", "fullH", 0),
    ("hnf", "hnfTransform", 0),
    ("hnf", "hnfLambda", 0),
    ("hnf", "hnfDenominators", 0),
    ("hnf", "terminalDep"),
    ("hnf", "terminalW", 0),
    ("hnf", "terminalB", 0),
    ("hnf", "terminalPermutation", 0),
    ("hnf", "exactLogs", 0),
    ("logarithms", "exactHnf", 0),
    ("logarithms", "analyticPacked", 0),
    ("logarithms", "coordinates", 0),
    ("logarithms", "relationLattice", 0),
    ("classGroup", "classNumber"),
    ("classGroup", "invariantFactors", 0),
    ("classGroup", "presentation", "matrices", "D", 0),
    ("classGroup", "generatorIdeals", 0, 0),
    ("classGroup", "generatorOrders", 0),
    ("classGroup", "compactPrincipalOrderWitnesses", 0,
        "rawRelationCoefficients", 0),
    ("classGroup", "genback", "candidateIdealHnf", 0),
    ("units", "torsion", "order"),
    ("units", "torsion", "generator", 0),
    ("units", "fundamental", "coordinates", 0),
    ("units", "fundamental", "inverses", 0),
    ("units", "fundamental", "norms", 0),
    ("units", "fundamental", "realSigns", 0),
    ("units", "fundamental", "compact", "unitTransform", 0),
    ("units", "fundamental", "compact", "getfuFactor", 0),
    ("units", "fundamental", "compact", "outputPackedLogs", 0),
    ("units", "fundamental", "compact", "cleanarchState", 0),
    ("units", "fundamental", "compact", "getfuState", 0),
    ("regulator", "value", 0),
    ("regulator", "inverseHr", 0),
    ("regulator", "acceptanceState", 0),
    ("regulator", "rigorousEnclosure"),
    ("buchall", "clg1", "classNumber"),
    ("buchall", "clg2", "values", 0, 0),
    ("buchall", "clg2", "values", 1, "value", "relationExponents", 0),
    ("buchall", "clg2", "values", 2),
    ("buchall", "clg2", "pariClg2ExactShapeComplete"),
    ("buchall", "terminalState", 0),
    ("assumptions", 0),
    ("limitations", "degreeFiveIdealredExecuted"),
    ("limitations", "expandedIdealProductReplayComplete"),
    ("limitations", "reason"),
    ("terminal", "status"),
    ("terminal", "buchallEndEquivalentAssemblyComplete"),
    ("terminal", "correspondenceComplete"),
    ("terminal", "publicComplete"),
    ("terminal", "atomic"),
    ("terminal", "omittedLazyMaterializations", 0),
    ("terminal", "remainingBoundary", 0),
]
for path_parts in material_paths:
    changed = copy.deepcopy(payload_a)
    mutate_at(changed, path_parts)
    try:
        m.AtomicRow23Publisher().publish(changed)
    except m.Row23FinalFailure:
        pass
    else:
        raise AssertionError(f"semantic material mutation accepted: {path_parts}")

# An attacker who changes an embedded owner and recomputes its local content
# digest still fails against the pinned source-specific content authority.
owner_attacks = [
    ("factorBase", ("factorBase", "ideals", 0, 0)),
    ("relationHnf", ("relations", "recordsColumnMajor", 0)),
    ("acceptance", ("acceptance", "regulator", 0)),
    ("classWitness", ("presentation", "W", 0)),
    ("units", ("unitsIntegralBasis", 0, 0)),
]
for owner_name, nested in owner_attacks:
    changed = copy.deepcopy(payload_a)
    record = changed["owners"][owner_name]
    mutate_at(record["value"], nested)
    record["contentSha256"] = hashlib.sha256(m._canonical(record["value"])).hexdigest()
    try:
        m.AtomicRow23Publisher().publish(changed)
    except m.Row23FinalFailure:
        pass
    else:
        raise AssertionError(f"rehashed owner mutation accepted: {owner_name}")

# Every immutable input authority is checked independently before assembly.
source_rejections = []
for index, (label, filename, compressed) in enumerate((
    ("prepared", prepared, False),
    ("factor", factor, True),
    ("relation", relation, True),
    ("acceptance", acceptance, True),
    ("class", class_owner, True),
    ("units", units, True),
)):
    raw = gzip.decompress(Path(filename).read_bytes()) if compressed else Path(filename).read_bytes()
    source = json.loads(raw)
    first_key = next(iter(source))
    source[first_key] = "mutated"
    changed_raw = json.dumps(source, separators=(",", ":")).encode()
    temporary = Path(tempfile.mkdtemp(prefix=f"row23-final-bad-{label}-"))
    changed_path = temporary / ("owner.json.gz" if compressed else "prepared.json")
    changed_path.write_bytes(gzip.compress(changed_raw, mtime=0) if compressed else changed_raw)
    changed_arguments = list(source_arguments)
    changed_arguments[index] = str(changed_path)
    try:
        m.build_row23_payload(*changed_arguments)
    except m.Row23FinalFailure:
        source_rejections.append(label)
    else:
        raise AssertionError(f"mutated source owner accepted: {label}")

# W0 opens only after construction, exact replay, publication, concurrency,
# semantic mutations, owner-rehash attacks, and source-authority attacks.
w0_raw = Path(w0).read_bytes()
assert hashlib.sha256(w0_raw).hexdigest() == "6c4a0b2f5e74d5f156714fad24b0bbf41c8d4998de5bbd046d74c6d8a3930c89"
w0_data = json.loads(w0_raw)
event = lambda name: next(item for item in w0_data["events"] if item["event"] == name)
reference = event("result")
assert reference["classNumber"] == "6"
assert reference["invariants"] == ["6"]
reference_regulator = int(reference["regulator"]["mantissa"])
live_regulator = int(payload_a["regulator"]["value"][0])
assert abs(reference_regulator - live_regulator) <= 1024
assert int(reference["regulator"]["precision"]) == 256
assert int(reference["regulator"]["exponent"]) == 12
reference_units = event("fundamental_units")
assert reference_units["fu"]["kind"] == "vector"
assert len(reference_units["fu"]["values"]) == 4
reference_class = event("class_group_output")["clg1"]["values"]
assert reference_class[0]["value"] == "6"
assert [entry["value"] for entry in reference_class[1]["values"]] == ["6"]
columns = reference_class[2]["values"][0]["values"]
reference_hnf = [
    columns[column]["values"][row]["value"]
    for row in range(5) for column in range(5)
]
assert reference_hnf == payload_a["classGroup"]["generatorIdeals"][0]

print(json.dumps({
    "schema": m.SCHEMA,
    "publicationSha256": result_a.sha256,
    "artifact": str(artifact),
    "artifactCompressedSha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
    "bytes": len(result_a.canonical_json),
    "classNumber": 6,
    "invariantFactors": [6],
    "relationShape": [31, 40],
    "exactHnfLogCells": 315,
    "unitRank": 4,
    "unitNorms": list(map(int, payload_a["units"]["fundamental"]["norms"])),
    "regulator": payload_a["regulator"]["value"],
    "regulatorOracleDelta": live_regulator - reference_regulator,
    "semanticMutationCases": len(material_paths),
    "rehashedOwnerMutationCases": len(owner_attacks),
    "sourceOwnerMutationCases": source_rejections,
    "concurrentIdempotentPublications": len(published),
    "w0OpenedPostcomputeOnly": True,
    "buchallEndEquivalentAssemblyComplete": True,
    "correspondenceComplete": False,
    "publicComplete": False,
    "honestDegreeFiveIdealArithmeticGap": True,
}, sort_keys=True))
`;

const result = spawnSync("python3", ["-c", program, modulePath, ...argumentsList], {
  cwd: path.resolve(__dirname, "../.."),
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
  timeout: 120_000,
});
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);

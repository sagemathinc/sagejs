"""Static integrity checks for the independent regulator replay fixture."""

from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "regulator_acceptance_replay.py"
FIXTURE = HERE / "regulator-acceptance-replay-fixture.json"
UNIT_FIXTURE = HERE / "unit-bridge-cubic-fixtures.json"

ast.parse(SOURCE.read_text(), filename=str(SOURCE))
fixture = json.loads(FIXTURE.read_text())
assert fixture["schema"].endswith("regulator-acceptance-replay-fixture.v1")
assert (
    hashlib.sha256(UNIT_FIXTURE.read_bytes()).hexdigest()
    == fixture["source"]["unit_bridge_fixture_sha256"]
)
assert fixture["source"]["pari_version"] == "2.17.4"
assert fixture["field"]["defining_polynomial_coefficients"] == [
    "20034",
    "-20018",
    "0",
    "1",
]
assert fixture["field"]["integral_basis_power_coordinates"] == [
    ["1", "0", "0"],
    ["0", "1", "0"],
    ["-13345", "2", "1"],
]
selected = fixture["selected_lattice"]
columns = int(selected["columns"])
first = tuple(map(int, selected["unit_transform"][:columns]))
second = tuple(map(int, selected["unit_transform"][columns:]))
assert selected["unit_transform"] == selected["relation_provenance"]
assert any(first) and any(second)
assert any(
    first[left] * second[right] != first[right] * second[left]
    for left in range(columns)
    for right in range(left + 1, columns)
)
assert len(fixture["resident"]["packed_logs"]) == 18
assert len(fixture["resident"]["packed_regulator"]) == 3
assert len(fixture["exact_units_power_coordinates"]) == 2
assert all(len(unit) == 3 for unit in fixture["exact_units_power_coordinates"])
assert fixture["retry"]["log_precision_bits"] == "2176"
assert fixture["retry"]["embedding_precision_bits"] == "2240"
assert fixture["retry"]["working_capacity_bits"] == "2304"

print("regulator replay source and authentic cubic fixture integrity pass")

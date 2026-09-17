"""Static checks for the live regulator interval authority boundary."""

from __future__ import annotations

import ast
from pathlib import Path


SOURCE = Path(__file__).with_name("regulator_interval_authority.py")
tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
functions = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef)}
assert "build_live_regulator_interval_authority" in functions
builder = functions["build_live_regulator_interval_authority"]
arguments = [argument.arg for argument in builder.args.args]
assert arguments == [
    "field",
    "live_regulator",
    "exact_units_power_coordinates",
    "ordered_unit_provenance",
    "ordered_packed_logs",
]
text = SOURCE.read_text(encoding="utf-8")
assert "certified_regulator_enclosure(" in text
assert "enclosure.ball.contains(live_point)" in text
assert "FactoredNumberFieldElement.from_element" in text
assert '"ulp_corridor_used_for_acceptance": False' in text
assert "expected_regulator" not in text
assert "ulp_difference" not in text
assert "<= 4" not in text
print("regulator interval authority static checks passed")

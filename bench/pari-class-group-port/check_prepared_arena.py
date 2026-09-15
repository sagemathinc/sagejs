"""Replay the arena wrapper on an existing prepared fixture in CPython."""

import decimal  # Load stdlib before adding the mathematical library path.
import importlib
import json
from pathlib import Path
import sys

# Match the existing prepared-fixture checker, not the kernel resource limit.
sys.set_int_max_str_digits(100000)
root = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(root), str(root / "src" / "lib")]
function = importlib.import_module(
    "bench.pari-class-group-port.prepared_class_group_arena"
).pari_prepared_class_group_arena
fixture = json.loads(Path(sys.argv[1]).read_text())
raw = fixture["inputs"][0]
values = {}
for name, kind in fixture["names"]:
    convert = (
        bool if kind == "bool" else float if kind in ("float", "Float64Buffer") else int
    )
    value = raw[name]
    values[name] = (
        list(map(convert, value)) if isinstance(value, list) else convert(value)
    )
action = function(**values, temporary_limit=128 * 1024 * 1024)
count = values["attempt_state"][2]
actual = {
    "action": action,
    "state": values["attempt_state"],
    "invariants": list(map(str, values["class_invariants"][:count])),
    "classNumber": str(values["class_number"][0]),
    "regulator": list(map(str, values["accept_regulator"][:3])),
}
for key, value in actual.items():
    assert value == fixture["summary"]["cp"][0][key], (key, value)
assert values["relation_state"][0] == 58
assert values["counters"][1] == 491
assert values["progress"][1] == 54
assert values["search_count"] - values["schedule"][0] == 12
print(json.dumps({"cpythonReplay": "pass", "result": actual}))

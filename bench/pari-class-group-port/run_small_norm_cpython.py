"""Fresh-state CPython timing counterpart of the compiled collector driver."""

# Load the standard library module before adding Sage.js's library path;
# CPython's large-integer conversion imports it lazily.
import decimal
import hashlib
import importlib
import json
from pathlib import Path
import sys
import time

sys.set_int_max_str_digits(100000)
assert callable(decimal.getcontext)
root = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(root), str(root / "src/lib")]
manifest = json.loads(Path(sys.argv[1]).read_text())
repetitions = int(sys.argv[2]) if len(sys.argv) > 2 else 1
assert 1 <= repetitions <= 100000
fixture_bytes = Path(manifest["fixturePath"]).read_bytes()
assert hashlib.sha256(fixture_bytes).hexdigest() == manifest["hashes"]["fixture"]
fixture = json.loads(fixture_bytes)
assert fixture["schema"] == "pari-small-norm-collector-v1"
module = importlib.import_module("bench.pari-class-group-port.unreduced_small_norm")
entry = getattr(module, manifest["entry"])
for index, case in enumerate(fixture["cases"]):
    elapsed = 0.0
    for repetition in range(-3, repetitions):
        values = {}
        for name, kind in fixture["names"]:
            value = case["input"][name]
            convert = float if kind in ("float", "Float64Buffer") else int
            values[name] = (
                list(map(convert, value)) if isinstance(value, list) else convert(value)
            )
        args = [values[name] for name, _ in fixture["names"]]
        start = time.perf_counter()
        status = entry(*args)
        duration = time.perf_counter() - start
        if repetition >= 0:
            elapsed += duration
        last = values["relation_state"][0]
        size = len(values["relation"])
        actual = dict(
            status=status,
            small=values["counters"][1],
            trials=values["state"][1],
            attempts=values["counters"][0],
            relid=values["progress"][0],
            nfact=values["progress"][1],
            fact_count=values["counters"][2],
            last=last,
            missing=values["relation_state"][2],
            sup=values["relation_state"][3],
            basis=values["relation_basis"],
            hashes=values["relation_hashes"][:last],
            records=values["relation_records"][: last * size],
            generators=list(map(str, values["generators"][: last * values["n"]])),
        )
        assert actual == case["expected"], (index, repetition)
    print(json.dumps(dict(index=index, seconds=elapsed, **actual)))

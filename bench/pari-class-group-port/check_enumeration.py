"""CPython scaffolding checks, not differential PARI or native qualification."""

import importlib.util
import itertools
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src/lib"))
spec = importlib.util.spec_from_file_location(
    "pari_enumeration", pathlib.Path(__file__).with_name("enumeration.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def run(n, bound, skip, shear):
    stride = n + 1
    q = [0.0] * (stride * stride)
    for i in range(1, n):
        q[i * stride + i + 1] = shear
    v = [0.0] + [1.0] * n
    x, inc, state = [0] * stride, [0] * stride, [0] * 4
    y, z = [0.0] * stride, [0.0] * stride
    args = (q, v, x, y, z, inc, state, n, bound, skip)
    module.validate_prepared_state(*args)
    got = []
    while module.pari_fp_next(*args):
        got.append(tuple(x[1:]))
        assert len(got) < 10000
    assert module.pari_fp_next(*args) == 0
    expected = set()
    for row in itertools.product(range(-6, 7), repeat=n):
        if skip and not any(row[1:]):
            continue
        if any(row) and next(a for a in reversed(row) if a) < 0:
            continue
        size = sum(
            (row[i] + (shear * row[i + 1] if i + 1 < n else 0)) ** 2 for i in range(n)
        )
        if size <= bound:
            expected.add(row)
    assert len(got) == len(set(got))
    assert set(got) == expected, (n, bound, skip, shear, set(got) ^ expected)
    return {"degree": n, "bound": bound, "skip": skip, "shear": shear, "rows": got}


counts = [
    run(n, bound, skip, shear)
    for n in (2, 3, 4)
    for bound in (1.0, 3.0)
    for skip in (0, 1)
    for shear in (0.0, 0.5)
]
if "--json" in sys.argv:
    print(json.dumps(counts))
else:
    print(
        f"CPython enumeration scaffolding: {len(counts)} cases, {sum(len(c['rows']) for c in counts)} vectors"
    )

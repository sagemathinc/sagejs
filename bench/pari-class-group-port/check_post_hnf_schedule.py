"""Replay frozen acceptance oracles and test late determinant scheduling."""

import importlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(root), str(root / "src/lib")]
post = importlib.import_module("bench.pari-class-group-port.post_hnf_acceptance")
accept = importlib.import_module("bench.pari-class-group-port.regulator_acceptance")
cases, expected = json.loads(Path(sys.argv[1]).read_text())
assert len(cases) == len(expected)


def arguments(r):
    n, c = r["rows"], r["columns"]
    z, q, s = n * (c + 1), n * n, (n - 1) * c
    lengths = [
        3 * z,
        c + 1,
        3,
        3 * z,
        n,
        c + 1,
        3,
        z,
        z,
        n,
        c + 1,
        c + 1,
        10,
        3 * q,
        3 * q,
        3 * q,
        3,
        n,
        5,
        3 * q,
        3 * q,
        3 * q,
        n,
        3,
        3 * q,
        3 * q,
        3,
        3 * s,
    ]
    a = [[77] * (3 * n * c), n, c, r["degree"]] + [[77] * k for k in lengths]
    a += [[77, 0, 73, 77], [77] * 3]
    a += [[77] * k for k in [3 * s, s, s, n - 1, s, 15, 3, s, 1, 4, n - 1, c]]
    a += [r["changed"], [77] * 3]
    h, state = [77], [77] * 3
    args = (
        [
            r["kc"],
            r["hRows"],
            r["bColumns"],
            r["cColumns"],
            n,
            r["degree"],
            list(map(int, r["H"])),
            list(map(int, r["C"])),
            list(map(int, r["inv"])),
            a[0],
            h,
            a[33],
            state,
        ]
        + a[4:33]
        + a[34:]
    )
    return args, a, h, state


seen = set()
for r, e in zip(cases, expected):
    args, a, h, state = arguments(r)
    result = post.pari_post_hnf_acceptance(*args)
    if e is None:
        assert result == -100 and h == [77] and a[33] == [77] * 3
        continue
    seen.add(result)
    assert result == e["acceptance"][1] and a[47] == e["acceptance"]
    assert a[32] == e["multiple_state"] and a[43] == e["reconstruction_state"]
    assert h == ([int(r["h"])] if e["acceptance"][0] == 2 else [77])
    if e["acceptance"][0] != 2:
        assert a[33] == [77] * 3
        # Poison the deferred owners and determinant. Early exits must not
        # inspect them, including inverse-hR shape or value validation.
        args, a, h, state = arguments(r)
        args[6] = []
        args[8] = []
        assert post.pari_post_hnf_acceptance(*args) == result
        assert h == [77] and a[33] == [77] * 3
    else:
        if "zeta" in r:
            assert a[33] == list(map(int, r["zeta"]))
    s = (r["rows"] - 1) * r["columns"]
    for at, key, length in [
        (30, "multiple", 3),
        (31, "coordinates", 3 * s),
        (40, "regulator", 3),
        (41, "relations", s),
    ]:
        # Recreate any arrays replaced by the poisoned-owner replay above.
        assert a[at] == (list(map(int, e[key])) if e[key] else [77] * length)

# Isolate scheduling at every early status, even if the frozen numeric corpus
# lacks a particular precision exit. No numerical oracle claims for these mocks.
sample = next(r for r, e in zip(cases, expected) if e and e["acceptance"][1] == 0)
original = accept.pari_regulator_multiple
try:
    for status, need, has_lambda, changed, action in [
        (1, 0, 0, True, 1),
        (1, 0, 1, True, 2),
        (1, 1, 1, True, 3),
        (0, 0, 1, False, 4),
        (-7, 0, 0, True, -7),
    ]:

        def multiple(*args):
            args[-1][:] = [status, need, 73, has_lambda]
            return status

        accept.pari_regulator_multiple = multiple
        r = {**sample, "changed": changed}
        args, a, h, state = arguments(r)
        args[6], args[8] = [], []
        assert post.pari_post_hnf_acceptance(*args) == action
        assert h == [77] and a[33] == [77] * 3
        assert a[40] == [77] * 3 and a[43] == [77] * 4
finally:
    accept.pari_regulator_multiple = original

print(
    json.dumps(
        {"replayed": len(cases), "actions": sorted(seen), "poisonedEarlyGates": 5}
    )
)

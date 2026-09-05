"""Independent exact-rational and CPython oracles for private packed sums."""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path
import random
import struct
import sys
from fractions import Fraction


def bits(value: float) -> str:
    return struct.pack(">d", value).hex()


def cases() -> list[tuple[str, list[float]]]:
    tiny = math.ulp(0.0)
    maximum = sys.float_info.max
    examples = [
        ("empty", []),
        ("negative-zero", [-0.0, -0.0]),
        ("cancellation", [1e100, 1.0, -1e100]),
        ("tie-up", [1e16, 1.0, 1e-16]),
        ("tie-down", [1e16, 1.0, -1e-16]),
        ("tie-even", [1.0, 2.0**-53]),
        ("tie-odd", [math.nextafter(1.0, 2.0), 2.0**-53]),
        ("subnormals", [tiny, tiny, -tiny, -0.0]),
        ("subnormal-cancellation", [1.0, tiny, -1.0]),
        ("normal-subnormal-boundary", [sys.float_info.min, -tiny]),
        ("wide-exponents", [math.ldexp(1.0, e) for e in range(-1074, 1024, 17)]),
        ("offsets", [1e9 + ((i * 37) % 1000) / 10 for i in range(2000)]),
        ("decimal-repeats", [0.1] * 1000),
        ("maximum", [maximum, -maximum, tiny]),
        ("intermediate-overflow", [maximum, maximum, -maximum]),
        ("final-overflow", [maximum, maximum]),
        ("negative-overflow", [-maximum, -maximum]),
        ("nan", [1.0, math.nan]),
        ("positive-infinity", [math.inf]),
        ("negative-infinity", [-math.inf]),
    ]
    rng = random.Random(724104)
    for index in range(180):
        # Exact rational rounding supplies an oracle independent of partials.
        values = [
            math.ldexp(rng.uniform(-1.0, 1.0), rng.randrange(-1074, 1024))
            for _ in range(rng.randrange(1, 96))
        ]
        if index % 3 == 0:
            values += [-item for item in values]
            values += [math.ldexp(1.0, rng.randrange(-1074, 1024))]
            rng.shuffle(values)
        examples.append(("seeded-" + str(index), values))
    return examples


def main() -> None:
    root = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(root / "src/lib"))
    # Load only the private kernel, not the public statistics/import graph.
    source = root / "src/lib/sagejs/numerics/statistics/_packed.py"
    spec = importlib.util.spec_from_file_location("packed_sums_oracle", source)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    records = []
    for name, values in cases():
        expected_status = 0.0
        expected = 27.0
        if not all(math.isfinite(item) for item in values):
            expected_status = 1.0
        else:
            try:
                expected = math.fsum(values)
            except OverflowError:
                expected_status = 1.0
            else:
                exact = sum((Fraction.from_float(item) for item in values), Fraction(0))
                assert bits(expected) == bits(float(exact)), name
        output = [27.0, -31.0]
        before = [bits(item) for item in values]
        status = module.finite_sum(values, [0.0] * len(values), output, len(values))
        assert status == expected_status, (name, status, expected_status)
        assert bits(output[0]) == bits(expected), (name, output, expected)
        assert output[1] == -31.0 and [bits(item) for item in values] == before
        records.append(
            {
                "name": name,
                "values": before,
                "status": status,
                "answer": bits(expected),
            }
        )
    for values, scratch, output, count in [
        ([1.0], [0.0], [27.0], -1),
        ([1.0], [0.0], [27.0], 2),
        ([1.0], [], [27.0], 1),
        ([1.0], [0.0], [], 1),
    ]:
        before_output = list(output)
        assert module.finite_sum(values, scratch, output, count) == 2.0
        assert output == before_output
    print(json.dumps({"schema": "sagejs.packed-sum-oracle/v1", "cases": records}))


if __name__ == "__main__":
    main()

"""Exact-rational rounding witnesses for packed centered transformations."""

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


def rounded(value: Fraction, zero: float = 0.0) -> float:
    return zero if value == 0 else float(value)


def main() -> None:
    root = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(root / "src/lib"))
    spec = importlib.util.spec_from_file_location(
        "packed_centered_oracle",
        root / "src/lib/sagejs/numerics/statistics/_packed_centered.py",
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    rows = []

    def record(name: str, function_index: int, args: list, expected_status: float):
        before = [list(value) if isinstance(value, list) else value for value in args]
        function = (
            module.prepare_centered,
            module.prepare_products,
            module.prepare_summary_checks,
        )[function_index]
        status = function(*args)
        assert status == expected_status, name
        input_count = 2 if function_index == 1 else 1
        for index in range(input_count):
            assert list(map(bits, args[index])) == list(map(bits, before[index])), name
        output_index = 4 if function_index == 0 else 3
        if status != 0 and function_index != 2:
            assert args[output_index] == before[output_index], name
        rows.append(
            {
                "name": name,
                "function_index": function_index,
                "arguments": [
                    {"type": "buffer", "value": list(map(bits, value))}
                    if isinstance(value, list)
                    else {"type": "uint64", "value": str(value)}
                    if isinstance(value, int)
                    else {"type": "float", "value": bits(value)}
                    for value in before
                ],
                "expected": {
                    "status": status,
                    "buffers": [
                        list(map(bits, value))
                        for value in args
                        if isinstance(value, list)
                    ],
                },
            }
        )
        return args

    tiny = math.ulp(0.0)
    maximum = sys.float_info.max
    cases = [
        ("empty", [], 0.0),
        ("negative-zero", [-0.0, 0.0, -0.0], 0.0),
        ("constant", [7.0] * 5, 7.0),
        ("offset", [1e12 + i / 1024 for i in range(31)], 1e12),
        ("subnormal", [tiny, -tiny, 2 * tiny], tiny),
        ("mixed-exponents", [1e100, 1.0, -1e100, tiny], 0.0),
        ("square-underflow", [1.0, 1e-200], 0.0),
        ("extreme-center", [-maximum], maximum),
        ("nan-center", [1.0], math.nan),
        ("infinite-center", [1.0], math.inf),
        ("nan-input", [1.0, math.nan], 0.0),
        ("infinite-input", [1.0, -math.inf], 0.0),
    ]
    rng = random.Random(724105)
    for index in range(80):
        exponent = rng.randrange(-1000, 1000)
        values = [
            math.ldexp(rng.uniform(-1, 1), exponent)
            for _ in range(rng.randrange(1, 40))
        ]
        center = values[0] if index % 2 else math.fsum(values) / len(values)
        cases.append(("seeded-" + str(index), values, center))
    for name, values, center in cases:
        count = len(values)
        status = 0.0
        reference = []
        if not math.isfinite(center) or not all(
            math.isfinite(value) for value in values
        ):
            status = 1.0
        else:
            try:
                reference = [
                    rounded(Fraction(value) - Fraction(center), value - center)
                    for value in values
                ]
            except OverflowError:
                status = 1.0
        buffers = record(
            name,
            0,
            [
                values + [917.0],
                [131.0] * (count + 1),
                [137.0] * (count + 1),
                [139.0] * (count + 1),
                [27.0, -31.0],
                center,
                count,
            ],
            status,
        )
        if status == 0:
            scale = max(map(abs, reference), default=0.0)
            normalized = [
                rounded(Fraction(value) / Fraction(scale), value / scale)
                if scale
                else 0.0
                for value in reference
            ]
            squares = [float(Fraction(value) ** 2) for value in normalized]
            assert list(map(bits, buffers[1][:-1])) == list(map(bits, reference)), name
            assert list(map(bits, buffers[2][:-1])) == list(map(bits, normalized)), name
            assert list(map(bits, buffers[3][:-1])) == list(map(bits, squares)), name
            assert buffers[4] == [scale, -31.0], name
            assert [buffers[i][-1] for i in (1, 2, 3)] == [131.0, 137.0, 139.0]
            right = list(reversed(normalized))
            multiplied = record(
                name + "-products",
                1,
                [
                    normalized + [917.0],
                    right + [919.0],
                    [131.0] * (count + 1),
                    [27.0, -31.0],
                    count,
                ],
                0.0,
            )
            products = [
                rounded(Fraction(x) * Fraction(y), x * y)
                for x, y in zip(normalized, right)
            ]
            assert list(map(bits, multiplied[2][:-1])) == list(map(bits, products)), (
                name
            )
            assert multiplied[2][-1] == 131.0 and multiplied[3] == [float(count), -31.0]

    for index in range(5):
        args = [[1.0], [131.0], [137.0], [139.0], [27.0], 0.0, 1]
        args[index] = []
        record("centered-capacity-" + str(index), 0, args, 2.0)
    for name, values, center in cases:
        median = center * 0.5
        status = 0.0
        expected_absolute = []
        expected_residual = []
        if not math.isfinite(center) or not all(map(math.isfinite, values)):
            status = 1.0
        else:
            try:
                expected_absolute = [
                    abs(rounded(Fraction(value) - Fraction(median), value - median))
                    for value in values
                ]
                expected_residual = [
                    rounded(Fraction(value) - Fraction(center), value - center)
                    for value in values
                ]
            except OverflowError:
                status = 1.0
        buffers = record(
            name + "-independent-check",
            2,
            [
                values + [917.0],
                [131.0] * (len(values) + 1),
                [137.0] * (len(values) + 1),
                median,
                center,
                len(values),
            ],
            status,
        )
        if status == 0:
            assert list(map(bits, buffers[1][:-1])) == list(
                map(bits, expected_absolute)
            ), name
            assert list(map(bits, buffers[2][:-1])) == list(
                map(bits, expected_residual)
            ), name
            assert buffers[1][-1] == 131.0 and buffers[2][-1] == 137.0
    for index in range(3):
        args = [[1.0], [131.0], [137.0], 1.0, 1.0, 1]
        args[index] = []
        record("summary-check-capacity-" + str(index), 2, args, 2.0)
    for median in (math.nan, math.inf, -math.inf):
        record(
            "summary-median-" + bits(median),
            2,
            [[1.0], [131.0], [137.0], median, 1.0, 1],
            1.0,
        )
    for index in range(4):
        args = [[1.0], [1.0], [131.0], [27.0], 1]
        args[index] = []
        record("products-capacity-" + str(index), 1, args, 2.0)
    for value in [
        math.nan,
        math.inf,
        -math.inf,
        1.0000000000000002,
        -1.0000000000000002,
    ]:
        for index in range(2):
            args = [[1.0], [1.0], [131.0], [27.0], 1]
            args[index] = [value]
            record("products-envelope-" + str(index) + "-" + bits(value), 1, args, 1.0)
    print(json.dumps({"schema": "sagejs.packed-centered-oracle/v1", "cases": rows}))


if __name__ == "__main__":
    main()

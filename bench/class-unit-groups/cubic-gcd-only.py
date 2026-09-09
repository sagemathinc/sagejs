"""Reproduce the gcd-only cubic source ablation and its arithmetic checks.

This is an experimental source transformation, not a production dispatcher.
It accepts an explicitly authenticated source file and never overwrites it.
Full-kernel compilation, corpus replay and controlled timing remain separate.
"""

import argparse
import ast
import hashlib
import json
import math
from pathlib import Path
import random


GCD_SOURCE = '''def _cubic_gcd(left: int, right: int) -> int:
    """Return the nonnegative gcd without constructing Bezout coefficients."""
    left = abs(left)
    right = abs(right)
    while right != 0:
        left, right = right, left % right
    return left
'''


def transform(source):
    """Replace only extended-gcd calls whose coefficients are never read."""
    tree = ast.parse(source)
    lines = source.splitlines(keepends=True)
    edits = []
    changed = set()
    definitions = 0
    for function in tree.body:
        if not isinstance(function, ast.FunctionDef):
            continue
        assert function.name != "_cubic_gcd", "candidate helper already exists"
        if function.name == "_cubic_extended_gcd":
            definitions += 1
            edits.append((function.lineno - 1, function.end_lineno, GCD_SOURCE))
            changed.add(function.name)
            continue
        for node in ast.walk(function):
            if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Call):
                continue
            call = node.value
            if (
                not isinstance(call.func, ast.Name)
                or call.func.id != "_cubic_extended_gcd"
            ):
                continue
            assert len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple)
            targets = node.targets[0].elts
            assert len(targets) == 3 and all(isinstance(x, ast.Name) for x in targets)
            assert len(call.args) == 2 and not call.keywords
            assert not any(isinstance(x, ast.Starred) for x in call.args)
            ignored = {x.id for x in targets[1:]}
            assert targets[0].id not in ignored
            assert not any(
                isinstance(x, ast.Name)
                and isinstance(x.ctx, ast.Load)
                and x.id in ignored
                for x in ast.walk(function)
            ), "caller reads a Bezout coefficient"
            args = ", ".join(ast.get_source_segment(source, arg) for arg in call.args)
            replacement = (
                " " * node.col_offset + f"{targets[0].id} = _cubic_gcd({args})\n"
            )
            edits.append((node.lineno - 1, node.end_lineno, replacement))
            changed.add(function.name)
    assert definitions == 1 and len(edits) > 1
    for start, end, replacement in sorted(edits, reverse=True):
        lines[start:end] = [replacement]
    candidate = "".join(lines)
    assert "_cubic_extended_gcd" not in candidate, "unhandled use of the old helper"
    old_functions = {x.name: x for x in tree.body if isinstance(x, ast.FunctionDef)}
    for function in ast.parse(candidate).body:
        if isinstance(function, ast.FunctionDef) and function.name not in changed | {
            "_cubic_gcd"
        }:
            assert ast.dump(function) == ast.dump(old_functions[function.name])
    return candidate, len(edits) - 1


def extract(source, name):
    """Execute just an actual scalar helper, without its native decorator."""
    node = next(
        x
        for x in ast.parse(source).body
        if isinstance(x, ast.FunctionDef) and x.name == name
    )
    node.decorator_list = []
    namespace = {}
    exec(compile(ast.Module(body=[node], type_ignores=[]), name, "exec"), namespace)
    return namespace[name]


def check_arithmetic(source, candidate):
    old = extract(source, "_cubic_extended_gcd")
    new = extract(candidate, "_cubic_gcd")
    cases = 0

    def check(a, b):
        nonlocal cases
        expected = math.gcd(a, b)
        g, s, t = old(a, b)
        assert g == expected and s * a + t * b == g
        assert new(a, b) == expected
        cases += 1

    for a in range(-128, 129):
        for b in range(-128, 129):
            check(a, b)
    rng = random.Random(908491)
    for bits in (1, 31, 63, 64, 65, 127, 256, 1024, 4096):
        for _ in range(200):
            a, b = rng.getrandbits(bits), rng.getrandbits(bits)
            factor = rng.getrandbits(bits // 2)
            for left, right in (
                (a, b),
                (-a, b),
                (a, -b),
                (-a, -b),
                (a * factor, b * factor),
                (a, 0),
                (0, -b),
            ):
                check(left, right)
    first, second = 0, 1
    for _ in range(1000):
        first, second = second, first + second
        check(first, second)
    return cases


def check_rejections():
    for body in (
        "    g, s, t = _cubic_extended_gcd(a, b)\n    return g + s\n",
        "    g = _cubic_extended_gcd(a, b)\n    return g\n",
        "    g, s, t = _cubic_extended_gcd(a, right=b)\n    return g\n",
        "    g, g, t = _cubic_extended_gcd(a, b)\n    return g\n",
    ):
        source = (
            "def _cubic_extended_gcd(a, b):\n    return (1, 0, 0)\n\n"
            + "def caller(a, b):\n"
            + body
        )
        try:
            transform(source)
        except AssertionError:
            continue
        raise AssertionError("unsafe transformation was accepted")
    return 4


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument(
        "--output", type=Path, help="create a new source copy exclusively"
    )
    args = parser.parse_args()
    raw = args.source.read_bytes()
    parent_hash = hashlib.sha256(raw).hexdigest()
    assert parent_hash == args.expected_sha256, "source identity changed"
    source = raw.decode()
    candidate, calls = transform(source)
    cases = check_arithmetic(source, candidate)
    rejected = check_rejections()
    if args.output is not None:
        with args.output.open("x") as target:
            target.write(candidate)
    print(
        json.dumps(
            {
                "diagnostic_only": True,
                "parent_sha256": parent_hash,
                "candidate_sha256": hashlib.sha256(candidate.encode()).hexdigest(),
                "candidate_bytes": len(candidate.encode()),
                "call_sites": calls,
                "arithmetic_cases": cases,
                "rejected_unsafe_transformations": rejected,
                "scope": "scalar arithmetic and source transformation, not class-group proof",
            }
        )
    )


if __name__ == "__main__":
    main()

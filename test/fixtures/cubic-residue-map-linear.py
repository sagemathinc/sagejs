"""Compare the production candidate filter with exhaustive residue maps."""

import ast
import json
import random
import sys
from pathlib import Path


def check():
    root = Path(__file__).resolve().parents[2]
    source = root / "src/lib/sagejs/number_fields/cubic_class_number_native.py"
    names = {
        "_cubic_map_linear_fiber",
        "_cubic_positive_mod",
        "_cubic_inverse_mod",
    }
    tree = ast.parse(source.read_text())
    selected = [
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name in names
    ]
    assert len(selected) == len(names)
    if "--source" in sys.argv:
        print("from sagejs.native import native, NativeIntegerVector, uint64")
        print(ast.unparse(ast.Module(body=selected, type_ignores=[])))
        return
    env = {"NativeIntegerVector": list, "uint64": int, "native": lambda fn: fn}
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(source), "exec"), env)
    helper = env["_cubic_map_linear_fiber"]
    rng = random.Random(104)
    checks = 0
    widths = set()
    vectors = []
    for prime in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31):
        cases = []
        # Split algebra, square-zero radical, and deliberately inconsistent
        # tensors supplement random controls whose map sets are often empty.
        split = [int(i == j == k) for i in range(3) for j in range(3) for k in range(3)]
        nilpotent = [
            int((i == 0 and j == k) or (j == 0 and i == k))
            for i in range(3)
            for j in range(3)
            for k in range(3)
        ]
        cases.extend(
            [(split, [1, 1, 1]), (nilpotent, [1, 0, 0]), ([0] * 27, [1, 0, 0])]
        )
        for _ in range(20):
            identity = [rng.randrange(prime) for _ in range(3)]
            if not any(identity):
                identity[0] = 1
            cases.append(
                ([rng.randrange(-(prime**2), prime**2) for _ in range(27)], identity)
            )
        for table, identity in cases:
            pivot = next(i for i in range(3) if identity[i] % prime)
            free = [i for i in range(3) if i != pivot]
            inverse = pow(identity[pivot], -1, prime)
            expected = []
            actual = []
            for x in range(prime):
                start, end = helper(table, prime, *identity, pivot, inverse, *free, x)
                assert 0 <= start <= end <= prime
                assert end - start in (0, 1, prime)
                if "--vectors" in sys.argv:
                    vectors.append(
                        [
                            table,
                            [prime, *identity, pivot, inverse, *free, x],
                            [start, end],
                        ]
                    )
                widths.add(
                    "empty"
                    if end == start
                    else "single"
                    if end - start == 1
                    else "full"
                )
                for y in range(prime):
                    values = [0, 0, 0]
                    values[free[0]], values[free[1]] = x, y
                    values[pivot] = (
                        (1 - sum(a * b for a, b in zip(identity, values)))
                        * inverse
                        % prime
                    )
                    valid = all(
                        (
                            sum(
                                table[(i * 3 + j) * 3 + k] * values[k] for k in range(3)
                            )
                            - values[i] * values[j]
                        )
                        % prime
                        == 0
                        for i in range(3)
                        for j in range(3)
                    )
                    if valid:
                        expected.append(tuple(values))
                        if start <= y < end:
                            actual.append(tuple(values))
            assert actual == expected, (prime, table, identity, actual, expected)
            checks += 1
    assert widths == {"empty", "single", "full"}, widths
    if "--vectors" in sys.argv:
        print(json.dumps(vectors))
    else:
        print(f"{checks} exhaustive production-source comparisons passed")


if __name__ == "__main__":
    check()

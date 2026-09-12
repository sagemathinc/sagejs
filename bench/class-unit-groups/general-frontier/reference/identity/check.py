"""Exact order-output consistency checks, not independent maximality proofs."""

from fractions import Fraction as Q
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "identity_shared", Path(__file__).parents[1] / "runner/screen-batch.py"
)
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)


def strict_json(data):
    value = shared.strict_json(data)
    json.dumps(value, allow_nan=False)
    return value


def rational(text):
    if not isinstance(text, str) or not 1 <= len(text) <= 4096:
        raise ValueError("invalid bounded rational string")
    value = Q(text)
    if str(value) != text:
        raise ValueError("rational must be canonical")
    return value


def inverse(matrix):
    n = len(matrix)
    a = [
        [Q(v) for v in row] + [Q(i == j) for j in range(n)]
        for i, row in enumerate(matrix)
    ]
    determinant = Q(1)
    for j in range(n):
        pivot = next((i for i in range(j, n) if a[i][j]), None)
        if pivot is None:
            raise ValueError("singular exact matrix")
        if pivot != j:
            a[pivot], a[j] = a[j], a[pivot]
            determinant = -determinant
        scale = a[j][j]
        determinant *= scale
        a[j] = [v / scale for v in a[j]]
        for i in range(n):
            if i != j:
                scale = a[i][j]
                a[i] = [v - scale * w for v, w in zip(a[i], a[j])]
    return [row[n:] for row in a], determinant


def multiply(a, b, polynomial):
    n = len(polynomial) - 1
    product = [Q(0)] * (2 * n - 1)
    for i, x in enumerate(a):
        for j, y in enumerate(b):
            product[i + j] += x * y
    for k in range(2 * n - 2, n - 1, -1):
        for j in range(n):
            product[k - n + j] -= product[k] * polynomial[j]
    return product[:n]


def coordinates(v, inverse_basis):
    return [sum(x * row[j] for x, row in zip(v, inverse_basis)) for j in range(len(v))]


def real_roots(polynomial):
    """Sturm count at signed infinity; a repeated-root input fails closed."""

    def trim(p):
        while p and not p[-1]:
            p.pop()
        return p

    chain = [
        [Q(x) for x in polynomial],
        [Q(i * polynomial[i]) for i in range(1, len(polynomial))],
    ]
    while len(chain[-1]) > 1:
        remainder = list(chain[-2])
        divisor = chain[-1]
        while len(remainder) >= len(divisor):
            degree, factor = len(remainder) - len(divisor), remainder[-1] / divisor[-1]
            for j, value in enumerate(divisor):
                remainder[j + degree] -= factor * value
            trim(remainder)
        if not remainder:
            raise ValueError("non-squarefree polynomial")
        chain.append([-x for x in remainder])

    def variations(negative):
        signs = [
            (1 if p[-1] > 0 else -1) * (-1 if negative and (len(p) - 1) % 2 else 1)
            for p in chain
        ]
        return sum(a != b for a, b in zip(signs, signs[1:]))

    return variations(True) - variations(False)


def validate(record, value, engine):
    label, coefficients = shared.validate_case(record)
    polynomial = [int(c) for c in coefficients]
    n = len(polynomial) - 1
    keys = {
        "schema",
        "engine",
        "label",
        "coefficients",
        "signature",
        "discriminant",
        "index",
        "basis",
        "maximality",
        "independent_maximality_replay",
    }
    if (
        set(value) != keys
        or value["schema"] != "sagejs.reference-order-identity.v1"
        or value["engine"] != engine
        or value["label"] != label
        or value["coefficients"] != coefficients
        or value["independent_maximality_replay"] is not False
    ):
        raise ValueError("identity request/schema mismatch")
    method = {"pari": "pari-nfcertify", "hecke": "hecke-maximal-order-no-hints"}[engine]
    maximality = value["maximality"]
    if (
        set(maximality) != {"method", "unresolved"}
        or maximality["method"] != method
        or not isinstance(maximality["unresolved"], list)
    ):
        raise ValueError("invalid engine maximality metadata")
    for composite in maximality["unresolved"]:
        if rational(composite).denominator != 1 or int(composite) < 2:
            raise ValueError("invalid unresolved composite")
    if engine == "hecke" and maximality["unresolved"]:
        raise ValueError("unsupported Hecke unresolved metadata")
    basis = value["basis"]
    if (
        not isinstance(basis, list)
        or len(basis) != n
        or any(not isinstance(row, list) or len(row) != n for row in basis)
    ):
        raise ValueError("wrong basis dimensions")
    basis = [[rational(x) for x in row] for row in basis]
    inv, determinant = inverse(basis)
    if any(x.denominator != 1 for row in inv for x in row):
        raise ValueError("basis does not contain equation order")
    index, disc = rational(value["index"]), rational(value["discriminant"])
    if (
        index.denominator != 1
        or index < 1
        or disc.denominator != 1
        or not disc
        or abs(1 / determinant) != index
    ):
        raise ValueError("invalid exact index/discriminant")
    powers = [[Q(i == j) for i in range(n)] for j in range(n)]

    def trace(element):
        return sum(multiply(element, powers[j], polynomial)[j] for j in range(n))

    gram = [[trace(multiply(a, b, polynomial)) for b in powers] for a in powers]
    _, polynomial_disc = inverse(gram)
    if polynomial_disc != disc * index**2 or determinant**2 * polynomial_disc != disc:
        raise ValueError("basis/discriminant/index identity failed")
    for a in basis:
        for b in basis:
            if any(
                c.denominator != 1 for c in coordinates(multiply(a, b, polynomial), inv)
            ):
                raise ValueError("basis lattice is not an order")
    real = real_roots(polynomial)
    if value["signature"] != [real, (n - real) // 2] or any(
        type(x) is not int for x in value["signature"]
    ):
        raise ValueError("signature differs from exact Sturm count")
    return {
        "consistent_order": True,
        "engine_established_maximality": not maximality["unresolved"],
        "independent_maximality_replay": False,
        "independent_irreducibility_replay": False,
        "polynomial_discriminant": str(polynomial_disc),
        "basis": value["basis"],
        "discriminant": str(disc),
        "index": str(index),
        "signature": value["signature"],
    }


def compare(record, pari, hecke):
    a, b = validate(record, pari, "pari"), validate(record, hecke, "hecke")
    inverse_b, _ = inverse([[rational(x) for x in row] for row in b["basis"]])
    transition = [
        coordinates([rational(x) for x in row], inverse_b) for row in a["basis"]
    ]
    _, determinant = inverse(transition)
    same_lattice = abs(determinant) == 1 and all(
        x.denominator == 1 for row in transition for x in row
    )
    return {
        "paired_order_consistency": same_lattice
        and all(a[k] == b[k] for k in ("discriminant", "index", "signature")),
        "both_engines_establish_maximality": a["engine_established_maximality"]
        and b["engine_established_maximality"],
        "independent_maximality_replay": False,
        "distinct_field_admission": False,
    }

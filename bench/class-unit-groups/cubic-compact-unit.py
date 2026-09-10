"""Research replay of compact cubic units, without expanded unit arithmetic.

Requires CPython and SymPy for independent exact integer HNF. This is not a
production certificate schema or a native kernel. A successful replay proves
unit membership in `ZZ[a]`, not fundamentality or a class-group result.
Each ideal's invertibility is checked, so maximality of `ZZ[a]` is unnecessary.
"""

import argparse
from fractions import Fraction
import hashlib
import json
from math import lcm
from pathlib import Path
import platform
import time


def signed_log_interval(exponents, intervals):
    """Accumulate exact, already authenticated logarithm intervals.

    This arithmetic does not authenticate the input logarithms. All endpoints
    must have the same positive scale, or be exact rationals in common units.
    """
    if len(exponents) != len(intervals):
        raise ValueError("logarithm dimension mismatch")
    lower = upper = 0
    for exponent, (left, right) in zip(exponents, intervals, strict=True):
        if type(exponent) is not int or left > right:
            raise ValueError("invalid exponent or reversed interval")
        if exponent >= 0:
            lower += exponent * left
            upper += exponent * right
        else:
            lower += exponent * right
            upper += exponent * left
    return lower, upper


def kernel_residual(exponents, rows, width):
    """Replay a sparse exact relation dependency, combining duplicate entries."""
    if type(width) is not int or not 0 <= width <= 4096:
        raise ValueError("invalid relation width")
    if len(exponents) != len(rows):
        raise ValueError("relation dimension mismatch")
    result = [0] * width
    for exponent, row in zip(exponents, rows, strict=True):
        if type(exponent) is not int or abs(exponent).bit_length() > 4096:
            raise ValueError("invalid or excessive dependency exponent")
        for column, value in row:
            if type(column) is not int or not 0 <= column < width:
                raise ValueError("relation column out of range")
            if type(value) is not int:
                raise ValueError("nonintegral relation exponent")
            result[column] += exponent * value
    return result


class CubicIdealReplay:
    """Small exact lattice oracle, independent of PARI's ideal arithmetic."""

    def __init__(self, polynomial):
        from sympy import Matrix, Poly, symbols
        from sympy.matrices.normalforms import hermite_normal_form

        if len(polynomial) != 4 or polynomial[3] != 1:
            raise ValueError("a monic cubic is required")
        if any(type(c) is not int or abs(c).bit_length() > 4096 for c in polynomial):
            raise ValueError("invalid polynomial coefficients")
        x = symbols("x")
        poly = Poly(sum(c * x**i for i, c in enumerate(polynomial)), x)
        if not poly.is_irreducible or poly.discriminant() >= 0:
            raise ValueError("an irreducible complex cubic is required")
        self.polynomial = polynomial
        self.matrix = Matrix
        self.hnf = hermite_normal_form
        self.one = Matrix.eye(3)
        self.ideals = []
        self.indices = {}

    def multiply(self, left, right):
        coefficients = [0] * 5
        for i in range(3):
            for j in range(3):
                coefficients[i + j] += left[i] * right[j]
        for i in (4, 3):
            for j in range(3):
                coefficients[i - 3 + j] -= coefficients[i] * self.polynomial[j]
        return coefficients[:3]

    def multiplication_matrix(self, value):
        return self.matrix.hstack(
            *(self.matrix(self.multiply(value, self.one[:, i])) for i in range(3))
        )

    def product(self, left, right):
        return self.hnf(
            self.matrix.hstack(
                *(
                    self.matrix(self.multiply(left[:, i], right[:, j]))
                    for i in range(3)
                    for j in range(3)
                )
            )
        )

    def power(self, ideal, exponent):
        if not 0 <= exponent <= 64:
            raise ValueError("individual ideal exponent exceeds replay cap")
        result = self.one
        while exponent:
            if exponent % 2:
                result = self.product(result, ideal)
            exponent //= 2
            if exponent:
                ideal = self.product(ideal, ideal)
        return result

    def ideal(self, columns):
        if len(columns) != 3 or any(len(c) != 3 for c in columns):
            raise ValueError("ideal must have three columns")
        if any(
            type(v) is not int or abs(v).bit_length() > 4096 for c in columns for v in c
        ):
            raise ValueError("invalid ideal entry")
        matrix = self.matrix.hstack(*(self.matrix(c) for c in columns))
        if matrix.det() <= 0 or self.hnf(matrix) != matrix:
            raise ValueError("ideal must be canonical full-rank positive HNF")
        key = tuple(matrix)
        if key in self.indices:
            return self.indices[key], matrix
        if len(self.ideals) >= 4096:
            raise ValueError("too many ideals")
        # Closure under a suffices for closure under ZZ[a].
        a_matrix = self.multiplication_matrix([0, 1, 0])
        if self.hnf(self.matrix.hstack(matrix, a_matrix * matrix)) != matrix:
            raise ValueError("lattice is not an ideal of ZZ[a]")
        # xI subset O iff every multiplication-matrix row pairs integrally
        # with x. Their integer span S gives I^-1 = S^(-transpose) ZZ^3.
        dual = self.hnf(
            self.matrix.hstack(
                *(self.multiplication_matrix(matrix[:, i]).T for i in range(3))
            )
        )
        denominator = dual.det()
        inverse_numerator = dual.adjugate().T
        if self.product(matrix, inverse_numerator) != denominator * self.one:
            raise ValueError("ideal is not invertible")
        index = len(self.ideals)
        self.ideals.append(matrix)
        self.indices[key] = index
        return index, matrix

    def relation(self, coordinates, factors):
        if len(coordinates) != 3:
            raise ValueError("three rational coordinates required")
        for pair in coordinates:
            if len(pair) != 2 or any(type(v) is not int for v in pair) or pair[1] <= 0:
                raise ValueError("invalid rational coordinate")
            if any(abs(v).bit_length() > 4096 for v in pair):
                raise ValueError("coordinate exceeds replay cap")
        alpha = [Fraction(*pair) for pair in coordinates]
        denominator = lcm(*(c.denominator for c in alpha))
        numerator = [int(c * denominator) for c in alpha]
        if not any(numerator):
            raise ValueError("zero factor")
        if len(factors) > 128:
            raise ValueError("too many factors in an individual relation")
        positive = negative = self.one
        row = []
        for factor in factors:
            if len(factor) != 4 or type(factor[3]) is not int:
                raise ValueError("invalid ideal factor")
            index, ideal = self.ideal(factor[:3])
            exponent = factor[3]
            powered = self.power(ideal, abs(exponent))
            if exponent >= 0:
                positive = self.product(positive, powered)
            else:
                negative = self.product(negative, powered)
            row.append((index, exponent))
        left = self.hnf(self.multiplication_matrix(numerator) * negative)
        if left != denominator * positive:
            raise ValueError("principal ideal relation mismatch")
        return row


def replay(polynomial, factors):
    """Prove a formal product is a unit; never expand dependency powers."""
    if not 1 <= len(factors) <= 2048:
        raise ValueError("compact factor count exceeds replay cap")
    oracle = CubicIdealReplay(polynomial)
    rows = []
    exponents = []
    for coordinates, exponent, ideal_factors in factors:
        if type(exponent) is not int or abs(exponent).bit_length() > 4096:
            raise ValueError("invalid dependency exponent")
        rows.append(oracle.relation(coordinates, ideal_factors))
        exponents.append(exponent)
    residual = kernel_residual(exponents, rows, len(oracle.ideals))
    if any(residual):
        raise ValueError("nonzero ideal dependency residual")
    return {
        "unit_membership_proven": True,
        "fundamentality_proven": False,
        "class_group_proven": False,
        "factors": len(factors),
        "ideals": len(oracle.ideals),
        "relation_entries": sum(map(len, rows)),
        "maximum_exponent_bits": max(abs(e).bit_length() for e in exponents),
        "expanded_dependency_powers": 0,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gp_log", type=Path)
    args = parser.parse_args()
    data = args.gp_log.read_bytes()
    text = data.decode()
    # GP can continue after an error and exit zero. Markers alone are unsafe.
    for line in text.splitlines():
        if "***" in line and "Warning:" not in line:
            raise ValueError("GP export contains an error")
    body = text.split("COMPACT_BEGIN\n", 1)[1].split("COMPACT_END", 1)[0]
    values = [json.loads(line) for line in body.splitlines() if line.strip()]
    started = time.perf_counter()
    result = replay(values[0], values[1:])
    result.update(
        input_sha256=hashlib.sha256(data).hexdigest(),
        verifier_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        python_version=platform.python_version(),
        sympy_version=__import__("sympy").__version__,
        diagnostic_seconds=time.perf_counter() - started,
        backend="CPython/SymPy exact ideal replay; no PARI calls",
    )
    print(json.dumps(result))


if __name__ == "__main__":
    main()

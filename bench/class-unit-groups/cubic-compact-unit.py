"""Research replay of compact cubic units, without expanded unit arithmetic.

Requires CPython and SymPy for independent exact integer HNF. This is not a
production certificate schema or a native kernel. A successful replay proves
unit membership in the supplied order, not fundamentality or a class-group
result. The default order is `ZZ[a]`. A rational power-basis matrix may instead
specify any order: closure and the identity are checked exactly, as is each
ideal's invertibility. Maximality is neither assumed nor proved.
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


def classify_unit_log_interval(lower, upper, scale):
    """Classify an authenticated complex-cubic unit's real log interval.

    Unit membership, signature `(1, 1)`, and the enclosure are preconditions,
    not established by this arithmetic predicate. Every non-torsion unit in
    a complex cubic has real absolute logarithm greater than `1/5`; see the
    elementary proof in `docs/complex-cubic-native-class-group-proof.md`.
    Thus a zero-containing interval inside that gap proves torsion without
    expanding the compact product. Merely containing zero is inconclusive.

    Return `torsion`, `nontorsion`, or `inconclusive`. An interval entirely
    in the forbidden punctured gap contradicts the preconditions and raises
    `ValueError`. No classification proves unit-subgroup saturation.
    """
    if any(type(value) is not int for value in (lower, upper, scale)):
        raise ValueError("integer logarithm endpoints and scale required")
    if scale <= 0 or lower > upper:
        raise ValueError("invalid logarithm interval")
    inside_gap = 5 * lower >= -scale and 5 * upper <= scale
    contains_zero = lower <= 0 <= upper
    if inside_gap:
        if not contains_zero:
            raise ValueError("interval contradicts the complex-cubic unit gap")
        return "torsion"
    return "inconclusive" if contains_zero else "nontorsion"


def positive_log_bounds(value, bits=128):
    """Enclose log of a positive rational in integer units of `2**bits`.

    Reduce to `[1, 2]`, then use `log(v) = 2*atanh((v-1)/(v+1))`.
    Every fixed-point operation rounds outward. After N terms, the omitted
    positive tail is at most `9/(4*(2*N+1)*3**(2*N+1))`, since `0 <= y <= 1/3`.
    This is a rational-arithmetic oracle, not a floating-point log call.
    """
    if type(bits) is not int or not 16 <= bits <= 4096:
        raise ValueError("invalid logarithm precision")
    value = Fraction(value)
    if value <= 0:
        raise ValueError("positive logarithm argument required")
    scale = 1 << bits
    exponent = value.numerator.bit_length() - value.denominator.bit_length()
    reduced = value / (1 << exponent) if exponent >= 0 else value * (1 << -exponent)
    if reduced < 1:
        reduced *= 2
        exponent -= 1
    if not 1 <= reduced <= 2:
        raise ValueError("invalid logarithm reduction")

    def ceil_div(a, b):
        return -(-a // b)

    def series(v):
        y = (v - 1) / (v + 1)
        lo = y.numerator * scale // y.denominator
        hi = ceil_div(y.numerator * scale, y.denominator)
        square_lo, square_hi = lo * lo // scale, ceil_div(hi * hi, scale)
        power_lo, power_hi = lo, hi
        lower = upper = 0
        terms = bits // 3 + 2
        for j in range(terms):
            lower += 2 * power_lo // (2 * j + 1)
            upper += ceil_div(2 * power_hi, 2 * j + 1)
            power_lo = power_lo * square_lo // scale
            power_hi = ceil_div(power_hi * square_hi, scale)
        upper += ceil_div(9 * scale, 4 * (2 * terms + 1) * 3 ** (2 * terms + 1))
        return lower, upper

    return signed_log_interval([1, exponent], [series(reduced), series(Fraction(2))])


def compact_real_log_bounds(oracle, coordinates, exponents, bits=128):
    """Enclose the real log-absolute-value of an unexpanded formal product.

    Exact real-root isolation and rational interval Horner evaluation enclose
    each generator. Zero-containing intervals fail closed and request more
    precision; they never establish torsion. Unit membership must be checked
    separately. A strictly signed result proves the formal product nontorsion.
    """
    from sympy import Poly, Rational, symbols

    if type(bits) is not int or not 16 <= bits <= 4096:
        raise ValueError("invalid logarithm precision")
    if len(coordinates) != len(exponents):
        raise ValueError("logarithm dimension mismatch")
    x = symbols("x")
    poly = Poly(sum(c * x**i for i, c in enumerate(oracle.polynomial)), x)
    roots = poly.intervals(eps=Rational(1, 1 << bits))
    if len(roots) != 1 or roots[0][1] != 1:
        raise ValueError("expected a unique simple real root")
    root_lo, root_hi = (Fraction(v) for v in roots[0][0])
    intervals = []
    for coordinate in coordinates:
        if len(coordinate) != 3:
            raise ValueError("three rational coordinates required")
        power = oracle.basis * oracle.matrix([Fraction(*v) for v in coordinate])
        lo = hi = Fraction(power[2])
        for coefficient in (power[1], power[0]):
            products = [lo * root_lo, lo * root_hi, hi * root_lo, hi * root_hi]
            lo, hi = (
                min(products) + Fraction(coefficient),
                max(products) + Fraction(coefficient),
            )
        if lo <= 0 <= hi:
            raise ValueError("generator interval contains zero; increase precision")
        if hi < 0:
            lo, hi = -hi, -lo
        intervals.append(
            (positive_log_bounds(lo, bits)[0], positive_log_bounds(hi, bits)[1])
        )
    return signed_log_interval(exponents, intervals)


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

    def __init__(self, polynomial, basis=None):
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
        self.basis = self.one
        if basis is not None:
            if len(basis) != 3 or any(len(column) != 3 for column in basis):
                raise ValueError("basis must have three rational columns")
            columns = []
            for column in basis:
                values = []
                for pair in column:
                    if (
                        len(pair) != 2
                        or any(type(v) is not int for v in pair)
                        or pair[1] <= 0
                        or any(abs(v).bit_length() > 4096 for v in pair)
                    ):
                        raise ValueError("invalid rational basis entry")
                    values.append(Fraction(*pair))
                columns.append(Matrix(values))
            self.basis = Matrix.hstack(*columns)
        if self.basis.det() == 0:
            raise ValueError("singular order basis")
        inverse = self.basis.inv()
        identity = inverse * Matrix([1, 0, 0])
        if any(v.q != 1 for v in identity):
            raise ValueError("order basis does not contain the identity")
        self.identity = [int(v) for v in identity]
        self.table = []
        for i in range(3):
            row = []
            for j in range(3):
                value = inverse * Matrix(
                    self.power_basis_multiply(self.basis[:, i], self.basis[:, j])
                )
                if any(v.q != 1 for v in value):
                    raise ValueError("order basis is not closed under multiplication")
                row.append([int(v) for v in value])
            self.table.append(row)

    def power_basis_multiply(self, left, right):
        coefficients = [0] * 5
        for i in range(3):
            for j in range(3):
                coefficients[i + j] += left[i] * right[j]
        for i in (4, 3):
            for j in range(3):
                coefficients[i - 3 + j] -= coefficients[i] * self.polynomial[j]
        return coefficients[:3]

    def multiply(self, left, right):
        return [
            sum(
                left[i] * right[j] * self.table[i][j][k]
                for i in range(3)
                for j in range(3)
            )
            for k in range(3)
        ]

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
        # For a non-power basis, checking multiplication by a alone is not
        # enough: verify closure under every supplied order basis element.
        for i in range(3):
            multiplication = self.multiplication_matrix(self.one[:, i])
            if self.hnf(self.matrix.hstack(matrix, multiplication * matrix)) != matrix:
                raise ValueError("lattice is not an ideal of the supplied order")
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


def replay(polynomial, factors, basis=None):
    """Prove a formal product is a unit; never expand dependency powers."""
    if not 1 <= len(factors) <= 2048:
        raise ValueError("compact factor count exceeds replay cap")
    oracle = CubicIdealReplay(polynomial, basis)
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
        "order_basis_checked": True,
        "order_maximality_proven": False,
        "factors": len(factors),
        "ideals": len(oracle.ideals),
        "relation_entries": sum(map(len, rows)),
        "maximum_exponent_bits": max(abs(e).bit_length() for e in exponents),
        "expanded_dependency_powers": 0,
    }


def replay_with_log(polynomial, factors, lower, upper, scale, basis=None, bits=256):
    """Authenticate a compact unit and a proposed real-log enclosure.

    Recompute principal ideal equalities and the dependency residual first.
    Then isolate the real root and evaluate a fresh rational-arithmetic log
    enclosure. Acceptance requires this independent enclosure to be contained
    in the proposed interval, using exact cross multiplication across scales.
    Failure of containment is inconclusive, not proof that the proposal is
    false: the independent precision may be insufficient. No native or PARI
    logarithm, kernel, or expanded dependency product is trusted here.
    """
    if any(type(v) is not int for v in (lower, upper, scale)):
        raise ValueError("integer logarithm endpoints and scale required")
    if scale <= 0 or lower > upper:
        raise ValueError("invalid logarithm interval")
    result = replay(polynomial, factors, basis)
    oracle = CubicIdealReplay(polynomial, basis)
    independent_lower, independent_upper = compact_real_log_bounds(
        oracle, [f[0] for f in factors], [f[1] for f in factors], bits
    )
    independent_scale = 1 << bits
    if (
        lower * independent_scale > independent_lower * scale
        or independent_upper * scale > upper * independent_scale
    ):
        raise ValueError("proposed log enclosure not established at replay precision")
    result.update(
        log_enclosure_proven=True,
        log_lower=str(independent_lower),
        log_upper=str(independent_upper),
        log_scale=str(independent_scale),
        unit_classification=classify_unit_log_interval(
            independent_lower, independent_upper, independent_scale
        ),
    )
    return result


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

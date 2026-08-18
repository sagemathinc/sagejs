#!/usr/bin/env python3
"""Independent tiny-field point-count and Hasse--Witt oracle.

This intentionally uses no Sage, PARI, Magma, NumPy, or native package.  It is
slow and small: the checked-in cases only require extensions of degree at most
three.  That makes it a useful normalization oracle rather than a production
algorithm.
"""

import argparse
import itertools
import json
import platform
import sys
import time


class FiniteField:
    def __init__(self, prime, degree):
        self.p = prime
        self.n = degree
        self.q = prime**degree
        self.zero = (0,) * degree
        self.one = (1,) + (0,) * (degree - 1)
        self.modulus = self._find_modulus()
        self.elements = list(itertools.product(range(prime), repeat=degree))

    def _base_eval(self, coefficients, value):
        result = 0
        for coefficient in reversed(coefficients):
            result = (result * value + coefficient) % self.p
        return result

    def _find_modulus(self):
        if self.n == 1:
            return (0, 1)
        # A monic quadratic or cubic is irreducible exactly when it has no
        # root in the prime field.
        for low in itertools.product(range(self.p), repeat=self.n):
            if low[0] == 0:
                continue
            polynomial = low + (1,)
            if all(self._base_eval(polynomial, x) != 0 for x in range(self.p)):
                return polynomial
        raise RuntimeError("no irreducible polynomial found")

    def add(self, left, right):
        return tuple((a + b) % self.p for a, b in zip(left, right))

    def neg(self, value):
        return tuple((-entry) % self.p for entry in value)

    def mul(self, left, right):
        raw = [0] * (2 * self.n - 1)
        for i, a in enumerate(left):
            for j, b in enumerate(right):
                raw[i + j] = (raw[i + j] + a * b) % self.p
        for degree in range(len(raw) - 1, self.n - 1, -1):
            leading = raw[degree]
            if leading:
                for i in range(self.n):
                    raw[degree - self.n + i] = (
                        raw[degree - self.n + i] - leading * self.modulus[i]
                    ) % self.p
        return tuple(raw[: self.n])

    def pow(self, value, exponent):
        result = self.one
        base = value
        while exponent:
            if exponent & 1:
                result = self.mul(result, base)
            base = self.mul(base, base)
            exponent //= 2
        return result

    def constant(self, value):
        return (value % self.p,) + (0,) * (self.n - 1)

    def evaluate(self, coefficients, value):
        result = self.zero
        for coefficient in reversed(coefficients):
            result = self.add(self.mul(result, value), self.constant(coefficient))
        return result


def count_points(case, extension_degree):
    field = FiniteField(int(case["prime"]), extension_degree)
    f = case["f"]
    h = case["h"]
    count = 0
    if field.p != 2:
        four = field.constant(4)
        for x in field.elements:
            fx = field.evaluate(f, x)
            hx = field.evaluate(h, x)
            discriminant = field.add(field.mul(hx, hx), field.mul(four, fx))
            if discriminant == field.zero:
                count += 1
            elif field.pow(discriminant, (field.q - 1) // 2) == field.one:
                count += 2
    else:
        for x in field.elements:
            fx = field.evaluate(f, x)
            hx = field.evaluate(h, x)
            for y in field.elements:
                if field.add(field.mul(y, y), field.mul(hx, y)) == fx:
                    count += 1

    # Points at infinity solve z^2 + h_(g+1) z = f_(2g+2) in the
    # weighted-projective closure.  Missing coefficients are zero.
    genus = int(case["genus"])
    h_leading = h[genus + 1] if len(h) > genus + 1 else 0
    f_leading = f[2 * genus + 2] if len(f) > 2 * genus + 2 else 0
    h_value = field.constant(h_leading)
    f_value = field.constant(f_leading)
    for z in field.elements:
        if field.add(field.mul(z, z), field.mul(h_value, z)) == f_value:
            count += 1
    return count


def reconstruct(genus, q, counts):
    coefficients = [1]
    power_sums = [None] + [q**k + 1 - counts[k - 1] for k in range(1, genus + 1)]
    for k in range(1, genus + 1):
        numerator = sum(coefficients[k - i] * power_sums[i] for i in range(1, k + 1))
        assert numerator % k == 0
        coefficients.append(-numerator // k)
    full = [0] * (2 * genus + 1)
    for i, coefficient in enumerate(coefficients):
        full[i] = coefficient
        full[2 * genus - i] = q ** (genus - i) * coefficient
    return full


def polynomial_mul(left, right, prime):
    result = [0] * (len(left) + len(right) - 1)
    for i, a in enumerate(left):
        for j, b in enumerate(right):
            result[i + j] = (result[i + j] + a * b) % prime
    return result


def permutation_sign(permutation):
    inversions = sum(
        permutation[i] > permutation[j]
        for i in range(len(permutation))
        for j in range(i + 1, len(permutation))
    )
    return -1 if inversions % 2 else 1


def determinant_i_minus_tw(matrix, prime):
    genus = len(matrix)
    result = [0] * (genus + 1)
    for permutation in itertools.permutations(range(genus)):
        term = [1]
        for row, column in enumerate(permutation):
            term = polynomial_mul(
                term,
                [1 if row == column else 0, -matrix[row][column] % prime],
                prime,
            )
        sign = permutation_sign(permutation)
        for degree, coefficient in enumerate(term):
            result[degree] = (result[degree] + sign * coefficient) % prime
    return result


def prime_polynomial_mul(left, right, prime):
    result = [0] * (len(left) + len(right) - 1)
    for i, a in enumerate(left):
        for j, b in enumerate(right):
            result[i + j] = (result[i + j] + a * b) % prime
    while len(result) > 1 and result[-1] == 0:
        result.pop()
    return result


def prime_polynomial_pow(base, exponent, prime):
    result = [1]
    while exponent:
        if exponent & 1:
            result = prime_polynomial_mul(result, base, prime)
        base = prime_polynomial_mul(base, base, prime)
        exponent //= 2
    return result


def matrix_mul(left, right, prime):
    size = len(left)
    return [
        [
            sum(left[i][k] * right[k][j] for k in range(size)) % prime
            for j in range(size)
        ]
        for i in range(size)
    ]


def matrix_rank(matrix, prime):
    work = [row[:] for row in matrix]
    rows = len(work)
    columns = len(work[0]) if rows else 0
    rank = 0
    for column in range(columns):
        pivot = next((row for row in range(rank, rows) if work[row][column]), None)
        if pivot is None:
            continue
        work[rank], work[pivot] = work[pivot], work[rank]
        inverse = pow(work[rank][column], -1, prime)
        work[rank] = [(entry * inverse) % prime for entry in work[rank]]
        for row in range(rows):
            if row != rank and work[row][column]:
                scale = work[row][column]
                work[row] = [
                    (a - scale * b) % prime for a, b in zip(work[row], work[rank])
                ]
        rank += 1
    return rank


def hasse_witt(case):
    prime = int(case["prime"])
    genus = int(case["genus"])
    if prime == 2 or case["h"] != [0] or len(case["f"]) - 1 != 2 * genus + 1:
        return None, None
    power = prime_polynomial_pow(
        [coefficient % prime for coefficient in case["f"]], (prime - 1) // 2, prime
    )
    matrix = []
    for i in range(1, genus + 1):
        row = []
        for j in range(1, genus + 1):
            index = prime * i - j
            row.append(power[index] if index < len(power) else 0)
        matrix.append(row)
    characteristic = determinant_i_minus_tw(matrix, prime)
    stable = [row[:] for row in matrix]
    for _ in range(genus - 1):
        stable = matrix_mul(stable, matrix, prime)
    return (
        {
            "modulus": str(prime),
            "rows": [[str(entry) for entry in row] for row in matrix],
            "characteristic_polynomial_mod_p": [str(entry) for entry in characteristic],
        },
        matrix_rank(stable, prime),
    )


def case_result(case):
    if case.get("expect_bad", False):
        return {"id": case["id"], "good": False, "reason": "marked singular reduction"}
    genus = int(case["genus"])
    prime = int(case["prime"])
    counts = [count_points(case, degree) for degree in range(1, genus + 1)]
    polynomial = reconstruct(genus, prime, counts)
    matrix, p_rank = hasse_witt(case)
    return {
        "id": case["id"],
        "good": True,
        "lpolynomial_coefficients_ascending": [str(value) for value in polynomial],
        "extension_point_counts": [str(value) for value in counts],
        "jacobian_order": str(sum(polynomial)),
        "hasse_witt": matrix,
        "p_rank": None if p_rank is None else str(p_rank),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("cases")
    parser.add_argument("--repeat", type=int, default=1)
    arguments = parser.parse_args()
    with open(arguments.cases, encoding="utf-8") as stream:
        cases = json.load(stream)
    if arguments.repeat < 1:
        parser.error("--repeat must be positive")
    timings = []
    rows = None
    for _ in range(arguments.repeat):
        started = time.perf_counter()
        rows = [case_result(case) for case in cases["cases"]]
        timings.append((time.perf_counter() - started) * 1000)
    output = {
        "oracle": {
            "name": "exhaustive-python",
            "version": "1",
            "python": platform.python_version(),
        },
        "timings_ms": timings,
        "rows": rows,
    }
    json.dump(output, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()

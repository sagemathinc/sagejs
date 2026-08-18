"""Persistent Sage developer oracle for the frozen maximal-order corpus.

Input is ``id<TAB>c0,c1,...,cn`` with ascending integral coefficients.
Output uses Sage's canonical row-HNF numerator/common-denominator form. The
corpus verifier compares its lattice with the lower-left corpus convention.
"""

import sys


R = PolynomialRing(QQ, "x")


def csv_matrix(matrix):
    return ";".join(
        ",".join(str(matrix[row, column]) for column in range(matrix.ncols()))
        for row in range(matrix.nrows())
    )


for line in sys.stdin:
    if not line.strip():
        continue
    case_id, raw_coefficients = line.rstrip("\n").split("\t", 1)
    try:
        polynomial = R([ZZ(value) for value in raw_coefficients.split(",")])
        field = NumberField(polynomial, "a", check=False)
        order = field.maximal_order()
        rational_basis = matrix(QQ, [element.list() for element in order.basis()])
        denominator = lcm(entry.denominator() for entry in rational_basis.list())
        numerator = matrix(ZZ, denominator * rational_basis)
        numerator = numerator.hermite_form()
        common = gcd([denominator] + [abs(entry) for entry in numerator.list()])
        denominator //= common
        numerator = numerator.apply_map(lambda entry: entry // common)
        print(
            case_id,
            order.discriminant(),
            denominator,
            csv_matrix(numerator),
            sep="\t",
            flush=True,
        )
    except Exception as error:
        print(
            case_id,
            "ERROR",
            type(error).__name__ + ":" + str(error),
            sep="\t",
            flush=True,
        )

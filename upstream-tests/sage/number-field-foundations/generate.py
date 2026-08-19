"""Regenerate the Sage/PARI number-field-foundations oracle corpus.

Run this with a Sage installation, never from the ordinary offline test suite:

    sage upstream-tests/sage/number-field-foundations/generate.py \
      test/fixtures/number-field-foundations/corpus.json

The process is deliberately persistent: all fields, primes, precisions, and
analytic points are handled by one Sage process so startup is not benchmarked.
"""

import hashlib
import json
import os
import sys

from sage.all import (
    CC,
    ComplexField,
    NumberField,
    PolynomialRing,
    QQ,
    RealField,
    ZZ,
    ceil,
    gcd,
    kronecker_symbol,
    lcm,
    matrix,
    prime_range,
    prod,
    sqrt,
)
from sage.env import SAGE_VERSION
from sage.libs.pari.all import pari


SCHEMA = "sagejs.number-fields/foundations-oracle-v1"
COEFFICIENT_BOUND = 64
STANDARD_PRECISIONS = [53, 100, 200]
SELECTED_512 = {"qq", "imaginary-d23", "cubic-mixed"}
ANALYTIC_POINTS = [
    ("right-half-plane", "2", "1"),
    ("critical-region", "0.5", "0.75"),
    ("left-half-plane", "-1.25", "0.5"),
]
KRONECKER_DISCRIMINANTS = [-3, -4, -7, -8, -20, -23, -39, -84, 5, 8, 12, 13, 61]
EXTRA_PRIMES = {
    "cubic-dedekind-nonmonogenic": [101, 1009],
    "sextic-mixed": [1009, 65537],
}

R = PolynomialRing(QQ, "x")
x = R.gen()

# Coefficients below are written in the normal mathematical high-level form;
# the committed JSON always stores them constant-first.
CASES = [
    ("qq", x - 1, ["degree-one", "normalization"]),
    ("imaginary-d3", x**2 + x + 1, ["quadratic", "imaginary", "cyclotomic"]),
    ("imaginary-d4", x**2 + 1, ["quadratic", "imaginary", "cyclotomic"]),
    ("imaginary-d7", x**2 - x + 2, ["quadratic", "imaginary"]),
    ("imaginary-d20", x**2 + 5, ["quadratic", "imaginary", "class-number-2"]),
    ("imaginary-d23", x**2 - x + 6, ["quadratic", "imaginary", "class-number-3"]),
    ("imaginary-d84", x**2 + 21, ["quadratic", "imaginary", "noncyclic-class-group"]),
    (
        "imaginary-d10007",
        x**2 - x + 2502,
        ["quadratic", "imaginary", "large-class-number"],
    ),
    (
        "imaginary-index-5",
        x**2 - x + 244,
        ["quadratic", "imaginary", "nonmaximal-equation-order", "index-prime-5"],
    ),
    ("real-d5", x**2 - x - 1, ["quadratic", "real"]),
    ("real-d8", x**2 - 2, ["quadratic", "real"]),
    ("real-d12", x**2 - 3, ["quadratic", "real"]),
    ("real-d13", x**2 - x - 3, ["quadratic", "real"]),
    (
        "real-d61-large-unit",
        x**2 - 61,
        ["quadratic", "real", "large-fundamental-unit", "index-prime-2"],
    ),
    ("cubic-real", x**3 - x**2 - 2 * x + 1, ["cubic", "totally-real", "real-cyclotomic-subfield"]),
    ("cubic-mixed", x**3 - x - 1, ["cubic", "mixed", "isomorphism-pair-a"]),
    (
        "cubic-mixed-shift",
        x**3 - 3 * x**2 + 2 * x - 1,
        ["cubic", "mixed", "isomorphism-pair-b"],
    ),
    (
        "cubic-dedekind-nonmonogenic",
        x**3 - x**2 - 2 * x - 8,
        ["cubic", "mixed", "nonmonogenic-field", "index-prime-2", "dedekind-index-obstruction"],
    ),
    ("quartic-real", x**4 - x**3 - 3 * x**2 + x + 1, ["quartic", "totally-real"]),
    ("quartic-mixed", x**4 - x**2 - 1, ["quartic", "mixed"]),
    ("quartic-complex", x**4 + 1, ["quartic", "totally-complex", "cyclotomic"]),
    ("quintic-mixed", x**5 - x - 1, ["quintic", "mixed"]),
    ("sextic-mixed", x**6 - x - 1, ["sextic", "mixed"]),
]


def integer_string(value):
    return str(ZZ(value))


def rational_string(value):
    value = QQ(value)
    if value.denominator() == 1:
        return str(value.numerator())
    return "%s/%s" % (value.numerator(), value.denominator())


def complex_record(value, bits):
    value = ComplexField(bits)(value)
    digits = int(ceil(bits * RealField(80)(2).log10())) + 3
    return {
        "real": value.real().str(digits=digits),
        "imag": value.imag().str(digits=digits),
    }


def real_record(value, bits):
    value = RealField(bits)(value)
    digits = int(ceil(bits * RealField(80)(2).log10())) + 3
    return value.str(digits=digits)


def element_record(value, degree):
    coefficients = list(value)
    coefficients += [QQ(0)] * (degree - len(coefficients))
    return [rational_string(c) for c in coefficients]


def rational_lattice(elements, degree):
    rows = []
    for value in elements:
        coefficients = list(value)
        coefficients += [QQ(0)] * (degree - len(coefficients))
        rows.append(coefficients)
    M = matrix(QQ, rows)
    denominator = lcm([c.denominator() for c in M.list()] or [1])
    numerator = denominator * M
    return {
        "denominator": integer_string(denominator),
        "numerator": [[integer_string(c) for c in row] for row in numerator.rows()],
    }


def pari_hnf_record(ideal):
    M = matrix(ZZ, ideal.pari_hnf().sage())
    return [[integer_string(c) for c in row] for row in M.rows()]


def factor_record(K, p):
    factors = []
    for P, e in K.factor(p):
        f = ZZ(P.residue_class_degree())
        factors.append(
            {
                "e": int(e),
                "f": int(f),
                "norm": integer_string(P.absolute_norm()),
                "hnfRelativeToMaximalOrder": pari_hnf_record(P),
                "basisRelativeToPowerBasis": rational_lattice(P.basis(), K.degree()),
            }
        )
    factors.sort(key=lambda row: (row["f"], row["e"], row["hnfRelativeToMaximalOrder"]))
    return {
        "p": str(p),
        "factors": factors,
        "degreeSum": int(sum(row["e"] * row["f"] for row in factors)),
    }


def completed_value(K, zeta_value, s):
    C = s.parent()
    r1, r2 = K.signature()
    gamma_r = C.pi() ** (-s / 2) * (s / 2).gamma()
    gamma_c = 2 * (2 * C.pi()) ** (-s) * s.gamma()
    return C(abs(ZZ(K.discriminant()))) ** (s / 2) * gamma_r**r1 * gamma_c**r2 * zeta_value


def analytic_record(K, bits):
    C = ComplexField(bits)
    Z = K.zeta_function(prec=bits)
    rows = []
    for label, real, imag in ANALYTIC_POINTS:
        s = C(real, imag)
        value = Z(s)
        completed = completed_value(K, value, s)
        rows.append(
            {
                "label": label,
                "s": complex_record(s, bits),
                "value": complex_record(value, bits),
                "derivative1": complex_record(Z.derivative(s, 1), bits),
                "derivative2": complex_record(Z.derivative(s, 2), bits),
                "completedValue": complex_record(completed, bits),
                "xiValue": complex_record(s * (s - 1) * completed, bits),
            }
        )

    # Ask PARI for a Laurent series, rather than estimating a residue from
    # nearby midpoint values. CyPari converts the coefficient back with its
    # actual precision intact.
    parameter = pari("x + O(x^4)")
    laurent = pari.lfun(Z._L, 1 + parameter, precision=bits)
    residue = RealField(bits)(laurent.polcoef(-1).sage())
    finite_part = RealField(bits)(laurent.polcoef(0).sage())
    return {
        "bits": int(bits),
        "points": rows,
        "residueAtOne": real_record(residue, bits),
        "finitePartAtOne": real_record(finite_part, bits),
    }


def field_record(case_id, polynomial, tags):
    K = NumberField(polynomial, "a")
    O = K.maximal_order()
    degree = K.degree()
    equation_discriminant = ZZ(polynomial.discriminant())
    field_discriminant = ZZ(K.discriminant())
    index_square = abs(equation_discriminant // field_discriminant)
    equation_order_index = ZZ(sqrt(index_square))
    assert equation_order_index**2 == index_square

    # All primes needed to validate a_1,...,a_64, plus explicit presentation
    # and ramification primes. The latter are normally already small, but the
    # union makes the intention durable if the case list changes.
    primes = set(ZZ(p) for p in prime_range(COEFFICIENT_BOUND + 1))
    primes.update(ZZ(p) for p, _ in equation_order_index.factor())
    primes.update(ZZ(p) for p, _ in abs(field_discriminant).factor())
    primes.update(ZZ(p) for p in EXTRA_PRIMES.get(case_id, []))

    unit_group = K.unit_group(proof=True)
    unit_values = unit_group.gens_values()
    class_group = K.class_group(proof=True)
    class_ideals = class_group.gens_ideals()
    regulator = K.regulator(proof=True)

    precisions = list(STANDARD_PRECISIONS)
    if case_id in SELECTED_512:
        precisions.append(512)

    record = {
        "id": case_id,
        "tags": tags,
        "polynomial": {
            "coefficientOrder": "ascending",
            "coefficients": [integer_string(c) for c in polynomial.list()],
        },
        "degree": int(degree),
        "signature": [int(value) for value in K.signature()],
        "equationDiscriminant": integer_string(equation_discriminant),
        "fieldDiscriminant": integer_string(field_discriminant),
        "equationOrderIndex": integer_string(equation_order_index),
        "maximalOrderBasisRelativeToPowerBasis": rational_lattice(O.basis(), degree),
        "primeDecompositions": [factor_record(K, p) for p in sorted(primes)],
        "zetaCoefficients": [integer_string(c) for c in K.zeta_coefficients(COEFFICIENT_BOUND)],
        "globalInvariants": {
            "rootsOfUnity": integer_string(K.number_of_roots_of_unity()),
            "unitRank": int(len(unit_values) - 1),
            "unitGenerators": [element_record(u, degree) for u in unit_values],
            "regulator53": real_record(regulator, 53),
            "classNumber": integer_string(K.class_number(proof=True)),
            "classGroupInvariants": [integer_string(c) for c in class_group.invariants()],
            "classGroupGeneratorIdeals": [pari_hnf_record(I) for I in class_ideals],
        },
        "analytic": [analytic_record(K, bits) for bits in precisions],
    }
    return record


def canonical_json(value):
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        default=lambda item: int(item),
    )


def main():
    output = sys.argv[1] if len(sys.argv) > 1 else "-"
    fields = []
    for case_id, polynomial, tags in CASES:
        print("generating %s" % case_id, file=sys.stderr, flush=True)
        fields.append(field_record(case_id, polynomial, tags))

    payload = {
        "schema": SCHEMA,
        "schemaVersion": int(1),
        "description": "Offline cross-phase algebraic number field oracle corpus",
        "normalization": {
            "gammaR": "pi^(-s/2)*Gamma(s/2)",
            "gammaC": "2*(2*pi)^(-s)*Gamma(s)",
            "completed": "abs(D_K)^(s/2)*GammaR(s)^r1*GammaC(s)^r2*zeta_K(s)",
            "functionalEquation": "Lambda_K(s)=Lambda_K(1-s)",
            "xi": "s*(s-1)*Lambda_K(s)",
            "regulatorRankZero": "1",
        },
        "integerEncoding": "base-10 strings",
        "coefficientConvention": "zetaCoefficients[i] is a_(i+1)",
        "source": {
            "system": "SageMath/PARI",
            "sageVersion": SAGE_VERSION,
            "pariVersion": ".".join(str(part) for part in pari("version()")),
            "generator": "upstream-tests/sage/number-field-foundations/generate.py",
            "command": "sage generate.py test/fixtures/number-field-foundations/corpus.json",
            "precisionsBits": [int(bits) for bits in STANDARD_PRECISIONS + [512]],
        },
        "isomorphisms": [
            {
                "from": "cubic-mixed",
                "to": "cubic-mixed-shift",
                "generatorMap": "a -> b-1",
            }
        ],
        "kroneckerCharacters": [
            {
                "discriminant": integer_string(discriminant),
                "modulus": integer_string(abs(discriminant)),
                "valuesFromZeroThrough64": [
                    int(kronecker_symbol(discriminant, value)) for value in range(65)
                ],
            }
            for discriminant in KRONECKER_DISCRIMINANTS
        ],
        "fields": fields,
    }
    digest_payload = canonical_json(payload).encode("ascii")
    payload["contentSha256"] = hashlib.sha256(
        b"sagejs-number-field-foundations-oracle-v1\n" + digest_payload
    ).hexdigest()

    encoded = json.dumps(payload, indent=2, sort_keys=False, default=lambda item: int(item)) + "\n"
    if output == "-":
        sys.stdout.write(encoded)
        return
    os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)
    temporary = output + ".tmp"
    with open(temporary, "w", encoding="ascii") as handle:
        handle.write(encoded)
    os.replace(temporary, output)


if __name__ == "__main__":
    main()

"""Generate the checked genus-3 Hasse--Witt/L-polynomial audit corpus.

This is a development-oracle script.  It deliberately depends on Sage and is
not part of the Sage.js runtime.
"""

import json
from collections import Counter

from sage.rings.polynomial.weil.weil_polynomials import WeilPolynomials


def polynomial_coefficients(poly):
    """Return coefficients in ascending degree order as Python integers."""
    return [int(poly[i]) for i in range(poly.degree() + 1)]


def hasse_witt_matrix(f, p, genus):
    """Use Harvey--Sutherland's `w_ij = [x^(pi-j)]f^((p-1)/2)` convention."""
    ring = PolynomialRing(GF(p), "x")
    fp = ring(f)
    power = fp ** ((p - 1) // 2)
    return [
        [int(power[p * (i + 1) - (j + 1)]) for j in range(genus)]
        for i in range(genus)
    ]


def det_i_minus_tw(matrix, p):
    """Return the first `g` coefficients of `det(I-TW)` modulo `p`."""
    ring = PolynomialRing(GF(p), "T")
    T = ring.gen()
    W = Matrix(GF(p), matrix)
    value = (identity_matrix(ring, W.nrows()) - T * W).det()
    return [int(value[i]) for i in range(1, W.nrows() + 1)]


def entry(label, f, p):
    curve = HyperellipticCurve(f)
    reduced = curve.change_ring(GF(p))
    frobenius = reduced.frobenius_polynomial()
    coefficients = polynomial_coefficients(frobenius)
    genus = curve.genus()
    middle = [coefficients[2 * genus - i] for i in range(1, genus + 1)]
    matrix = hasse_witt_matrix(f, p, genus)
    residues = det_i_minus_tw(matrix, p)
    assert [value % p for value in middle] == residues
    return {
        "curve": label,
        "p": int(p),
        "hasse_witt": matrix,
        "lpolynomial_first_half": middle,
        "lpolynomial": [int(1)]
        + middle
        + [int(p * middle[1]), int(p**2 * middle[0]), int(p**3)],
        "residues_mod_p": residues,
        "curve_cardinality": int(reduced.cardinality()),
    }


R = PolynomialRing(QQ, "x")
x = R.gen()
curves = {
    "odd_monic_sparse": x**7 + x + 1,
    "even_monic": x**8 + 2 * x**5 + 3 * x**2 + 1,
    "paper_dense": 2 * x**7
    + 3 * x**6
    + 5 * x**5
    + 7 * x**4
    + 11 * x**3
    + 13 * x**2
    + 17 * x
    + 19,
}
primes = [
    5,
    7,
    11,
    13,
    17,
    19,
    23,
    29,
    31,
    37,
    41,
    43,
    47,
    53,
    59,
    61,
    67,
    71,
    73,
    79,
    83,
    89,
    97,
    101,
    103,
    107,
    109,
    113,
    127,
    131,
    137,
    139,
    149,
    1009,
    1601,
]

records = []
for label, f in curves.items():
    discriminant = ZZ(f.discriminant())
    for p in primes:
        if discriminant % p:
            records.append(entry(label, f, p))

# Independently enumerate all degree-six p-Weil polynomials at a few small
# primes.  The JavaScript candidate filter checks its count against this field.
for p in [5, 7, 11]:
    residue_counts = Counter(
        (int(poly[5]) % p, int(poly[4]) % p, int(poly[3]) % p)
        for poly in WeilPolynomials(6, p)
    )
    for record in records:
        if record["p"] == p:
            record["sage_weil_candidate_count"] = residue_counts[
                tuple(record["residues_mod_p"])
            ]

payload = {
    "schema": int(1),
    "normalization": {
        "equation": "y^2=f(x)",
        "polynomial_coefficients": "ascending powers of T",
        "hasse_witt": "w[i][j]=[x^(p*(i+1)-(j+1))] f^((p-1)/2) mod p",
        "congruence": "L_p(T)=det(I-T*W_p) mod p",
    },
    "curves": {
        label: {
            "f": polynomial_coefficients(f),
            "discriminant": str(f.discriminant()),
        }
        for label, f in curves.items()
    },
    "records": records,
}
print(json.dumps(payload, indent=2, sort_keys=True))

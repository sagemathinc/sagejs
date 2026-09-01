# sagejs-test-tier: portable
"""Quotient coordinates, exact FGLM, and base-field solving."""

R = PolynomialRing(GF(101), names=("x", "y"), order="degrevlex")
x, y = R.gens()
I = R.ideal(x**2 - y, x * y - 1)

assert repr(I.quotient_basis()) == "[1, y, x]"
assert I.quotient_coordinates(x + 2 * y + 3) == (GF(101)(3), GF(101)(2), GF(101)(1))

M = I.multiplication_matrix(x)
assert M.nrows() == 3 and M.ncols() == 3
assert M.list() == [
    GF(101)(0),
    GF(101)(1),
    GF(101)(0),
    GF(101)(0),
    GF(101)(0),
    GF(101)(1),
    GF(101)(1),
    GF(101)(0),
    GF(101)(0),
]

lex_basis = I.fglm()
assert lex_basis.universe()._order == "lex"
lex_ring = lex_basis.universe()
lex_x, lex_y = lex_ring.gens()
assert list(lex_basis) == [lex_x - lex_y**2, lex_y**3 - 1]
assert all(
    lex_basis.ideal().normal_form(value, algorithm="buchberger") == 0
    for value in lex_basis
)

L = PolynomialRing(GF(101), names=("x", "y"), order="lex")
transformed = I.transformed_basis(other_ring=L)
assert transformed.universe() is L and repr(transformed) == repr(lex_basis)

F = GF(5)
S = PolynomialRing(F, names=("a", "b"), order="degrevlex")
a, b = S.gens()
solutions = S.ideal(a - b**2, b**2 - 1).variety()
assert len(solutions) == 2
pairs = [(solution[a], solution[b]) for solution in solutions]
assert (F(1), F(1)) in pairs and (F(1), F(4)) in pairs

T = PolynomialRing(QQ, names=("u", "v"), order="degrevlex")
u, v = T.gens()
rational = T.ideal(u - v**2, v**2 - 1).variety()
assert len(rational) == 2
rational_pairs = [(solution[u], solution[v]) for solution in rational]
assert (QQ(1), QQ(1)) in rational_pairs and (QQ(1), QQ(-1)) in rational_pairs
assert T.ideal(u - v, v**2 - 2).variety() == []
assert T.ideal(1).variety() == []

try:
    T.ideal(u * v).fglm()
    raise AssertionError("positive-dimensional ideal accepted by FGLM")
except ValueError as error:
    assert "zero-dimensional" in str(error)

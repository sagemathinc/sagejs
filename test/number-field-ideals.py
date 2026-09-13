# sagejs-test-tier: portable
# DISABLED: full-runtime qualification fixture
"""Number-field ideal operations must use exact coefficient arithmetic."""

from sagejs.polynomial_algorithms.exact_field import ExactField
from sagejs.polynomial_algorithms.generic_groebner import (
    GenericGroebnerRing,
    verify_certificate,
)

T = PolynomialRing(QQ, "t")
t = T.gen()
K = NumberField(t**2 - 2, "a")
a = K.gen()
for order in ["lex", "deglex", "degrevlex"]:
    R = PolynomialRing(K, ["x", "y"], order=order)
    x, y = R.gens()
    I = R.ideal(x**2 - a, y - x)
    basis = I.groebner_basis(proof=True)
    assert all(f.parent() is R for f in basis)
    assert all(f.leading_coefficient() == 1 for f in basis)
    assert list(R.ideal(0).groebner_basis()) == []
    assert list(R.ideal(1).groebner_basis()) == [R(1)]
    assert R.ideal(x * y).dimension() == 1
    assert I.normal_form(x - y) == 0
    assert I.dimension() == 0
    assert I.vector_space_dimension() == 2
    assert I.leading_ideal().dimension() == 0
    assert x - y in I
    assert I.elimination_ideal(y) == R.ideal(x**2 - a)
    assert R.ideal(x).intersection(R.ideal(y)) == R.ideal(x * y)
    assert R.ideal(x * y).colon(R.ideal(x)) == R.ideal(y)
    M = I.multiplication_matrix(x)
    assert M.base_ring() is K
    assert M**2 == a * M.parent().identity_matrix()
    minimum = M.minpoly()
    assert minimum == minimum.parent().gen() ** 2 - a
    assert M.charpoly() == minimum
    converted = I.fglm("lex")
    L = converted.universe()
    u, v = L.gens()
    assert list(converted) == [u - v, v**2 - a]
    assert R.ideal(x * y).saturation(R.ideal(x)) == R.ideal(y)
    metadata = I.groebner_basis_metadata()
    assert metadata["proof"] is True
    assert metadata["statistics"]["max_coordinate_bits"] > 0
    key = metadata["backend"] + ":proof"
    certificate = verify_certificate(
        [f.terms() for f in I.gens()],
        [f.terms() for f in basis],
        I._groebner_transform_cache[key],
        GenericGroebnerRing(2, ExactField(K), order),
    )
    assert certificate.valid
    previous = proof.polynomial()
    try:
        proof.polynomial(False)
        assert list(I.groebner_basis()) == list(basis)
        assert I.groebner_basis_metadata()["proof"] is True
    finally:
        proof.polynomial(previous)
    for backend in ["flint", "msolve"]:
        try:
            I.groebner_basis(algorithm=backend)
            raise AssertionError("number-field coefficients entered a packed backend")
        except NotImplementedError:
            pass
print("number-field ideals passed")

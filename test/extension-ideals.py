"""Public exact-field dispatch, certificates, and quotient order conversion."""

from sagejs.polynomial_algorithms.exact_field import ExactField
from sagejs.polynomial_algorithms.generic_groebner import (
    GenericGroebnerRing,
    verify_certificate,
)

previous_proof = proof.polynomial()
assert globals().get("_extension_field_selection") in (None, 4, 8, 9, 27, 65519**2)
try:
    for q in [4, 8, 9, 27, 65519**2]:
        if globals().get("_extension_field_selection") not in (None, q):
            continue
        K = GF(q, "a")
        a = K.gen()
        for order in ["lex", "deglex", "degrevlex"]:
            R = PolynomialRing(K, ["x", "y"], order=order)
            x, y = R.gens()
            I = R.ideal(x**2 - a, y - x)
            for required in [True, False]:
                proof.polynomial(required)
                basis = I.groebner_basis()
                metadata = I.groebner_basis_metadata()
                assert metadata["backend"] == "python:groebner-exact-gf-extension-v1"
                assert metadata["domain"] == "GF(p^d)"
                assert metadata["proof"] is True
                assert metadata["proof_requested"] is required
                assert all(I.normal_form(f) == 0 for f in I.gens())
                assert all(c.parent() is K for f in basis for c, _ in f.terms())
                key = metadata["backend"] + (":proof" if required else ":candidate")
                report = verify_certificate(
                    [f.terms() for f in I.gens()],
                    [f.terms() for f in basis],
                    I._groebner_transform_cache[key],
                    GenericGroebnerRing(2, ExactField(K), order),
                )
                assert report.valid
            assert I.normal_form(x**3) == a * I.normal_form(x)
            assert I.is_equal(R.ideal(x - y, y**2 - a))
            assert list(R.ideal(0).groebner_basis()) == []
            assert list(R.ideal(1).groebner_basis()) == [R(1)]
            assert I.vector_space_dimension() == 2
            monomials = list(I.normal_basis())
            assert len(monomials) == 2
            matrix_x = I.multiplication_matrix(x)
            assert matrix_x.base_ring() is K
            for column, monomial in enumerate(monomials):
                coordinates = I.quotient_coordinates(x * monomial)
                assert all(
                    matrix_x[row, column] == coordinates[row] for row in range(2)
                )
            Q = I.quotient_ring()
            assert Q(x) ** 2 == Q(a) and Q(x) == Q(y)
            minimum = Q.minimal_polynomial(Q(x), "z")
            z = minimum.parent().gen()
            assert minimum == z**2 - a
            lex = I.fglm()
            L = lex.universe()
            xx, yy = L.gens()
            assert list(lex) == [xx - yy, yy**2 - a]
            E = I.elimination_ideal(x)
            assert E.is_equal(R.ideal(y**2 - a))
            for backend in ["flint", "msolve"]:
                try:
                    I.groebner_basis(algorithm=backend)
                except NotImplementedError:
                    pass
                else:
                    raise AssertionError(
                        "extension coefficients entered a packed backend"
                    )
finally:
    proof.polynomial(previous_proof)

print("finite-extension exact ideals, certificates, and FGLM passed")

# sagejs-test-tier: portable
"""Portable public Groebner basis acceptance for native and Wasm backends."""

finite_ring = PolynomialRing(GF(65537), names=("x", "y"), order="degrevlex")
x, y = finite_ring.gens()
finite_ideal = finite_ring.ideal(x * y - 1, x**3 + 7 * y**2)
finite_basis = finite_ideal.groebner_basis()
assert repr(finite_basis) == "[x*y + 65536, y^3 + 18725*x^2, x^3 + 7*y^2]"
assert finite_ideal.normal_form(x * y - 1) == 0
assert finite_ideal.reduce(x**3 + 7 * y**2) == 0
assert repr(finite_ideal.leading_ideal().gens()) == "(x*y, y^3, x^3)"
assert finite_ideal.groebner_basis_metadata() == {
    "backend": "msolve:f4-prime-field-v1",
    "domain": "GF(p)",
    "characteristic": 65537,
    "order": "degrevlex",
    "proof": True,
    "proof_requested": True,
    "deterministic": True,
    "probabilistic": False,
}

rational_ring = PolynomialRing(QQ, names=("u", "v"), order="degrevlex")
u, v = rational_ring.gens()
rational_ideal = rational_ring.ideal(u * v - 1, u**3 + 7 * v**2)
rational_basis = rational_ideal.groebner_basis(algorithm="msolve", proof=False)
assert repr(rational_basis) == "[u*v - 1, v^3 + 1/7*u^2, u^3 + 7*v^2]"
assert rational_ideal.normal_form(u * v - 1, algorithm="msolve", proof=False) == 0
assert rational_ideal.groebner_basis_metadata() == {
    "backend": "msolve:modular-qq-v1",
    "domain": "QQ",
    "characteristic": 0,
    "order": "degrevlex",
    "proof": False,
    "proof_requested": False,
    "deterministic": False,
    "probabilistic": True,
}

try:
    rational_ideal.groebner_basis(algorithm="msolve", proof=True)
    raise AssertionError("uncertified msolve QQ mode accepted proof=True")
except NotImplementedError as error:
    assert "transformation provenance" in str(error)

# The Sage-compatible global polynomial proof preference controls `auto` over
# QQ, while an explicit per-call flag always takes precedence. The portable
# contract exercises the modular route; the native polynomial suite also
# checks proof-required FLINT dispatch.
assert proof.polynomial() is True
proof.polynomial(False)
rational_fast = rational_ring.ideal(u * v - 1, u**3 + 7 * v**2)
rational_fast.groebner_basis()
assert rational_fast.groebner_basis_metadata()["backend"] == ("msolve:modular-qq-v1")
assert rational_fast.groebner_basis_metadata()["proof_requested"] is False

proof.polynomial(True)
rational_override = rational_ring.ideal(u * v - 1, u**3 + 7 * v**2)
rational_override.groebner_basis(proof=False)
assert rational_override.groebner_basis_metadata()["backend"] == (
    "msolve:modular-qq-v1"
)
proof.polynomial(True)

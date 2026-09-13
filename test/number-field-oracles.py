# sagejs-test-tier: portable
# DISABLED: full-runtime qualification fixture
"""Compare public exact results against independently generated Sage fixtures."""

import json

fixture = globals().get("_number_field_oracle_fixture")
if fixture is None:
    with open("test/fixtures/number-field-geometry-sage.json") as source:
        fixture = json.load(source)
T = PolynomialRing(QQ, "t")
for case in fixture["cases"]:
    K = NumberField(T(case["modulus"]), "a")
    a = K.gen()

    def scalar(coordinates):
        def rational(text):
            parts = text.split("/")
            return QQ(int(parts[0])) / (QQ(int(parts[1])) if len(parts) == 2 else QQ(1))

        return sum(rational(c) * a**i for i, c in enumerate(coordinates))

    if "basis" in case:
        R = PolynomialRing(K, ["x", "y"], order=case["order"])
        x, y = R.gens()

        def polynomial(records):
            return sum((scalar(c) * x ** e[0] * y ** e[1] for c, e in records), R(0))

        I = R.ideal([polynomial(f) for f in case["generators"]])
        assert list(I.groebner_basis(proof=True)) == [
            polynomial(f) for f in case["basis"]
        ]
        assert I.dimension() == case["dimension"]
    else:
        R = PolynomialRing(K, "x")
        f = R([scalar(c) for c in case["polynomial"]])
        actual = f.factor()
        assert actual.unit() == scalar(case["unit"])
        expected = [(R([scalar(c) for c in g]), e) for g, e in case["factors"]]
        assert len(actual) == len(expected)
        assert all(any(g == h and e == d for h, d in expected) for g, e in actual)
print("independent number-field Sage oracles passed", len(fixture["cases"]))

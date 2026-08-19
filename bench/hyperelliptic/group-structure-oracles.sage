cases = [
    (13, 3, [1, 2, 0, 0, 0, 0, 0, 1], [0]),
    (19, 3, [1, 2, 0, 0, 0, 0, 0, 1], [0]),
    (5, 2, [1, 1, 0, 0, 0, 1], [1, 0, 1]),
]

for prime, _genus, f_coefficients, h_coefficients in cases:
    ring = PolynomialRing(GF(prime), "x")
    curve = HyperellipticCurve(
        ring(f_coefficients),
        ring(h_coefficients),
    )
    jacobian = curve.jacobian()
    group = jacobian.abelian_group()
    print(prime, jacobian.order(), group.invariants())

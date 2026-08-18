# Benchmark odd-degree Mumford arithmetic separately from curve construction.
R = PolynomialRing(GF(1009), "x")
x = R.gen()
C = HyperellipticCurve(x**5 + x + 1)
J = C.jacobian()
P = J.random_element()
Q = J.random_element()

print("curve:", C)
print("order:", J.order())
timeit("P + Q", number=1000, repeat=7)
timeit("P + P", number=1000, repeat=7)
timeit("(2**256 + 1) * P", number=30, repeat=7)

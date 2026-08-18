import time


def benchmark(label, repetitions, operation):
    witness = operation()
    started = time.perf_counter()
    for _index in range(repetitions):
        result = operation()
    elapsed = time.perf_counter() - started
    assert result == witness
    print(label, "seconds/op:", elapsed / repetitions, "witness:", witness)


# Benchmark odd-degree Mumford arithmetic separately from curve construction.
R = PolynomialRing(GF(1009), "x")
x = R.gen()
C = HyperellipticCurve(x**5 + x + 1)
J = C.jacobian()
P = J.random_element()
Q = J.random_element()

print("curve:", C)
print("order:", J.order())
benchmark("addition", 1000, lambda: P + Q)
benchmark("doubling", 1000, lambda: P + P)
benchmark("256-bit scalar", 30, lambda: (2**256 + 1) * P)
sample = J.random_elements(count=16, max_attempts=100)
benchmark(
    "three order candidates against 16 samples",
    10,
    lambda: J.filter_order_candidates(
        [J.order() - 1, J.order(), J.order() + 1], sample
    ),
)

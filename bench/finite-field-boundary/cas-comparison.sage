import time


def bench_field(n, field, multiplier, increment):
    x = field(1)
    a = field(multiplier)
    b = field(increment)
    started = time.time()
    for _index in range(n):
        x = x * a + b
    return time.time() - started, int(x)


def bench_raw(n, modulus, multiplier, increment):
    x = 1
    started = time.time()
    for _index in range(n):
        x = (x * multiplier + increment) % modulus
    return time.time() - started, x


p = 65521
n = 10000000
F = GF(p)
bench_field(1000000, F, 12345, 6789)
bench_raw(1000000, p, 12345, 6789)
for sample in range(7):
    elapsed, checksum = bench_field(n, F, 12345, 6789)
    print("FIELD", sample + 1, elapsed, checksum)
for sample in range(7):
    elapsed, checksum = bench_raw(n, p, 12345, 6789)
    print("RAW", sample + 1, elapsed, checksum)

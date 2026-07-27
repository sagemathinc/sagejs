import time


def multiply_loop(field, iterations):
    value = field("1.25", "-0.75")
    step = field("1.0000000000000002", "0.0000000000000001")
    for _ in range(iterations):
        value = value * step
    return value


def measure(precision, iterations):
    field = ComplexField(precision)
    multiply_loop(field, min(iterations, 10000))
    for sample in range(7):
        start = time.time()
        answer = multiply_loop(field, iterations)
        elapsed = float(time.time() - start)
        print("RESULT", precision, iterations, sample, elapsed)
    return answer


measure(53, 500000)
measure(1000, 100000)
measure(10000, 10000)

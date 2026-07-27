import time


def complex_multiply_loop(field, iterations):
    value = field("1.25", "-0.75")
    step = field("1.0000000000000002", "0.0000000000000001")
    for _ in range(iterations):
        value = value * step
    return value


def real_multiply_loop(field, iterations):
    value = field("1.25")
    step = field("1.0000000000000002")
    for _ in range(iterations):
        value = value * step
    return value


def measure(kind, operation, field, precision, iterations):
    operation(field, min(iterations, 10000))
    for sample in range(7):
        start = time.time()
        answer = operation(field, iterations)
        elapsed = float(time.time() - start)
        print("RESULT", kind, precision, iterations, sample, elapsed)
    return answer


measure("real", real_multiply_loop, RealField(53), 53, 500000)
measure("real", real_multiply_loop, RealField(1000), 1000, 100000)
measure("real", real_multiply_loop, RealField(10000), 10000, 10000)
measure("complex", complex_multiply_loop, ComplexField(53), 53, 500000)
measure("complex", complex_multiply_loop, ComplexField(1000), 1000, 100000)
measure("complex", complex_multiply_loop, ComplexField(10000), 10000, 10000)

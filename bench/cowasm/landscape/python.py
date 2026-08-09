"""Time the unchanged Python benchmark bodies for the landscape comparison."""

import os
import sys
from time import time


SOURCE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, SOURCE)

import fib  # noqa: E402,F401
import mypyc_micro  # noqa: E402,F401
import numbers  # noqa: E402,F401
from bench import registered_benchmarks  # noqa: E402


IDS = {
    "prime_counting": "pi(10**5)",
    "gcd_loop": "gcd",
    "xgcd_loop": "xgcd",
    "inverse_mod_loop": "bench_inverse_mod",
    "sum_stride": "sum_loop",
    "recursive_fibonacci": "recursive fibonacci",
    "int_to_float": "int_to_float",
    "float_abs": "float_abs",
    "int_divmod": "int_divmod",
}

EXPECTED = {
    "prime_counting": "9592",
    "gcd_loop": "2414484",
    "xgcd_loop": "2414484",
    "inverse_mod_loop": "53532319533988",
    "sum_stride": "333334",
    "recursive_fibonacci": "1346269",
    "int_to_float": "ok",
    "float_abs": "ok",
    "int_divmod": "17167493000000",
}


def integer_environment(name, fallback):
    value = os.environ.get(name)
    return fallback if value is None or value == "" else int(value)


def selected_ids():
    selected = os.environ.get("SAGEJS_LANDSCAPE_ONLY", "")
    if selected == "":
        return list(IDS)
    return selected.split(",")


def main():
    warmups = integer_environment("SAGEJS_LANDSCAPE_WARMUPS", 1)
    samples = integer_environment("SAGEJS_LANDSCAPE_SAMPLES", 3)
    registry = dict(registered_benchmarks())
    selected = selected_ids()
    print("SAGEJS_COWASM_LANDSCAPE", 1)
    for kind, count in (("WARMUP", warmups), ("RESULT", samples)):
        for sample in range(count):
            for benchmark_id in selected:
                operation = registry[IDS[benchmark_id]]
                started = time()
                result = operation()
                elapsed_ns = int((time() - started) * 1000000000)
                checksum = EXPECTED[benchmark_id]
                if result is not None and checksum != "ok":
                    assert str(result) == checksum
                print(kind, sample, benchmark_id, elapsed_ns, checksum, sep="\t")
    print("COMPLETE", warmups, samples, len(selected), sep="\t")


if __name__ == "__main__":
    main()

"""CPython/PyPy driver for the source-transparent packed-buffer kernels."""

from __future__ import annotations

import os
import sys
from math import pi
from pathlib import Path
from time import perf_counter_ns

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src" / "lib"))
sys.path.insert(0, str(ROOT / "bench" / "cowasm" / "native"))

from numerical_buffers import matrix_multiply_repeated, nbody_advance_energy

EXPECTED = {
    "nbody": -0.16908926275527303,
    "matrix_multiplication": 166742891853.24692,
}


def initial_state() -> list[float]:
    days = 365.24
    solar_mass = 4.0 * pi * pi
    state = [
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        solar_mass,
        4.84143144246472090,
        -1.16032004402742839,
        -1.03622044471123109e-1,
        1.66007664274403694e-3 * days,
        7.69901118419740425e-3 * days,
        -6.90460016972063023e-5 * days,
        9.54791938424326609e-4 * solar_mass,
        8.34336671824457987,
        4.12479856412430479,
        -4.03523417114321381e-1,
        -2.76742510726862411e-3 * days,
        4.99852801234917238e-3 * days,
        2.30417297573763929e-5 * days,
        2.85885980666130812e-4 * solar_mass,
        1.28943695621391310e1,
        -1.51111514016986312e1,
        -2.23307578892655734e-1,
        2.96460137564761618e-3 * days,
        2.37847173959480950e-3 * days,
        -2.96589568540237556e-5 * days,
        4.36624404335156298e-5 * solar_mass,
        1.53796971148509165e1,
        -2.59193146099879641e1,
        1.79258772950371181e-1,
        2.68067772490389322e-3 * days,
        1.62824170038242295e-3 * days,
        -9.51592254519715870e-5 * days,
        5.15138902046611451e-5 * solar_mass,
    ]
    px = py = pz = 0.0
    for body in range(5):
        start = body * 7
        mass = state[start + 6]
        px -= state[start + 3] * mass
        py -= state[start + 4] * mass
        pz -= state[start + 5] * mass
    state[3] = px / solar_mass
    state[4] = py / solar_mass
    state[5] = pz / solar_mass
    return state


def matrix_inputs() -> tuple[list[float], list[float], list[float]]:
    size = 30
    left = [((index * 17 + 3) % 97) / 97.0 for index in range(size * size)]
    right = [((index * 19 + 5) % 89) / 890.0 for index in range(size * size)]
    return left, right, [0.0] * (size * size)


def close(actual: float, expected: float) -> bool:
    return abs(actual - expected) <= 1e-12 * max(1.0, abs(expected))


def prepare(identifier: str):
    if identifier == "nbody":
        return nbody_advance_energy, (initial_state(), 0.01, 20000, 5)
    left, right, scratch = matrix_inputs()
    return matrix_multiply_repeated, (left, right, scratch, 30, 50)


def main() -> None:
    warmups = int(os.environ.get("SAGEJS_BUFFER_WARMUPS", "1"))
    samples = int(os.environ.get("SAGEJS_BUFFER_SAMPLES", "3"))
    selected = os.environ.get(
        "SAGEJS_BUFFER_ONLY", "nbody,matrix_multiplication"
    ).split(",")
    print("SAGEJS_COWASM_BUFFERS 1")
    for kind, count in (("WARMUP", warmups), ("RESULT", samples)):
        for sample in range(count):
            for identifier in selected:
                operation, arguments = prepare(identifier)
                started = perf_counter_ns()
                answer = operation(*arguments)
                elapsed = perf_counter_ns() - started
                if not close(answer, EXPECTED[identifier]):
                    raise RuntimeError(
                        f"{identifier} returned {answer!r}; "
                        f"expected {EXPECTED[identifier]!r}"
                    )
                print(kind, sample, identifier, elapsed, "ok", sep="\t")
    print("COMPLETE", warmups, samples, len(selected), sep="\t")


if __name__ == "__main__":
    main()

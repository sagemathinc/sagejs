"""Source-transparent packed binary64 kernels from the CoWasm corpus.

The bodies deliberately spell out the algorithms.  ``float64_record`` is a
bounded view into a flat buffer, not an n-body or matrix intrinsic.  CPython
executes the same functions against ordinary lists; the Native Kernel borrows
``Float64Array`` storage and lowers every indexed operation and nested loop.
"""

from __future__ import annotations

from math import sqrt

from sagejs.native import Float64Buffer, float64_record, native


@native
def nbody_advance_energy(
    state: Float64Buffer,
    dt: float,
    steps: uint64,
    bodies: uint64,
) -> float:
    """Advance packed ``[x,y,z,vx,vy,vz,mass]`` records and return energy."""
    for _step in range(steps):
        for left_index in range(bodies):
            left = float64_record(state, left_index * 7, 7)
            for right_index in range(left_index + 1, bodies):
                right = float64_record(state, right_index * 7, 7)
                dx = left[0] - right[0]
                dy = left[1] - right[1]
                dz = left[2] - right[2]
                distance_squared = dx * dx + dy * dy + dz * dz
                magnitude = dt / (
                    distance_squared * sqrt(distance_squared))
                left_mass_magnitude = left[6] * magnitude
                right_mass_magnitude = right[6] * magnitude
                left[3] -= dx * right_mass_magnitude
                left[4] -= dy * right_mass_magnitude
                left[5] -= dz * right_mass_magnitude
                right[3] += dx * left_mass_magnitude
                right[4] += dy * left_mass_magnitude
                right[5] += dz * left_mass_magnitude
        for body_index in range(bodies):
            body = float64_record(state, body_index * 7, 7)
            body[0] += dt * body[3]
            body[1] += dt * body[4]
            body[2] += dt * body[5]

    energy = 0.0
    for left_index in range(bodies):
        left = float64_record(state, left_index * 7, 7)
        for right_index in range(left_index + 1, bodies):
            right = float64_record(state, right_index * 7, 7)
            dx = left[0] - right[0]
            dy = left[1] - right[1]
            dz = left[2] - right[2]
            distance_squared = dx * dx + dy * dy + dz * dz
            energy -= left[6] * right[6] / sqrt(distance_squared)
        energy += left[6] * (
            left[3] * left[3] +
            left[4] * left[4] +
            left[5] * left[5]
        ) / 2.0
    return energy


@native
def matrix_multiply_repeated(
    left: Float64Buffer,
    right: Float64Buffer,
    scratch: Float64Buffer,
    size: uint64,
    repetitions: uint64,
) -> float:
    """Repeated classical square matrix multiplication in row-major storage."""
    current = left
    target = scratch
    for _repeat in range(repetitions):
        for row in range(size):
            for column in range(size):
                accumulator = 0.0
                for index in range(size):
                    accumulator += (
                        current[row * size + index] *
                        right[index * size + column]
                    )
                target[row * size + column] = accumulator
        temporary = current
        current = target
        target = temporary
    checksum = 0.0
    for index in range(size * size):
        checksum += current[index]
    return checksum

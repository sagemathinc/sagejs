"""Bounded private row-6 terminal class verification.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The ordinary-Python class owner remains the publication oracle. This private
cut performs its exact mathematical authentication over explicit buffers and
publishes only bounded scalar/vector evidence for host-side object assembly.
"""

from sagejs.native import (
    Int64Buffer,
    IntegerBuffer,
    int64_workspace,
    integer_workspace,
    native,
)

from .generator_order_witness import _pari_exact_cubic_ideal_multiply
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .signed_prime_ideal_reduction import pari_cubic_mul_matrix


def _determinant3(matrix: IntegerBuffer) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7])
        - matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6])
        + matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6])
    )


def _same_lattice3(left: IntegerBuffer, right: IntegerBuffer) -> bool:
    determinant = _determinant3(left)
    right_determinant = _determinant3(right)
    if determinant == 0:
        return False
    if determinant < 0:
        determinant_absolute = -determinant
    else:
        determinant_absolute = determinant
    if right_determinant < 0:
        right_absolute = -right_determinant
    else:
        right_absolute = right_determinant
    if determinant_absolute != right_absolute:
        return False
    # adj(left), row-major
    a00 = left[4] * left[8] - left[5] * left[7]
    a01 = left[2] * left[7] - left[1] * left[8]
    a02 = left[1] * left[5] - left[2] * left[4]
    a10 = left[5] * left[6] - left[3] * left[8]
    a11 = left[0] * left[8] - left[2] * left[6]
    a12 = left[2] * left[3] - left[0] * left[5]
    a20 = left[3] * left[7] - left[4] * left[6]
    a21 = left[1] * left[6] - left[0] * left[7]
    a22 = left[0] * left[4] - left[1] * left[3]
    for column in range(3):
        r0 = right[column]
        r1 = right[3 + column]
        r2 = right[6 + column]
        if (a00 * r0 + a01 * r1 + a02 * r2) % determinant != 0:
            return False
        if (a10 * r0 + a11 * r1 + a12 * r2) % determinant != 0:
            return False
        if (a20 * r0 + a21 * r1 + a22 * r2) % determinant != 0:
            return False
    return True


@native
def pari_row6_phase6_resident_class_private(
    rows: int,
    columns: int,
    degree: int,
    kernel_columns: int,
    class_columns: int,
    terminal_h: IntegerBuffer,
    raw_relations: IntegerBuffer,
    principal_generators: IntegerBuffer,
    factor_ideals: IntegerBuffer,
    factor_norms: IntegerBuffer,
    descriptor_generators: IntegerBuffer,
    descriptor_primes: IntegerBuffer,
    descriptor_e: IntegerBuffer,
    descriptor_f: IntegerBuffer,
    descriptor_inert: IntegerBuffer,
    multiplication_basis: IntegerBuffer,
    raw_to_unit_kernel: IntegerBuffer,
    raw_to_presentation: IntegerBuffer,
    active_rows: Int64Buffer,
    factor_map: IntegerBuffer,
    class_state: Int64Buffer,
) -> int:
    """Authenticate row 6's exact relation presentation and class witnesses."""
    prime_generator: IntegerBuffer = integer_workspace(3, 16)
    prime_multiplication: IntegerBuffer = integer_workspace(9, 16)
    prime_work: IntegerBuffer = integer_workspace(9, 16)
    prime_pivots: IntegerBuffer = integer_workspace(3, 16)
    reconstructed_ideal: IntegerBuffer = integer_workspace(9, 16)
    right_ideal: IntegerBuffer = integer_workspace(9, 256)
    product: IntegerBuffer = integer_workspace(9, 256)
    next_product: IntegerBuffer = integer_workspace(9, 256)
    ideal_generators: IntegerBuffer = integer_workspace(27, 256)
    ideal_hnf_work: IntegerBuffer = integer_workspace(27, 256)
    principal_generator: IntegerBuffer = integer_workspace(3, 256)
    principal_matrix: IntegerBuffer = integer_workspace(9, 256)
    targets: Int64Buffer = int64_workspace(9)

    if (
        rows < 1
        or columns < 1
        or degree != 3
        or kernel_columns < 1
        or class_columns < 1
        or class_columns > 9
        or len(terminal_h) < class_columns * class_columns
        or len(raw_relations) < rows * columns
        or len(principal_generators) < degree * columns
        or len(factor_ideals) < degree * degree * rows
        or len(factor_norms) < rows
        or len(descriptor_generators) < degree * rows
        or len(descriptor_primes) < rows
        or len(descriptor_e) < rows
        or len(descriptor_f) < rows
        or len(descriptor_inert) < rows
        or len(multiplication_basis) != 27
        or len(raw_to_unit_kernel) < kernel_columns * columns
        or len(raw_to_presentation) < class_columns * columns
        or len(active_rows) < class_columns
        or len(factor_map) < class_columns * rows
        or len(class_state) < 12
    ):
        raise ValueError("unsupported row-6 resident class boundary")
    for i in range(12):
        class_state[i] = 0
    class_state[0] = -1
    # Selected unit columns must be exact relation kernels.
    for kernel in range(kernel_columns):
        for row in range(rows):
            value = 0
            for source in range(columns):
                value += (
                    raw_relations[source * rows + row]
                    * raw_to_unit_kernel[kernel * columns + source]
                )
            if value != 0:
                class_state[0] = 2
                class_state[1] = kernel
                class_state[2] = row
                return 2

    # This bounded private verifier supports diagonal HNF presentations.  The
    # diagonal coefficients are live terminal output, not embedded answers.
    for class_column in range(class_columns):
        for other in range(class_columns):
            if (
                other != class_column
                and terminal_h[class_column * class_columns + other] != 0
            ):
                class_state[0] = 1
                return 1
        expected = terminal_h[class_column * class_columns + class_column]
        if expected == 0:
            class_state[0] = 1
            return 1
        nonzero = 0
        target = -1
        for row in range(rows):
            value = 0
            for source in range(columns):
                value += (
                    raw_relations[source * rows + row]
                    * raw_to_presentation[class_column * columns + source]
                )
            if value != 0:
                if value != expected:
                    class_state[0] = 3
                    return 3
                nonzero += 1
                target = row
        if nonzero != 1:
            class_state[0] = 4
            return 4
        targets[class_column] = target
    for left in range(class_columns):
        for right in range(left):
            if targets[left] == targets[right]:
                class_state[0] = 5
                return 5

    reconstructed = 0
    inert_count = 0
    for index in range(rows):
        prime = descriptor_primes[index]
        residue_degree = descriptor_f[index]
        ramification = descriptor_e[index]
        inert = descriptor_inert[index]
        if prime < 2 or residue_degree < 1 or ramification < 1:
            class_state[0] = 6
            class_state[1] = index
            return 6
        for i in range(3):
            prime_generator[i] = descriptor_generators[3 * index + i]
        pari_prime_ideal_hnf(
            multiplication_basis,
            prime_generator,
            3,
            prime,
            inert,
            prime_multiplication,
            prime_work,
            prime_pivots,
            reconstructed_ideal,
        )
        for i in range(9):
            if reconstructed_ideal[i] != factor_ideals[9 * index + i]:
                class_state[0] = 7
                class_state[1] = index
                class_state[2] = i
                return 7
        norm = 1
        for i in range(residue_degree):
            norm *= prime
        if norm != factor_norms[index]:
            class_state[0] = 8
            class_state[1] = index
            return 8
        reconstructed += 1
        inert_count += inert

    checked_products = 0
    nonzero_entries = 0
    maximum_exponent = 0
    for column in range(columns):
        for i in range(9):
            product[i] = 0
        product[0] = 1
        product[4] = 1
        product[8] = 1
        for row in range(rows):
            exponent = raw_relations[column * rows + row]
            if exponent < 0 or exponent > 32:
                class_state[0] = 9
                class_state[1] = column
                class_state[2] = row
                return 9
            if exponent != 0:
                nonzero_entries += 1
                if exponent > maximum_exponent:
                    maximum_exponent = exponent
                for i in range(9):
                    right_ideal[i] = factor_ideals[9 * row + i]
                for power in range(exponent):
                    status = _pari_exact_cubic_ideal_multiply(
                        product,
                        right_ideal,
                        multiplication_basis,
                        ideal_generators,
                        ideal_hnf_work,
                        next_product,
                    )
                    if status != 0:
                        class_state[0] = 10
                        return 10
                    for i in range(9):
                        product[i] = next_product[i]
                    checked_products += 1
        for i in range(3):
            principal_generator[i] = principal_generators[3 * column + i]
        pari_cubic_mul_matrix(
            multiplication_basis, principal_generator, principal_matrix
        )
        if not _same_lattice3(product, principal_matrix):
            class_state[0] = 11
            class_state[1] = column
            return 11

    for i in range(class_columns * rows):
        factor_map[i] = 0
    for class_column in range(class_columns):
        factor_map[class_column * rows + targets[class_column]] = 1
        active_rows[class_column] = targets[class_column]
    class_state[0] = 0
    class_state[1] = reconstructed
    class_state[2] = inert_count
    class_state[3] = columns
    class_state[4] = nonzero_entries
    class_state[5] = checked_products
    class_state[6] = maximum_exponent
    class_state[7] = targets[0]
    if class_columns > 1:
        class_state[8] = targets[1]
    class_state[9] = degree
    class_state[10] = kernel_columns
    class_state[11] = class_columns
    return 0


__all__ = ["pari_row6_phase6_resident_class_private"]

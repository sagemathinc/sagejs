"""Construct row 19's exact compact rank-one unit from resident owners."""

from typing import TypedDict

from sagejs.native import Int64Buffer, IntegerBuffer, int64_workspace, native, uint64


class Row19UnitManifest(TypedDict):
    relation_count: uint64
    kernel_rank: uint64
    log_stride: uint64
    degree: uint64


@native
def _row19_extended_gcd(left: int, right: int) -> tuple[int, int, int]:
    old_r = left
    r = right
    old_s = 1
    s = 0
    old_t = 0
    t = 1
    while r != 0:
        quotient = old_r // r
        old_r, r = r, old_r - quotient * r
        old_s, s = s, old_s - quotient * s
        old_t, t = t, old_t - quotient * t
    if old_r < 0:
        old_r = -old_r
        old_s = -old_s
        old_t = -old_t
    return old_r, old_s, old_t


@native
def _row19_unit_log_multiple(
    kernel: IntegerBuffer,
    target: int,
    logs: IntegerBuffer,
    regulator: IntegerBuffer,
) -> tuple[int, int]:
    """Return nearest regulator multiple and strict `2^-120` certificate."""
    minimum_shift = 0
    initialized = False
    for relation in range(430):
        coefficient = kernel[target * 430 + relation]
        mantissa = logs[14 * relation + 1]
        precision = logs[14 * relation + 2]
        exponent = logs[14 * relation + 3]
        if coefficient == 0 or mantissa == 0:
            continue
        shift = 0
        if precision != -1:
            if (
                precision != 64
                and precision != 128
                and precision != 192
                and precision != 256
            ):
                raise ValueError("unsupported row-19 packed log precision")
            shift = exponent - precision + 1
        if not initialized or shift < minimum_shift:
            minimum_shift = shift
            initialized = True
    regulator_shift = 0
    if regulator[1] != -1:
        regulator_shift = regulator[2] - regulator[1] + 1
    if not initialized or regulator_shift < minimum_shift:
        minimum_shift = regulator_shift
    numerator = 0
    for relation in range(430):
        coefficient = kernel[target * 430 + relation]
        mantissa = logs[14 * relation + 1]
        precision = logs[14 * relation + 2]
        exponent = logs[14 * relation + 3]
        if coefficient == 0 or mantissa == 0:
            continue
        shift = 0
        if precision != -1:
            shift = exponent - precision + 1
        numerator += coefficient * mantissa * (1 << (shift - minimum_shift))
    denominator = regulator[0] * (1 << (regulator_shift - minimum_shift))
    if denominator == 0:
        raise ValueError("zero row-19 regulator")
    sign = 1
    if numerator < 0:
        numerator = -numerator
        sign = -sign
    if denominator < 0:
        denominator = -denominator
        sign = -sign
    quotient = numerator // denominator
    remainder = numerator - quotient * denominator
    if 2 * remainder >= denominator:
        quotient += 1
    multiple = sign * quotient
    signed_numerator = numerator
    if sign < 0:
        signed_numerator = -signed_numerator
    residual = signed_numerator - multiple * denominator
    if residual < 0:
        residual = -residual
    certified = 0
    if residual == 0:
        certified = 1
    elif minimum_shift < -120:
        residual_bits = 0
        residual_work = residual
        while residual_work != 0:
            residual_work //= 2
            residual_bits += 1
        if residual_bits <= -120 - minimum_shift:
            certified = 1
    return multiple, certified


@native
def _row19_generator_norm(generators: IntegerBuffer, relation: int) -> int:
    """Exact norm in the prepared integral basis."""
    a = generators[3 * relation]
    b = generators[3 * relation + 1]
    c = generators[3 * relation + 2]
    # Multiplication-by-(a,b,c), column-major, from the authenticated field.
    m0 = a
    m1 = b
    m2 = c
    m3 = b
    m4 = a + 254541 * c
    m5 = 200560490130 * c
    m6 = c
    m7 = 200560490130 * b + c
    m8 = a + 787930 * c
    return (
        m0 * (m4 * m8 - m7 * m5) - m3 * (m1 * m8 - m7 * m2) + m6 * (m1 * m5 - m4 * m2)
    )


@native
def pari_row19_phase6_resident_unit_private(
    manifest: Row19UnitManifest,
    kernel: IntegerBuffer,
    logs: IntegerBuffer,
    regulator: IntegerBuffer,
    generators: IntegerBuffer,
    dependency_output: IntegerBuffer,
    inverse_output: IntegerBuffer,
    multiples_output: Int64Buffer,
    state_output: Int64Buffer,
) -> int:
    """Publish a primitive exact factored unit and its factored inverse."""
    if (
        manifest["relation_count"] != 430
        or manifest["kernel_rank"] != 6
        or manifest["log_stride"] != 14
        or manifest["degree"] != 3
        or len(kernel) < 2580
        or len(logs) < 6020
        or len(regulator) < 3
        or len(generators) < 1290
        or len(dependency_output) < 430
        or len(inverse_output) < 430
        or len(multiples_output) < 6
        or len(state_output) < 10
    ):
        raise ValueError("unsupported row-19 resident unit boundary")
    for target in range(6):
        multiple, certified = _row19_unit_log_multiple(kernel, target, logs, regulator)
        multiples_output[target] = multiple
        if certified == 0:
            state_output[0] = 1
            state_output[1] = target
            return 1
    bezout: Int64Buffer = int64_workspace(6)
    for i in range(6):
        bezout[i] = 0
    divisor = 0
    for i in range(6):
        gcd, left, right = _row19_extended_gcd(divisor, multiples_output[i])
        for j in range(6):
            bezout[j] *= left
        bezout[i] += right
        divisor = gcd
    if divisor != 1:
        state_output[0] = 2
        state_output[1] = divisor
        return 2
    nonzero = 0
    maximum_bits = 0
    negative_parity = 0
    for relation in range(430):
        exponent = 0
        for target in range(6):
            exponent += kernel[target * 430 + relation] * bezout[target]
        dependency_output[relation] = exponent
        inverse_output[relation] = -exponent
        if exponent != 0:
            nonzero += 1
            absolute = exponent
            if absolute < 0:
                absolute = -absolute
            bits = 0
            while absolute != 0:
                absolute //= 2
                bits += 1
            if bits > maximum_bits:
                maximum_bits = bits
        norm = _row19_generator_norm(generators, relation)
        if norm == 0:
            raise ValueError("zero row-19 principal generator")
        if norm < 0:
            negative_parity = (negative_parity + exponent % 2) % 2
    for i in range(10):
        state_output[i] = 0
    state_output[0] = 0
    state_output[1] = 430
    state_output[2] = 6
    state_output[3] = 1
    state_output[4] = nonzero
    state_output[5] = maximum_bits
    state_output[6] = 1
    if negative_parity != 0:
        state_output[6] = -1
    state_output[7] = 1
    state_output[8] = 192
    state_output[9] = 1
    return 0


__all__ = ["pari_row19_phase6_resident_unit_private"]

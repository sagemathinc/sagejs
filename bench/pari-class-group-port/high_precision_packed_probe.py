"""Neutral 153,088-bit packed-real feasibility probes.

The inputs are mathematical constants, not data extracted from a number-field
answer.  Caller-owned caches and binary-splitting storage make the resource
boundary explicit while retaining ordinary CPython semantics.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .exponential_entry import pari_prepared_exp
from .getfu_mixed_complex import pari_mixed_complex_exp
from .logarithm_constant import pari_log2_constant
from .pi_constant import pari_pi_constant


@native
def _check_probe_storage(
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
    output_length: int,
) -> int:
    if len(pi_cache) < 3 or len(log_cache) < 3:
        raise ValueError("high-precision probe cache exhausted")
    if len(a) < 16385 or len(b) < 16385 or len(p) < 16385 or len(q) < 16385:
        raise ValueError("high-precision probe coefficient storage exhausted")
    if len(stack) < 105:
        raise ValueError("high-precision probe splitting stack exhausted")
    if len(output) < output_length or len(state) < 4:
        raise ValueError("high-precision probe output storage exhausted")
    return 0


@native
def pari_high_precision_real_probe(
    precision: int,
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Compute π, log(2), and exp(log(2)) before publishing any output."""
    if precision != 153088:
        raise ValueError("unsupported high-precision probe target")
    _check_probe_storage(pi_cache, log_cache, a, b, p, q, stack, output, state, 9)
    pm, pp, pe = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
    lm, lp, le = pari_log2_constant(precision, log_cache, a, b, p, q, stack)
    em, ep, ee = pari_prepared_exp(lm, lp, le, log_cache, a, b, p, q, stack)
    output[0] = pm
    output[1] = pp
    output[2] = pe
    output[3] = lm
    output[4] = lp
    output[5] = le
    output[6] = em
    output[7] = ep
    output[8] = ee
    state[0] = 1
    state[1] = precision
    state[2] = 16384
    state[3] = 105
    return 0


@native
def pari_high_precision_complex_probe(
    precision: int,
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Compute exp(log(2) + i) through the packed mixed-complex graph."""
    if precision != 153088:
        raise ValueError("unsupported high-precision probe target")
    _check_probe_storage(pi_cache, log_cache, a, b, p, q, stack, output, state, 15)
    pm, pp, pe = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
    lm, lp, le = pari_log2_constant(precision, log_cache, a, b, p, q, stack)
    em, ep, ee = pari_prepared_exp(lm, lp, le, log_cache, a, b, p, q, stack)
    rm, rp, re, im, ip, ie = pari_mixed_complex_exp(
        lm,
        lp,
        le,
        1 << (precision - 1),
        precision,
        0,
        log_cache,
        pi_cache,
        a,
        b,
        p,
        q,
        stack,
    )
    output[0] = pm
    output[1] = pp
    output[2] = pe
    output[3] = lm
    output[4] = lp
    output[5] = le
    output[6] = em
    output[7] = ep
    output[8] = ee
    output[9] = rm
    output[10] = rp
    output[11] = re
    output[12] = im
    output[13] = ip
    output[14] = ie
    state[0] = 2
    state[1] = precision
    state[2] = 16384
    state[3] = 105
    return 0

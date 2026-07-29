"""Small mpmath compatibility surface used by the RH corpus.

This is intentionally not an implementation of the full mpmath package.  It
provides ``li`` through Sage.js's FLINT/Arb numerical backend so historical
Sage source can retain its ordinary import.
"""

import sagejs.runtime as runtime


def li(value, offset=False):
    logarithmic_integral = runtime.reflect.get(
        runtime.global_object, 'Li')
    answer = logarithmic_integral(value)
    if offset:
        answer -= logarithmic_integral(2)
    return answer

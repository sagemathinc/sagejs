"""Double-precision complex elementary functions."""

import math


pi = math.pi
e = math.e
tau = 2 * pi
inf = float('inf')
nan = float('nan')
infj = complex(0, inf)
nanj = complex(0, nan)


def _z(value):
    return complex(value)


def phase(value):
    value = _z(value)
    return math.atan2(value.imag, value.real)


def polar(value):
    value = _z(value)
    return abs(value), phase(value)


def rect(radius, angle):
    return complex(radius * math.cos(angle), radius * math.sin(angle))


def exp(value):
    value = _z(value)
    magnitude = math.exp(value.real)
    return rect(magnitude, value.imag)


def log(value, base=None):
    value = _z(value)
    if value.real == 0 and value.imag == 0:
        raise ValueError('math domain error')
    answer = complex(math.log(abs(value)), phase(value))
    if base is not None:
        answer = answer / log(base)
    return answer


def log10(value):
    return log(value) / math.log(10)


def sqrt(value):
    value = _z(value)
    if value.real == 0 and value.imag == 0:
        return complex(0, value.imag)
    magnitude = math.sqrt(abs(value))
    return rect(magnitude, phase(value) / 2)


def sin(value):
    value = _z(value)
    return complex(
        math.sin(value.real) * math.cosh(value.imag),
        math.cos(value.real) * math.sinh(value.imag),
    )


def cos(value):
    value = _z(value)
    return complex(
        math.cos(value.real) * math.cosh(value.imag),
        -math.sin(value.real) * math.sinh(value.imag),
    )


def tan(value):
    return sin(value) / cos(value)


def sinh(value):
    value = _z(value)
    return complex(
        math.sinh(value.real) * math.cos(value.imag),
        math.cosh(value.real) * math.sin(value.imag),
    )


def cosh(value):
    value = _z(value)
    return complex(
        math.cosh(value.real) * math.cos(value.imag),
        math.sinh(value.real) * math.sin(value.imag),
    )


def tanh(value):
    return sinh(value) / cosh(value)


def asin(value):
    value = _z(value)
    unit = complex(0, 1)
    return -unit * log(unit * value + sqrt(1 - value * value))


def acos(value):
    return complex(pi / 2, 0) - asin(value)


def atan(value):
    value = _z(value)
    unit = complex(0, 1)
    return (unit / 2) * (log(1 - unit * value) - log(1 + unit * value))


def asinh(value):
    value = _z(value)
    return log(value + sqrt(value * value + 1))


def acosh(value):
    value = _z(value)
    return log(value + sqrt(value + 1) * sqrt(value - 1))


def atanh(value):
    value = _z(value)
    return (log(1 + value) - log(1 - value)) / 2


def isfinite(value):
    value = _z(value)
    return not (
        math.isinf(value.real) or math.isnan(value.real)
        or math.isinf(value.imag) or math.isnan(value.imag)
    )


def isinf(value):
    value = _z(value)
    return math.isinf(value.real) or math.isinf(value.imag)


def isnan(value):
    value = _z(value)
    return math.isnan(value.real) or math.isnan(value.imag)


def isclose(a, b, *, rel_tol=1e-09, abs_tol=0.0):
    if rel_tol < 0 or abs_tol < 0:
        raise ValueError('tolerances must be non-negative')
    difference = abs(_z(a) - _z(b))
    return difference <= max(
        rel_tol * max(abs(_z(a)), abs(_z(b))),
        abs_tol,
    )

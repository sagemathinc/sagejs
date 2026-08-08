###########################################################
# pylang Standard Library
# Author: Alexander Tsepkov
# Copyright 2013 Pyjeon Software LLC
# License: Apache License    2.0
# This library is covered under Apache license, so that
# you can distribute it with your pylang applications.
###########################################################

# basic implementation of Python's 'math' library

# NOTE: this is only meant to aid those porting lots of Python code into pylang.
# If you're writing a new pylang application, in most cases you probably want to
# use JavaScript's Math module directly instead

pi = Math.PI
e = Math.E


########################################
# Number-theoretic and representation functions
########################################
def ceil(x):
    return Math.ceil(x)


def copysign(x, y):
    x = Math.abs(x)
    if y < 0:
        return float(-x)
    else:
        return float(x)


def fabs(x):
    return float(Math.abs(x))


def factorial(x):
    if Math.abs(int(x)) is not x:
        raise ValueError("factorial() only accepts integral values")
    factorial.cache = []

    if x <= 12:
        # normal javascript integer
        def r(n):
            if n is 0 or n is 1:
                return 1
            if not factorial.cache[n]:
                factorial.cache[n] = r(n - 1) * n
            return factorial.cache[n]
    else:
        # use BigInt to avoid overflow
        def r(n):
            if n is 0 or n is 1:
                return BigInt(1)
            if not factorial.cache[n]:
                factorial.cache[n] = r(n - 1) * BigInt(n)
            return factorial.cache[n]

    return r(x)


def floor(x):
    return Math.floor(x)


def fmod(x, y):
    # javascript's % operator isn't consistent with C fmod implementation, this function is
    while y <= x:
        x -= y
    return float(x)


def fsum(iterable):
    # like Python's fsum, this method is much more resilient to rounding errors than regular sum
    partials = []  # sorted, non-overlapping partial sums
    for x in iterable:
        i = 0
        for y in partials:
            if Math.abs(x) < Math.abs(y):
                x, y = y, x
            hi = x + y
            lo = y - (hi - x)
            if lo:
                partials[i] = lo
                i += 1
            x = hi
        #partials[i:] = [x]
        partials.splice(i, partials.length - i, x)
    return float(sum(partials))


def isinf(x):
    return not isFinite(x)


def isfinite(x):
    return isFinite(x)


def isnan(x):
    return isNaN(x)


def frexp(x):
    """Return the mantissa and exponent satisfying ``x == m * 2**e``."""
    x = float(x)
    if x == 0.0 or isinf(x) or isnan(x):
        return x, 0
    exponent = int(Math.floor(Math.log2(Math.abs(x)))) + 1
    mantissa = x / Math.pow(2, Number(exponent))
    return mantissa, exponent


def ldexp(x, i):
    """Return ``x * (2**i)`` using the platform floating-point format."""
    x = float(x)
    i = int(i)
    # Python integers are represented exactly with BigInt when necessary,
    # while JavaScript Math methods require Number operands.  Coerce only at
    # this native boundary; an enormous exponent then naturally becomes
    # +/-Infinity and follows the overflow/underflow handling below.
    result = x * Math.pow(2, Number(i))
    if isFinite(x) and x != 0.0 and not isFinite(result):
        raise OverflowError('math range error')
    return float(result)


# CPython exposes these as built-in functions.  In particular, assigning
# ``math.frexp`` or ``math.ldexp`` to a class does not turn it into a method
# that receives the instance.  The runtime's static marker preserves that
# behavior for these Python implementations.
frexp.__staticmethod__ = True
ldexp.__staticmethod__ = True


def modf(x):
    m = fmod(x, 1)
    return float(m), float(x - m)


def trunc(x):
    return x | 0


########################################
# Power and logarithmic functions
########################################
def exp(x):
    return float(Math.exp(x))


def expm1(x):
    # NOTE: Math.expm1() is currently only implemented in Firefox, this provides alternative implementation
    # https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/expm1
    #return Math.expm1(x)
    if Math.abs(x) < 1e-5:
        return float(x + 0.5 * x * x)
    else:
        return float(Math.exp(x) - 1)


def log(x, base=e):
    # JavaScript cannot convert a sufficiently large BigInt to a finite
    # Number.  CPython's math.log accepts arbitrary integers by extracting a
    # leading floating-point mantissa and accounting for the discarded bits.
    def natural_log(value):
        if type(value) is int:
            if value <= 0:
                raise ValueError('math domain error')
            bits = value.bit_length()
            if bits > 53:
                shift = bits - 53
                leading = float(value >> shift)
                return Math.log(leading) + shift * Math.LN2
        converted = float(value)
        if converted <= 0:
            raise ValueError('math domain error')
        return Math.log(converted)

    return float(natural_log(x) / natural_log(base))


def log1p(x):
    # NOTE: Math.log1p() is currently only implemented in Firefox, this provides alternative implementation
    # https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/log1p
    # this version has been taken from http://phpjs.org/functions/log1p/
    # admittedly it's not as accurate as MDN version, as you can see from math.log1p(1) result
    ret = 0
    n = 50
    if x <= -1:
        return Number.NEGATIVE_INFINITY
    if x < 0 or x > 1:
        return float(Math.log(1 + x))
    for i in range(1, n):
        if i % 2 is 0:
            ret -= Math.pow(x, i) / i
        else:
            ret += Math.pow(x, i) / i
    return float(ret)


def log10(x):
    # NOTE: Math.log10() is currently only implemented in Firefox, this provides alternative implementation
    # https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/log10
    # I didn't find a more accurate algorithm so I'm using the basic implementation
    return float(Math.log(x) / Math.LN10)


def pow(x, y):
    x = float(x)
    y = float(y)
    if x < 0 and (not isfinite(y) or int(y) != y):
        raise ValueError('math domain error')
    if isnan(y) and x == 1:
        return float(1)
    return float(Math.pow(x, y))


def sqrt(x):
    x = float(x)
    return float(Math.sqrt(x))


########################################
# Trigonometric functions
########################################
def acos(x):
    return float(Math.acos(x))


def asin(x):
    return float(Math.asin(x))


def atan(x):
    return float(Math.atan(x))


def atan2(y, x):
    return float(Math.atan2(y, x))


def cos(x):
    return float(Math.cos(x))


def sin(x):
    return float(Math.sin(x))


def hypot(x, y):
    return float(Math.sqrt(x * x + y * y))


def tan(x):
    return float(Math.tan(x))


########################################
# Angular conversion
########################################
def degrees(x):
    return float(x * 180 / pi)


def radians(x):
    return float(x * pi / 180)


########################################
# Hyperbolic functions
########################################
def acosh(x):
    # NOTE: will be replaced with official, when it becomes mainstream
    # https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/acosh
    return float(Math.log(x + Math.sqrt(x * x - 1)))


def asinh(x):
    x = float(x)
    if x == 0:
        return x
    magnitude = Math.log(Math.abs(x) + Math.sqrt(x * x + 1))
    return float(-magnitude if x < 0 else magnitude)


def atanh(x):
    # NOTE: will be replaced with official, when it becomes mainstream
    # https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/atanh
    return float(0.5 * Math.log((1 + x) / (1 - x)))


def cosh(x):
    x = float(x)
    answer = (Math.exp(x) + Math.exp(-x)) / 2
    if isfinite(x) and not isfinite(answer):
        raise OverflowError('math range error')
    return float(answer)


def sinh(x):
    x = float(x)
    answer = (Math.exp(x) - Math.exp(-x)) / 2
    if isfinite(x) and not isfinite(answer):
        raise OverflowError('math range error')
    return float(answer)


def tanh(x):
    # NOTE: will be replaced with official, when it becomes mainstream
    # https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/tanh
    return float(
        (Math.exp(x) - Math.exp(-x))
        / (Math.exp(x) + Math.exp(-x)))


#import stdlib
#print(math.ceil(4.2))
#print(math.floor(4.2))
#print(math.fabs(-6))
#print(math.copysign(-5, 7))
#print(math.factorial(4))
#print(math.fmod(-1e100, 1e100))
#
#d = [0.9999999, 1, 2, 3]
#print(sum(d), math.fsum(d))
#print(math.isinf(5), math.isinf(Infinity))
#print(math.modf(5.5))
#print(math.trunc(2.6), math.trunc(-2.6))
#print(math.exp(1e-5), math.expm1(1e-5))
#print(math.log(10), math.log(10, 1000))
#print(math.log1p(1e-15), math.log1p(1))
#print(math.log10(1000), math.log(1000, 10))
#print(math.pow(1, 0), math.pow(1, NaN), math.pow(0, 0), math.pow(NaN, 0), math.pow(4,3), math.pow(100, -2))
#print(math.hypot(3,4))
#print(math.acosh(2), math.asinh(1), math.atanh(0.5), math.cosh(1), math.cosh(-1), math.sinh(1), math.tanh(1))

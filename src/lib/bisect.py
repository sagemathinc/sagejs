"""Array bisection algorithms."""


def _type_name(value):
    name = type(value).__name__
    if name.startswith('ρσ_'):
        return name[3:]
    return name


def _as_index(value, argument):
    if value is True or value is False:
        return int(value)
    if isinstance(value, int):
        return value
    try:
        method = value.__index__
    except AttributeError:
        if argument == 'hi':
            raise TypeError(
                "argument should be integer or None, not '"
                + _type_name(value) + "'")
        raise TypeError(
            "'" + _type_name(value)
            + "' object cannot be interpreted as an integer")
    answer = method()
    if not (answer is True or answer is False or isinstance(answer, int)):
        raise TypeError(
            '__index__ returned non-int (type '
            + _type_name(answer) + ')')
    return int(answer)


def _coerce_bounds(lo, hi):
    lo = _as_index(lo, 'lo')
    if hi is not None:
        hi = _as_index(hi, 'hi')
    return lo, hi


def _finish_bounds(values, lo, hi):
    if lo < 0:
        raise ValueError('lo must be non-negative')
    if hi is None:
        hi = len(values)
    return lo, hi


def _bounds(values, lo, hi):
    lo, hi = _coerce_bounds(lo, hi)
    return _finish_bounds(values, lo, hi)


def bisect_right(values, item, lo=0, hi=None, *, key=None):
    # This overwhelmingly common form is also used in the innermost loops of
    # mpmath's integer arithmetic.  Avoid allocating two temporary bound
    # tuples and re-validating compiler-supplied defaults on every search.
    if lo == 0 and hi is None:
        hi = len(values)
    else:
        lo, hi = _bounds(values, lo, hi)
    while lo < hi:
        middle = (lo + hi) // 2
        candidate = values[middle] if key is None else key(values[middle])
        if item < candidate:
            hi = middle
        else:
            lo = middle + 1
    return lo


def bisect_left(values, item, lo=0, hi=None, *, key=None):
    if lo == 0 and hi is None:
        hi = len(values)
    else:
        lo, hi = _bounds(values, lo, hi)
    while lo < hi:
        middle = (lo + hi) // 2
        candidate = values[middle] if key is None else key(values[middle])
        if candidate < item:
            lo = middle + 1
        else:
            hi = middle
    return lo


bisect = bisect_right


def insort_right(values, item, lo=0, hi=None, *, key=None):
    lo, hi = _coerce_bounds(lo, hi)
    comparison = item if key is None else key(item)
    lo, hi = _finish_bounds(values, lo, hi)
    values.insert(bisect_right(values, comparison, lo, hi, key=key), item)


def insort_left(values, item, lo=0, hi=None, *, key=None):
    lo, hi = _coerce_bounds(lo, hi)
    comparison = item if key is None else key(item)
    lo, hi = _finish_bounds(values, lo, hi)
    values.insert(bisect_left(values, comparison, lo, hi, key=key), item)


insort = insort_right

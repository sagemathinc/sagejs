"""Array bisection algorithms."""


def bisect_right(values, item, lo=0, hi=None, *, key=None):
    if lo < 0:
        raise ValueError('lo must be non-negative')
    if hi is None:
        hi = len(values)
    while lo < hi:
        middle = (lo + hi) // 2
        candidate = values[middle] if key is None else key(values[middle])
        if item < candidate:
            hi = middle
        else:
            lo = middle + 1
    return lo


def bisect_left(values, item, lo=0, hi=None, *, key=None):
    if lo < 0:
        raise ValueError('lo must be non-negative')
    if hi is None:
        hi = len(values)
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
    comparison = item if key is None else key(item)
    values.insert(bisect_right(values, comparison, lo, hi, key=key), item)


def insort_left(values, item, lo=0, hi=None, *, key=None):
    comparison = item if key is None else key(item)
    values.insert(bisect_left(values, comparison, lo, hi, key=key), item)


insort = insort_right


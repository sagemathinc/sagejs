"""Core iterator building blocks compatible with :mod:`itertools`."""


def count(start=0, step=1):
    value = start
    while True:
        yield value
        value += step


def repeat(value, times=None):
    if times is None:
        while True:
            yield value
    else:
        for _index in range(times):
            yield value


def cycle(iterable):
    saved = []
    for value in iterable:
        yield value
        saved.append(value)
    while saved:
        for value in saved:
            yield value


def chain(*iterables):
    for iterable in iterables:
        for value in iterable:
            yield value


def _chain_from_iterable(iterables):
    for iterable in iterables:
        for value in iterable:
            yield value


chain.from_iterable = _chain_from_iterable


def accumulate(iterable, func=None, initial=None):
    iterator = iter(iterable)
    if initial is None:
        try:
            total = next(iterator)
        except StopIteration:
            return
    else:
        total = initial
    yield total
    for value in iterator:
        total = total + value if func is None else func(total, value)
        yield total


def compress(data, selectors):
    for value, selected in zip(data, selectors):
        if selected:
            yield value


def dropwhile(predicate, iterable):
    iterator = iter(iterable)
    for value in iterator:
        if not predicate(value):
            yield value
            break
    for value in iterator:
        yield value


def takewhile(predicate, iterable):
    for value in iterable:
        if not predicate(value):
            break
        yield value


def filterfalse(predicate, iterable):
    if predicate is None:
        predicate = bool
    for value in iterable:
        if not predicate(value):
            yield value


def groupby(iterable, key=None):
    """Group adjacent values by a key.

    The group iterators are materialized independently.  This is slightly
    more permissive than CPython's shared-source iterator and is especially
    useful to consumers that retain more than one group.
    """
    if key is None:
        key = lambda value: value
    iterator = iter(iterable)
    try:
        current = next(iterator)
    except StopIteration:
        return
    current_key = key(current)
    group = [current]
    for value in iterator:
        value_key = key(value)
        if value_key == current_key:
            group.append(value)
        else:
            yield current_key, iter(group)
            current_key = value_key
            group = [value]
    yield current_key, iter(group)


def starmap(function, iterable):
    for arguments in iterable:
        yield function(*arguments)


def islice(iterable, *args):
    if len(args) == 1:
        start, stop, step = 0, args[0], 1
    elif len(args) == 2:
        start, stop, step = args[0], args[1], 1
    elif len(args) == 3:
        start, stop, step = args
    else:
        raise TypeError("islice expected 2 to 4 arguments")
    if start is None:
        start = 0
    if step is None:
        step = 1
    if start < 0 or step <= 0 or (stop is not None and stop < 0):
        raise ValueError("indices for islice() must be non-negative")
    for index, value in enumerate(iterable):
        if stop is not None and index >= stop:
            break
        if index >= start and (index - start) % step == 0:
            yield value


def pairwise(iterable):
    iterator = iter(iterable)
    try:
        previous = next(iterator)
    except StopIteration:
        return
    for value in iterator:
        yield (previous, value)
        previous = value


def product(*iterables, repeat=1):
    pools = [tuple(pool) for pool in iterables] * repeat
    result = [()]
    for pool in pools:
        result = [prefix + (value,) for prefix in result for value in pool]
    for values in result:
        yield values


def permutations(iterable, r=None):
    pool = tuple(iterable)
    length = len(pool)
    if r is None:
        r = length
    if r < 0 or r > length:
        return
    indices = list(range(length))
    cycles = list(range(length, length - r, -1))
    yield tuple(pool[index] for index in indices[:r])
    while length:
        for offset in range(r - 1, -1, -1):
            cycles[offset] -= 1
            if cycles[offset] == 0:
                indices[offset:] = indices[offset + 1 :] + indices[offset : offset + 1]
                cycles[offset] = length - offset
            else:
                swap = cycles[offset]
                indices[offset], indices[-swap] = indices[-swap], indices[offset]
                yield tuple(pool[index] for index in indices[:r])
                break
        else:
            return


def combinations(iterable, r):
    pool = tuple(iterable)
    length = len(pool)
    if r < 0 or r > length:
        return
    indices = list(range(r))
    yield tuple(pool[index] for index in indices)
    while True:
        for offset in range(r - 1, -1, -1):
            if indices[offset] != offset + length - r:
                break
        else:
            return
        indices[offset] += 1
        for following in range(offset + 1, r):
            indices[following] = indices[following - 1] + 1
        yield tuple(pool[index] for index in indices)


def combinations_with_replacement(iterable, r):
    pool = tuple(iterable)
    length = len(pool)
    if not length and r:
        return
    indices = [0] * r
    yield tuple(pool[index] for index in indices)
    while True:
        for offset in range(r - 1, -1, -1):
            if indices[offset] != length - 1:
                break
        else:
            return
        value = indices[offset] + 1
        for following in range(offset, r):
            indices[following] = value
        yield tuple(pool[index] for index in indices)


def zip_longest(*iterables, fillvalue=None):
    iterators = [iter(iterable) for iterable in iterables]
    active = len(iterators)
    while active:
        row = []
        for index, iterator in enumerate(iterators):
            if iterator is None:
                row.append(fillvalue)
                continue
            try:
                row.append(next(iterator))
            except StopIteration:
                active -= 1
                iterators[index] = None
                row.append(fillvalue)
        if active or any(iterator is not None for iterator in iterators):
            yield tuple(row)

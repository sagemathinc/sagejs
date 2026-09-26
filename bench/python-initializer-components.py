"""Isolate initializer binding, field stores, and a follow-up method call."""

import time


class Empty:
    pass


class NoOp:
    def __init__(self):
        pass


class Defaults:
    def __init__(self, left=1, right=2):
        pass


class Fields:
    def __init__(self, left=1, right=2):
        self.left = left
        self.right = right

    def total(self):
        return self.left + self.right


iterations = 100_000


def run(name):
    instance = None
    retained = []
    total = 0
    started = time.perf_counter()
    if name == "empty":
        for _ in range(iterations):
            instance = Empty()
    elif name == "noop":
        for _ in range(iterations):
            instance = NoOp()
    elif name == "default_positional":
        for index in range(iterations):
            retained.append(Defaults(index, 2))
    elif name == "default_keyword":
        for index in range(iterations):
            retained.append(Defaults(left=index, right=2))
    elif name == "fields_positional":
        for index in range(iterations):
            instance = Fields(index, 2)
    elif name == "fields_keyword":
        for index in range(iterations):
            instance = Fields(left=index, right=2)
    elif name == "fields_keyword_method":
        for index in range(iterations):
            total += Fields(left=index, right=2).total()
    else:
        raise ValueError(name)
    elapsed = (time.perf_counter() - started) * 1000
    if name == "fields_keyword_method":
        assert total == iterations * (iterations - 1) // 2 + 2 * iterations
    elif name in ("default_positional", "default_keyword"):
        assert len(retained) == iterations
        assert all(type(value) is Defaults for value in retained)
    else:
        assert instance is not None
    print(name, elapsed)


for case in (
    "empty",
    "noop",
    "default_positional",
    "default_keyword",
    "fields_positional",
    "fields_keyword",
    "fields_keyword_method",
):
    run(case)

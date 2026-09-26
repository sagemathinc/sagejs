"""Checked class-method lookup benchmark for native and Python receivers."""

import time


ITERATIONS = 100_000


class Collector:
    def __init__(self):
        self.values = []

    def append(self, value):
        self.values.append(value)


def check(native, user):
    assert len(native) == ITERATIONS // 2
    assert len(user.values) == ITERATIONS // 2
    assert sum(native) == ITERATIONS * ITERATIONS // 4
    assert sum(user.values) == ITERATIONS * (ITERATIONS - 2) // 4


def immediate_class_lookup():
    native = []
    user = Collector()
    started = time.perf_counter()
    for index in range(ITERATIONS):
        if index % 2:
            list.append(native, index)
        else:
            Collector.append(user, index)
    elapsed = (time.perf_counter() - started) * 1000
    check(native, user)
    print("polymorphic", elapsed)


def saved_callback_control():
    native = []
    user = Collector()
    methods = (Collector.append, list.append)
    receivers = (user, native)
    started = time.perf_counter()
    for index in range(ITERATIONS):
        choice = index % 2
        methods[choice](receivers[choice], index)
    elapsed = (time.perf_counter() - started) * 1000
    check(native, user)
    print("saved_callbacks", elapsed)


immediate_class_lookup()
saved_callback_control()

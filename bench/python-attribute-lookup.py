"""Focused Python attribute/descriptor lookup benchmark.

Run this unchanged under CPython and ``sagejs --python``.  The final checksum
keeps each lookup observable while the separate rows distinguish the common
own-field path from Python's descriptor and method-binding semantics.
"""

from time import perf_counter


ITERATIONS = 1_000_000


class OwnField:
    def __init__(self):
        self.value = 17


class PropertyField:
    def __init__(self):
        self._value = 19

    @property
    def value(self):
        return self._value


class InheritedField:
    value = 23


class BoundMethod:
    def value(self):
        return 29


own = OwnField()
property_field = PropertyField()
inherited = InheritedField()
method = BoundMethod()

started = perf_counter()
for _index in range(ITERATIONS):
    answer = own.value
print("own-field", answer, perf_counter() - started)

started = perf_counter()
for _index in range(ITERATIONS):
    answer = property_field.value
print("property", answer, perf_counter() - started)

started = perf_counter()
for _index in range(ITERATIONS):
    answer = inherited.value
print("inherited-field", answer, perf_counter() - started)

started = perf_counter()
for _index in range(ITERATIONS):
    answer = method.value
print("bound-method", answer(), perf_counter() - started)

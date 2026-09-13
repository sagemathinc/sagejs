import types
from typing import Generic, TypeVar


class Sample:
    def method(self, value):
        return value + 1


sample = Sample()
bound = sample.method
assert isinstance(bound, types.MethodType)
assert not isinstance(lambda value: value, types.MethodType)
rebound = types.MethodType(Sample.method, sample)
assert rebound(4) == 5


T = TypeVar("T")


class GenericBox(Generic[T]):
    def __init__(self, value, **metadata):
        self.value = value
        self.metadata = metadata


parameterized = GenericBox[int](5, label="exact")
assert isinstance(parameterized, GenericBox)
assert parameterized.value == 5
assert parameterized.metadata == {"label": "exact"}

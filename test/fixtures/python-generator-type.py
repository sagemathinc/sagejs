from builtins import isinstance as instance_check
from types import GeneratorType


def values():
    yield 1


def other_values():
    yield 2


class Source:
    def values(self):
        yield 3


generators = [values(), other_values(), Source().values(), (v for v in (4,))]
assert isinstance(GeneratorType, type)
assert GeneratorType.__name__ == "generator"
assert GeneratorType.__module__ == "builtins"
assert not isinstance([], GeneratorType)
assert not instance_check([], GeneratorType)
assert instance_check(GeneratorType, type)
assert not isinstance(iter([]), GeneratorType)
assert not isinstance(values, GeneratorType)
for index, generator in enumerate(generators):
    assert type(generator) is GeneratorType
    assert isinstance(generator, GeneratorType)
    assert instance_check(generator, GeneratorType)
    assert next(generator) == index + 1
    assert list(generator) == []
    assert type(generator) is GeneratorType
    assert isinstance(generator, GeneratorType)
    assert instance_check(generator, GeneratorType)

try:
    GeneratorType()
except TypeError as error:
    assert str(error) == "cannot create 'generator' instances"
else:
    assert False, "generator type cannot be directly instantiated"

# A type representation fix must not weaken candidate validation.
for candidate in (1, object()):
    try:
        isinstance([], candidate)
    except TypeError:
        pass
    else:
        assert False, "invalid isinstance type candidate was accepted"

# An imported first-class builtin and an ordinary bare-name call must enforce
# the same public type-candidate contract.
for candidate in (1, object()):
    try:
        instance_check([], candidate)
    except TypeError:
        pass
    else:
        assert False, "first-class isinstance accepted an invalid candidate"

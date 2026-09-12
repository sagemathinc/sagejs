def outer():
    def inner(value=(yield 1)):
        return value

    yield inner()


generator = outer()
assert next(generator) == 1
assert generator.send(42) == 42


def only_default():
    def inner(value=(yield 2)):
        return value

    return inner()


generator = only_default()
assert next(generator) == 2
try:
    generator.send(43)
except StopIteration as error:
    assert error.value == 43
else:
    assert False


def lambda_default():
    inner = lambda value=(yield 3): value
    yield inner()


generator = lambda_default()
assert next(generator) == 3
assert generator.send(44) == 44


def keyword_default():
    inner = lambda *, value=(yield 5): value
    assert inner.__defaults__ is None
    assert inner.__kwdefaults__ == {"value": 45}
    yield inner()


generator = keyword_default()
assert next(generator) == 5
assert generator.send(45) == 45


def decorator_default():
    @(yield 6)
    def inner(value=(yield 7)):
        return value

    assert inner.__defaults__ == (46,)
    yield inner()


generator = decorator_default()
assert next(generator) == 6
assert generator.send(lambda function: function) == 7
assert generator.send(46) == 46


def delegated_default():
    def source():
        yield 8
        return 47

    inner = lambda value=(yield from source()): value
    assert inner.__defaults__ == (47,)
    yield inner()


assert list(delegated_default()) == [8, 47]


events = []


def record(value):
    events.append(value)
    return value


function = lambda first=record(1), second=record(2), *, third=record(3): (
    first,
    second,
    third,
)
assert events == [1, 2, 3]
assert function() == (1, 2, 3)
assert function.__defaults__ == (1, 2)
assert function.__kwdefaults__ == {"third": 3}
assert events == [1, 2, 3]


def ordinary():
    def nested():
        yield 4

    return next(nested())


assert ordinary() == 4
print("generator-definition-scope-ok")

"""Required open generator-default defect; not an accepted incompatibility.

CPython yields 1 then 42. PR #244 incorrectly returns a generator as the second
value. Keep this full assertion while the independent selective-state tests
check only ownership across definition-time suspensions.
"""


def outer():
    def inner(value=(yield 1)):
        return value

    yield inner()


generator = outer()
assert next(generator) == 1
assert generator.send(42) == 42

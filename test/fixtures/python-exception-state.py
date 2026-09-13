import sys


def current():
    return sys.exception()


assert current() is None
outer = ValueError("outer")
inner = KeyError("inner")
try:
    raise outer
except ValueError:
    assert current() is outer
    try:
        raise inner
    except KeyError:
        assert current() is inner
    assert current() is outer
assert current() is None


def caught_return():
    try:
        raise inner
    except KeyError:
        assert current() is inner
        return 42


assert caught_return() == 42
assert current() is None
try:
    raise outer
except ValueError:
    assert caught_return() == 42
    assert current() is outer
assert current() is None

for i in range(2):
    try:
        raise inner
    except KeyError:
        if i == 0:
            continue
        break
assert current() is None

try:
    try:
        raise inner
    except ValueError:
        assert False
except KeyError:
    assert current() is inner
assert current() is None


def reraiser():
    raise


try:
    reraiser()
except RuntimeError as error:
    assert str(error) == "No active exception to reraise"
else:
    assert False
assert current() is None
try:
    raise outer
except ValueError:
    try:
        reraiser()
    except ValueError as error:
        assert error is outer
    assert current() is outer
assert current() is None
print("exception-state-ok")

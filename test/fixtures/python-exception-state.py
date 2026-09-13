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
cause = KeyError("cause")
try:
    raise outer from cause
except ValueError as error:
    assert error is outer
    assert error.__cause__ is cause
    assert error.__suppress_context__ is True
try:
    raise outer from None
except ValueError as error:
    assert error.__cause__ is None
    assert error.__suppress_context__ is True
try:
    raise ValueError from KeyError
except ValueError as error:
    assert isinstance(error.__cause__, KeyError)
try:
    raise outer from 42
except TypeError:
    pass
else:
    assert False
assert current() is None
print("exception-state-ok")

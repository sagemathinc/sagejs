"""Portable warning-assertion cases shared by CPython and Sage.js."""

import re
import unittest
import warnings


case = unittest.TestCase()


class ChildWarning(UserWarning):
    pass


def expect_error(expected, function):
    try:
        function()
    except expected as error:
        return error
    raise AssertionError("expected exception was not raised")


def emit(message, category=UserWarning, *, msg=None):
    warnings.warn(message if msg is None else msg, category)
    return "ignored callable result"


assert case.assertWarns(UserWarning, emit, "callable") is None
assert case.assertWarnsRegex(UserWarning, "needle", emit, "a needle b") is None
assert case.assertWarns(UserWarning, emit, "unused", msg="forwarded") is None
assert (
    case.assertWarnsRegex(UserWarning, "forwarded", emit, "unused", msg="forwarded")
    is None
)
assert case.assertWarns((RuntimeWarning, (UserWarning,)), emit, "tuple") is None

first = ChildWarning("first")
with case.assertWarns(UserWarning) as captured:
    warnings.warn(first)
    warnings.warn("second", UserWarning)
assert captured.warning is first
assert len(captured.warnings) == 2
assert captured.filename == captured.warnings[0].filename
assert captured.lineno == captured.warnings[0].lineno

selected = ChildWarning("prefix needle suffix")
with warnings.catch_warnings():
    warnings.simplefilter("always")
    with case.assertWarnsRegex(UserWarning, re.compile("needle")) as captured:
        warnings.warn("needle wrong category", RuntimeWarning)
        warnings.warn("first category match, wrong text", UserWarning)
        warnings.warn(selected)
        warnings.warn("later needle", UserWarning)
assert captured.warning is selected
assert captured.filename == captured.warnings[2].filename
assert captured.lineno == captured.warnings[2].lineno


def no_warning():
    with case.assertWarns(UserWarning, msg="custom failure"):
        pass


error = expect_error(AssertionError, no_warning)
assert "UserWarning not triggered" in str(error)
assert "custom failure" in str(error)
expect_error(AssertionError, lambda: case.assertWarns(UserWarning, lambda: None))
expect_error(
    AssertionError, lambda: case.assertWarnsRegex(UserWarning, "x", lambda: None)
)
expect_error(AssertionError, lambda: case.assertWarns((), emit, "empty tuple"))


def wrong_regex():
    with case.assertWarnsRegex(UserWarning, "needle", msg="regex failure"):
        warnings.warn("first text", UserWarning)
        warnings.warn("second text", UserWarning)


error = expect_error(AssertionError, wrong_regex)
assert '"needle" does not match "first text"' in str(error)
assert "regex failure" in str(error)

entered = []


def should_not_run():
    entered.append(True)


for invalid in (
    None,
    1,
    object,
    Exception,
    UserWarning("instance"),
    [UserWarning],
    (UserWarning, Exception),
):
    before = list(warnings.filters)
    expect_error(TypeError, lambda: case.assertWarns(invalid))
    expect_error(TypeError, lambda: case.assertWarns(invalid, should_not_run))
    expect_error(TypeError, lambda: case.assertWarnsRegex(invalid, "x"))
    expect_error(TypeError, lambda: case.assertWarnsRegex(invalid, "x", should_not_run))
    assert warnings.filters == before
assert entered == []
expect_error(TypeError, lambda: case.assertWarns(UserWarning, unknown=True))
expect_error(TypeError, lambda: case.assertWarnsRegex(UserWarning, "x", unknown=True))
expect_error(TypeError, lambda: case.assertWarnsRegex(UserWarning, object()))
expect_error(TypeError, lambda: case.assertWarns(UserWarning, None))
expect_error(TypeError, lambda: case.assertWarnsRegex(UserWarning, "x", None))

original = ValueError("body exception")


def body_raises():
    with case.assertWarns(UserWarning):
        warnings.warn("before failure", UserWarning)
        raise original


before = list(warnings.filters)
assert expect_error(ValueError, body_raises) is original
assert warnings.filters == before


def raise_warning_instead_of_emit():
    with case.assertWarns(UserWarning):
        raise UserWarning("raised, not emitted")


expect_error(UserWarning, raise_warning_instead_of_emit)
assert warnings.filters == before

for action in ("ignore", "error"):
    with warnings.catch_warnings():
        warnings.simplefilter(action, UserWarning)
        saved = list(warnings.filters)
        with case.assertWarns(UserWarning):
            warnings.warn("must be captured", ChildWarning)
        assert warnings.filters == saved
        if action == "error":
            expect_error(UserWarning, lambda: warnings.warn("restored", UserWarning))

with warnings.catch_warnings(record=True) as outer:
    warnings.simplefilter("always")
    saved = list(warnings.filters)
    with case.assertWarns(UserWarning):
        warnings.warn("inner only", UserWarning)
    assert outer == []
    assert warnings.filters == saved
    expect_error(AssertionError, no_warning)
    assert warnings.filters == saved
    expect_error(AssertionError, wrong_regex)
    assert warnings.filters == saved
    assert expect_error(ValueError, body_raises) is original
    assert warnings.filters == saved
    warnings.warn("outer after cleanup", RuntimeWarning)
    assert [str(record.message) for record in outer] == ["outer after cleanup"]

with warnings.catch_warnings():
    warnings.simplefilter("error", RuntimeWarning)
    expect_error(
        RuntimeWarning,
        lambda: case.assertWarns(UserWarning, emit, "unrelated", RuntimeWarning),
    )

with warnings.catch_warnings():
    warnings.simplefilter("always", RuntimeWarning)
    expect_error(
        AssertionError,
        lambda: case.assertWarns(UserWarning, emit, "wrong category", RuntimeWarning),
    )


class NamedCallable:
    __name__ = "named_callable"

    def __str__(self):
        raise AssertionError("existing callable name should avoid string conversion")

    def __call__(self):
        warnings.warn("named callable", UserWarning)


assert case.assertWarns(UserWarning, NamedCallable()) is None


class UnusualNamedCallable:
    __name__ = 17

    def __call__(self):
        pass


error = expect_error(
    AssertionError, lambda: case.assertWarns(UserWarning, UnusualNamedCallable())
)
assert str(error) == "UserWarning not triggered by 17"


class CustomFailure(Exception):
    pass


custom = unittest.TestCase()
custom.failureException = CustomFailure
custom.longMessage = False


def custom_failure():
    with custom.assertWarns(UserWarning, msg="only custom"):
        pass


assert str(expect_error(CustomFailure, custom_failure)) == "only custom"
print("unittest-warnings-ok")

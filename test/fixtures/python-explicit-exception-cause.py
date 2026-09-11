saved = ValueError("first")
try:
    raise RuntimeError("second") from saved
except RuntimeError as error:
    assert error.__cause__ is saved
    assert error.__suppress_context__ is True

target = RuntimeError("preserved")
target.__context__ = saved
try:
    raise target from None
except RuntimeError as error:
    assert error is target
    assert error.__cause__ is None
    assert error.__context__ is saved
    assert error.__suppress_context__ is True
    try:
        raise
    except RuntimeError as reraised:
        assert reraised is target
        assert reraised.__context__ is saved
        assert reraised.__cause__ is None
        assert reraised.__suppress_context__ is True

events = []


class Raised(Exception):
    def __init__(self):
        events.append("exception-init")


class Cause(Exception):
    def __init__(self):
        events.append("cause-init")


def exception_expression():
    events.append("exception-expression")
    return Raised


def cause_expression():
    events.append("cause-expression")
    return Cause


try:
    raise exception_expression() from cause_expression()
except Raised as error:
    assert isinstance(error.__cause__, Cause)
    assert events == [
        "exception-expression",
        "cause-expression",
        "exception-init",
        "cause-init",
    ]

events.clear()


def failing_cause():
    events.append("cause-expression")
    raise saved


try:
    raise exception_expression() from failing_cause()
except ValueError as error:
    assert error is saved
    assert events == ["exception-expression", "cause-expression"]

for invalid in (42, "not an exception", object()):
    try:
        raise RuntimeError("invalid cause") from invalid
    except TypeError:
        pass
    else:
        assert False


def closure_cause():
    local_cause = saved

    def inner():
        raise RuntimeError("closure") from local_cause

    return inner


try:
    closure_cause()()
except RuntimeError as error:
    assert error.__cause__ is saved
print("explicit-exception-cause-ok")

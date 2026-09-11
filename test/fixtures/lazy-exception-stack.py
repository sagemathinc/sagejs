import traceback


class Counter:
    def __init__(self, limit):
        self.limit = limit
        self.value = 0

    def __iter__(self):
        return self

    def __next__(self):
        if self.value == self.limit:
            raise StopIteration("finished")
        self.value += 1
        return self.value


for _ in range(20):
    assert list(Counter(3)) == [1, 2, 3]
    exhausted = Counter(0)
    assert next(exhausted, "default") == "default"
    try:
        next(exhausted)
    except StopIteration as error:
        assert error.args == ("finished",)
        assert error.value == "finished"
        assert str(error) == "finished"
        assert error.__traceback__ is not None
        assert error.with_traceback(error.__traceback__) is error


def generator():
    yield 5
    return 17


generated = generator()
assert next(generated) == 5
try:
    next(generated)
except StopIteration as error:
    assert error.value == 17
    assert error.args == (17,)


def lazy_exception_origin():
    raise ValueError("visible diagnostic")


try:
    lazy_exception_origin()
except ValueError as error:
    saved = error
    assert error.args == ("visible diagnostic",)
    assert str(error) == "visible diagnostic"
    assert repr(error) == "ValueError('visible diagnostic')"
    assert error.__traceback__ is not None
    frames = traceback.extract_tb(error.__traceback__)
    assert any("lazy_exception_origin" in frame.name for frame in frames)
    formatted = "".join(
        traceback.format_exception(type(error), error, error.__traceback__)
    )
    assert "ValueError: visible diagnostic" in formatted
    assert "lazy_exception_origin" in formatted
    assert traceback.format_exception_only(error) == [
        "ValueError: visible diagnostic\n"
    ]

try:
    raise RuntimeError("outer") from saved
except RuntimeError as error:
    assert error.__cause__ is saved
    assert error.__suppress_context__ is True
    assert error.__traceback__ is not None
    assert error.with_traceback(saved.__traceback__) is error
    assert error.__traceback__ is saved.__traceback__
print("lazy-exception-stack-oracle-ok")

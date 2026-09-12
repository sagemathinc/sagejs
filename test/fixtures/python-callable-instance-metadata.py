"""Callable instance metadata and error boundaries, without library imports."""


class Named:
    "user documentation"

    __name__ = 17
    __annotations__ = {"field": str}
    name = "user name"
    length = 12

    def __call__(self, value=3):
        return value


value = Named()
assert value.__name__ == 17
assert value.__annotations__ == {"field": str}
assert value.__doc__ == "user documentation"
assert value.name == "user name"
assert value.length == 12
assert value() == 3
assert value(value=5) == 5
value.__name__ = "instance name"
assert value.__name__ == "instance name"
assert Named().__name__ == 17

for value in (None, False, 3, "text", [], {}, object()):
    try:
        value()
    except TypeError as error:
        assert "object is not callable" in str(error)
    else:
        raise AssertionError("non-callable value accepted")


class Raises:
    def __call__(self):
        raise AttributeError("inside callable")


try:
    Raises()()
except AttributeError as error:
    assert str(error) == "inside callable"
else:
    raise AssertionError("callable body exception lost")

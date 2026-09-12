"""Portable observations; the diagnostic driver compares these with CPython 3.14."""

observations = []


def observe(name, operation):
    try:
        value = operation()
        observations.append([name, "value", type(value).__name__, repr(value)])
    except Exception as error:
        observations.append([name, "error", type(error).__name__, str(error)])


class ListLength(list):
    def __len__(self):
        return 7


class StringLength(str):
    def __len__(self):
        return 7


class Length:
    def __len__(self):
        return 7


class Empty:
    pass


class Index:
    def __index__(self):
        return 3

    def __repr__(self):
        return "Index()"


class Result:
    def __init__(self, result):
        self.result = result

    def __len__(self):
        return self.result


class Intercept:
    def __getattribute__(self, name):
        if name == "__len__":
            return lambda: 19
        return object.__getattribute__(self, name)

    def __len__(self):
        return 7


sentinel = ValueError("length sentinel")


class Throwing:
    def __len__(self):
        raise sentinel


def same_exception():
    try:
        len(Throwing())
    except ValueError as error:
        return error is sentinel
    return False


observe("list", lambda: len([1, 2]))
observe("list-subclass", lambda: len(ListLength([1, 2])))
observe("str-subclass", lambda: len(StringLength("ab")))
observe("type-slot", lambda: len(Length()))
shadow = Length()
shadow.__len__ = lambda: 19
observe("instance-shadow", lambda: len(shadow))
only_instance = Empty()
only_instance.__len__ = lambda: 19
observe("instance-only", lambda: len(only_instance))
observe("getattribute", lambda: len(Intercept()))
observe("missing-slot", lambda: len(Empty()))
observe("negative", lambda: len(Result(-1)))
observe("float", lambda: len(Result(2.5)))
observe("string", lambda: len(Result("3")))
observe("bool", lambda: len(Result(True)))
observe("index", lambda: len(Result(Index())))
observe("overflow", lambda: len(Result(int("1267650600228229401496703205376"))))
observe("exception-identity", same_exception)
observe("astral", lambda: len("𝄞"))
observe("two-astral", lambda: len("𝄞😀"))
observe("combining", lambda: len("e\u0301"))
observe("lone-high-surrogate", lambda: len("\ud834"))
observe("lone-low-surrogate", lambda: len("\udd1e"))
observe("explicit-surrogates", lambda: len("\ud834\udd1e"))
observe("surrogate-representation", lambda: "𝄞" == "\ud834\udd1e")

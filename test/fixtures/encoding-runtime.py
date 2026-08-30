import inspect


class Concrete:
    pass


assert not inspect.isabstract(Concrete)
assert "café".encode("unicode_escape") == b"caf\\xe9"
assert "line\n\\".encode("unicode-escape") == b"line\\n\\\\"
table = str.maketrans("ab", "xy", "!")
assert "a!cab".translate(table) == "xcxy"
assert "abc".translate({ord("b"): "--", ord("c"): None}) == "a--"

import inspect
import mimetypes


class Concrete:
    pass


assert not inspect.isabstract(Concrete)
assert mimetypes.guess_type("lesson.svgz") == ("image/svg+xml", "gzip")
assert mimetypes.guess_type("movie.webm?download=1") == ("video/webm", None)
mimetypes.add_type("application/x-sagejs-test", ".sjtest")
assert mimetypes.guess_extension("application/x-sagejs-test") == ".sjtest"
assert "café".encode("unicode_escape") == b"caf\\xe9"
assert "line\n\\".encode("unicode-escape") == b"line\\n\\\\"
table = str.maketrans("ab", "xy", "!")
assert "a!cab".translate(table) == "xcxy"
assert "abc".translate({ord("b"): "--", ord("c"): None}) == "a--"

import re

match = re.match(r"(?P<first>a)(?P<optional>b)?", "a")
assert match is not None

for args in [(), (0,), ("first",), (1,), (2,), ("optional",), (0, "first", 2)]:
    print("group", repr(args), repr(match.group(*args)))

print("span", match.span("first"))
print("optional span", match.span("optional"))
for args in [(3,), ("missing",), (-1,)]:
    try:
        value = match.group(*args)
    except Exception as error:
        print("error", repr(args), type(error).__name__, str(error))
    else:
        print("unexpected value", repr(args), repr(value))

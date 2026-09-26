import re

match = re.match(r"(?P<first>a)(?P<optional>b)?", "a")
assert match is not None


class GroupName(str):
    def __str__(self):
        return "optional"


print("str subclass", repr(match.group(GroupName("first"))))
print("str subclass multiple", repr(match.group(GroupName("first"), "optional")))
print("str subclass span", match.span(GroupName("first")))

for args in [(), (0,), ("first",), (1,), (2,), ("optional",), (0, "first", 2)]:
    print("group", repr(args), repr(match.group(*args)))

try:
    match.group(group=1)
except TypeError as error:
    print("keyword", type(error).__name__)
else:
    raise AssertionError("Match.group accepted a keyword argument")

print("span", match.span("first"))
print("optional span", match.span("optional"))
print("whole span", match.span())
print("numbered span", match.span(1))
try:
    match.span(3)
except IndexError as error:
    print("span error", type(error).__name__, str(error))
else:
    raise AssertionError("Match.span accepted an invalid group")
for args in [(3,), ("missing",), (-1,)]:
    try:
        value = match.group(*args)
    except Exception as error:
        print("error", repr(args), type(error).__name__, str(error))
    else:
        print("unexpected value", repr(args), repr(value))

edge = re.match(r"(?P<empty>)(?P<unicode>é)", "é")
assert edge is not None
print("edge", repr(edge.group("empty")), edge.group("unicode"))
print(
    "capture types",
    type(edge.group("empty")).__name__,
    type(edge.group("unicode")).__name__,
)

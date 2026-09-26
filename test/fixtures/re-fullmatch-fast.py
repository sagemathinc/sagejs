import re

pattern = re.compile(r"(?P<head>a).*?(?P<tail>c)")
for text, pos, endpos in [
    ("abc", 0, None),
    ("zabc", 1, 4),
    ("abcX", 0, 3),
    ("abcX", 0, 4),
    ("abc", 0, 2),
    ("abc", 2, 1),
]:
    match = (
        pattern.fullmatch(text, pos)
        if endpos is None
        else pattern.fullmatch(text, pos, endpos)
    )
    print(
        "case",
        repr(text),
        pos,
        endpos,
        None if match is None else (match.group(), match.group("head"), match.span()),
    )

optional = re.compile(r"(?P<first>a)(?P<second>b)?")
match = optional.fullmatch("a")
print("optional", match.group("first"), match.group("second"), match.span())
empty = re.compile(r".*").fullmatch("abc", 3)
print("empty", None if empty is None else (empty.group(), empty.span()))

"""CPython oracle for format replacement-field item and attribute lookup."""

assert "{k[0]} {vv}".format(k={0: "ab"}, vv="ab") == "ab ab"
assert "{0[1]} {named[0]}".format(["a", "b"], named=("c",)) == "b c"
assert "{0[word]}".format({"word": "value"}) == "value"
assert "{[0]} {[word]}".format(["first"], {"word": "second"}) == "first second"


class Entry:
    def __init__(self):
        self.values = {"label": ["mixed"]}


assert "{0[0].values[label][0]}".format([Entry()]) == "mixed"
assert "{.values[label][0]}".format(Entry()) == "mixed"


class Indexed:
    def __getitem__(self, key):
        return "number" if isinstance(key, int) else "text"


assert "{0[01]} {0[-1]}".format(Indexed()) == "number text"
for template, value, error in (
    ("{0[missing]}", {}, KeyError),
    ("{0[1]}", [], IndexError),
):
    try:
        template.format(value)
    except error:
        pass
    else:
        raise AssertionError("item lookup must preserve Python exceptions")

print("python-format-field-index-ok")

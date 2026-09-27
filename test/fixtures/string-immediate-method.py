text = "a,b,c"
print("split", text.split(","), text.split(",", 1))
for sample, separator_text in (
    ("", "."),
    (".a.", "."),
    ("a::b::::", "::"),
    ("α😀β😀", "😀"),
):
    parts = sample.split(separator_text)
    parts.append("extra")
    print("unlimited", repr(sample), parts, type(parts).__name__)
print("limited", "a::b::c".split("::", 0), "a::b::c".split("::", 1))
print("keyword", text.split(sep=",", maxsplit=1))
print("other", text.rsplit(",", 1), text.replace(",", ";"), text.upper())

saved = text.split
print("saved", saved(","), saved(sep=",", maxsplit=1))

events = []


def receiver():
    events.append("receiver")
    return text


def separator():
    events.append("argument")
    return ","


print("order", receiver().split(separator()), events)

events.clear()
try:
    receiver().missing(separator())
except AttributeError:
    print("missing", events)


class HookedString(str):
    def __getattribute__(self, name):
        if name == "split":
            return lambda separator: ["hook", separator]
        return super().__getattribute__(name)


print("hook", HookedString("a,b").split(","))

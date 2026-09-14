events = []


class Mapping:
    def keys(self):
        events.append("keys")
        return ["value"]

    def __getitem__(self, key):
        events.append("item")
        return 2


def target(**keywords):
    events.append("body")


try:
    target(value=1, **Mapping())
except TypeError:
    pass
else:
    assert False
print(events)
assert events == ["keys"]

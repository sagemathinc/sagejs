events = []


class Arguments:
    def __iter__(self):
        events.append("iterate")
        return iter([1])


def keyword():
    events.append("keyword")
    return 2


def target(positional, *, value):
    return positional + value


assert target(*Arguments(), value=keyword()) == 3
print(events)
assert events == ["keyword", "iterate"]

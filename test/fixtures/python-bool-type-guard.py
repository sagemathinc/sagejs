print("primitive", [bool(value) for value in (None, False, True, 0, 1, "", "x")])
print("sequences", [bool(value) for value in ([], [1], (), (1,))])

events = []


class Both:
    def __bool__(self):
        events.append("bool")
        return False

    def __len__(self):
        events.append("len")
        return 2


class Sized:
    def __len__(self):
        return 0


class BadBool:
    def __bool__(self):
        return 1


class BadLength:
    def __len__(self):
        return -1


print("methods", bool(Both()), events, bool(Sized()))
print("function", bool(lambda: None))
for value in (BadBool(), BadLength()):
    try:
        bool(value)
    except (TypeError, ValueError) as error:
        print("invalid", type(error).__name__)

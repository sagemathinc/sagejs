class ExhaustedWithValue:
    def __iter__(self):
        return self

    def __next__(self):
        raise StopIteration("done")


print("valued stop", list(map(lambda value: value, ExhaustedWithValue())))
print("none", list(map(lambda value: value, [None, 2])))

calls = []


def combine(left, right):
    calls.append((left, right))
    return left + right


print("shortest", list(map(combine, [1, 2, 3], [10])), calls)


def generator():
    yield 5
    return "done"


print("generator return", list(map(lambda value: value, generator())))

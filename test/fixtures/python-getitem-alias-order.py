values = [11, 13, 17, 19]
frozen = tuple(values)
print("list indices", values[0], values[-1], values[True], values[False])
print("tuple indices", frozen[2], frozen[-2])


class Indexed:
    def __getitem__(self, key):
        return ("custom", key)


print("custom", Indexed()[2])
print("aliases", list[int].__origin__ is list, tuple[int].__origin__ is tuple)
print("alias args", list[int].__args__[0] is int)

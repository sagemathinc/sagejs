import time


class Truth:
    def __init__(self, answer):
        self.answer = answer

    def __bool__(self):
        return self.answer


class Length:
    def __init__(self, answer):
        self.answer = answer

    def __len__(self):
        return self.answer


truth_left = Truth(True)
truth_right = Truth(False)
length_left = Length(1)
length_right = Length(0)


def probe(mode, kind, count):
    # Resolve and allocate operands outside the measured region.
    if kind == "boolean":
        left, right = True, False
    elif kind == "number":
        left, right = 7, 0
    elif kind == "string":
        left, right = "value", ""
    elif kind == "list":
        left, right = [0], []
    elif kind == "custom-bool":
        left, right = truth_left, truth_right
    else:
        left, right = length_left, length_right
    truth = bool
    total = 0
    if mode == "explicit":
        started = time.perf_counter()
        for index in range(count):
            total += truth(left)
            total += truth(right)
            total += truth(left)
            total += truth(right)
    else:
        started = time.perf_counter()
        for index in range(count):
            if left:
                total += 1
            if right:
                total += 1
            if left:
                total += 1
            if right:
                total += 1
    return time.perf_counter() - started, total

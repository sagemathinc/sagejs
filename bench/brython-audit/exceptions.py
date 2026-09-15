import json
import time


def identity(value):
    return value


def normal_call():
    total = 0
    for i in range(10000):
        total += identity(1)
    return total


def construct():
    total = 0
    for i in range(10000):
        error = ValueError("probe")
        total += len(error.args)
    return total


def binding_failure():
    total = 0
    for i in range(10000):
        try:
            identity()
        except TypeError:
            total += 1
    return total


def raise_catch():
    total = 0
    for i in range(10000):
        try:
            raise ValueError("probe")
        except Exception:
            total += 1
    return total


audit_results = []
for name, function in [
    ("normal_call", normal_call),
    ("construct", construct),
    ("binding_failure", binding_failure),
    ("raise_catch", raise_catch),
]:
    samples = []
    for iteration in range(5):
        start = time.perf_counter()
        result = function()
        samples.append(time.perf_counter() - start)
        assert result == 10000
    audit_results.append({"name": name, "seconds": samples})
print(json.dumps(audit_results))

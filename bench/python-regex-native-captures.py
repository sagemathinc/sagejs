"""Compare regex capture reads and match creation with retained checksums."""

import re
import time


pattern = re.compile(r"(?P<word>[a-z]+)(?P<number>\d+)")
match = pattern.fullmatch("abc123")
assert match is not None
iterations = 20_000


def numeric_group(count):
    checksum = 0
    for _ in range(count):
        checksum += len(match.group(1))
    return checksum


def named_group(count):
    checksum = 0
    for _ in range(count):
        checksum += len(match.group("word"))
    return checksum


def all_groups(count):
    checksum = 0
    for _ in range(count):
        checksum += len(match.groups()[0])
    return checksum


def capture_span(count):
    checksum = 0
    for _ in range(count):
        checksum += match.end(1) - match.start(1)
    return checksum


def fullmatch_creation(count):
    checksum = 0
    for _ in range(count):
        result = pattern.fullmatch("abc123")
        checksum += result.lastindex
    return checksum


for name, function, expected in (
    ("numeric_group", numeric_group, 3),
    ("named_group", named_group, 3),
    ("all_groups", all_groups, 3),
    ("capture_span", capture_span, 3),
    ("fullmatch_creation", fullmatch_creation, 2),
):
    assert function(1_000) == expected * 1_000
    samples = []
    for _ in range(5):
        started = time.perf_counter()
        checksum = function(iterations)
        samples.append((time.perf_counter() - started) * 1_000)
        assert checksum == expected * iterations
    samples.sort()
    print(name, round(samples[2], 3), checksum)

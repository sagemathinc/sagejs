"""Immutable fact-only packed-container optimizer calibration control."""


def packed_container_control(values, output):
    checksum = 0
    for index in range(len(values)):
        output[index] = values[index] * -17 + 23
        checksum = checksum + output[index]
    return checksum, output[0], output[-1]


def __profile_run__():
    values = tuple((index * 31 - 17) % 257 for index in range(100_000))
    output = [0 for _index in range(len(values))]
    result = (0, 0, 0)
    for _repeat in range(10):
        result = packed_container_control(values, output)
    return result

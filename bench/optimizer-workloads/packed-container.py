"""Immutable fact-only packed-container optimizer calibration control."""


def packed_container_control(values, output):
    checksum = 0
    for index in range(len(values)):
        output[index] = values[index] * -17 + 23
        checksum = checksum + output[index]
    return checksum, output[0], output[-1]

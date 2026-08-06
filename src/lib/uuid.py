"""UUID generation and compact URL-safe UUID helpers."""

import os

from encodings import hexlify, urlsafe_b64decode, urlsafe_b64encode


RFC_4122 = 1


class UUID:
    def __init__(self, *, bytes=None, hex=None, version=None):
        if bytes is None:
            if hex is None:
                raise TypeError('one of bytes or hex is required')
            bytes = bytearray.fromhex(str(hex).replace('-', ''))
        self.bytes = bytes
        self.hex = hexlify(bytes)
        self.variant = RFC_4122
        self.version = version if version is not None else ((bytes[6] >> 4) & 15)

    def __str__(self):
        value = self.hex
        return (value[:8] + '-' + value[8:12] + '-' + value[12:16]
                + '-' + value[16:20] + '-' + value[20:])

    def __repr__(self):
        return "UUID('" + str(self) + "')"


def random_bytes(num=16):
    return bytearray(os.urandom(num))


def uuid4_bytes():
    data = random_bytes(16)
    data[6] = 0x40 | (data[6] & 0x0f)
    data[8] = 0x80 | (data[8] & 0x3f)
    return data


def uuid4():
    return UUID(bytes=uuid4_bytes(), version=4)


def short_uuid():
    return urlsafe_b64encode(random_bytes(16), '')


def short_uuid4():
    return urlsafe_b64encode(uuid4_bytes(), '')


def decode_short_uuid(value):
    return urlsafe_b64decode(str(value))


def num_to_string(numbers, alphabet, pad_to_length=None):
    """Encode a non-negative big-endian byte sequence in *alphabet*."""
    base = len(alphabet)
    value = 0
    for item in numbers:
        value = value * 256 + int(item)
    answer = ''
    while value:
        value, remainder = divmod(value, base)
        answer = alphabet[remainder] + answer
    if not answer:
        answer = alphabet[0]
    if pad_to_length is not None:
        answer = answer.rjust(pad_to_length, alphabet[0])
    return answer

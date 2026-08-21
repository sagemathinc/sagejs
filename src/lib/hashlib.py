"""Common cryptographic hashes backed by the host crypto capability.

SHA-256 additionally has an ordinary-Python implementation for synchronous
browser execution. Web Crypto is asynchronous, so it cannot implement the
synchronous `hashlib` API without blocking facilities that are unavailable in
non-isolated browsers and mobile WebViews.
"""

import os
import sagejs.runtime as runtime


algorithms_guaranteed = {
    "md5",
    "sha1",
    "sha224",
    "sha256",
    "sha384",
    "sha512",
    "blake2b",
    "blake2s",
    "sha3_224",
    "sha3_256",
    "sha3_384",
    "sha3_512",
    "shake_128",
    "shake_256",
}
algorithms_available = set(algorithms_guaranteed)


_SIZES = {
    "md5": 16,
    "sha1": 20,
    "sha224": 28,
    "sha256": 32,
    "sha384": 48,
    "sha512": 64,
    "blake2b": 64,
    "blake2s": 32,
    "sha3_224": 28,
    "sha3_256": 32,
    "sha3_384": 48,
    "sha3_512": 64,
    "shake_128": 0,
    "shake_256": 0,
}


_BLOCK_SIZES = {
    "md5": 64,
    "sha1": 64,
    "sha224": 64,
    "sha256": 64,
    "sha384": 128,
    "sha512": 128,
    "blake2b": 128,
    "blake2s": 64,
    "sha3_224": 144,
    "sha3_256": 136,
    "sha3_384": 104,
    "sha3_512": 72,
    "shake_128": 168,
    "shake_256": 136,
}


_SHA256_INITIAL = (
    0x6A09E667,
    0xBB67AE85,
    0x3C6EF372,
    0xA54FF53A,
    0x510E527F,
    0x9B05688C,
    0x1F83D9AB,
    0x5BE0CD19,
)


_SHA256_CONSTANTS = (
    0x428A2F98,
    0x71374491,
    0xB5C0FBCF,
    0xE9B5DBA5,
    0x3956C25B,
    0x59F111F1,
    0x923F82A4,
    0xAB1C5ED5,
    0xD807AA98,
    0x12835B01,
    0x243185BE,
    0x550C7DC3,
    0x72BE5D74,
    0x80DEB1FE,
    0x9BDC06A7,
    0xC19BF174,
    0xE49B69C1,
    0xEFBE4786,
    0x0FC19DC6,
    0x240CA1CC,
    0x2DE92C6F,
    0x4A7484AA,
    0x5CB0A9DC,
    0x76F988DA,
    0x983E5152,
    0xA831C66D,
    0xB00327C8,
    0xBF597FC7,
    0xC6E00BF3,
    0xD5A79147,
    0x06CA6351,
    0x14292967,
    0x27B70A85,
    0x2E1B2138,
    0x4D2C6DFC,
    0x53380D13,
    0x650A7354,
    0x766A0ABB,
    0x81C2C92E,
    0x92722C85,
    0xA2BFE8A1,
    0xA81A664B,
    0xC24B8B70,
    0xC76C51A3,
    0xD192E819,
    0xD6990624,
    0xF40E3585,
    0x106AA070,
    0x19A4C116,
    0x1E376C08,
    0x2748774C,
    0x34B0BCB5,
    0x391C0CB3,
    0x4ED8AA4A,
    0x5B9CCA4F,
    0x682E6FF3,
    0x748F82EE,
    0x78A5636F,
    0x84C87814,
    0x8CC70208,
    0x90BEFFFA,
    0xA4506CEB,
    0xBEF9A3F7,
    0xC67178F2,
)


def _rotate_right_32(value, count):
    return ((value >> count) | (value << (32 - count))) & 0xFFFFFFFF


def _portable_sha256(data):
    """Return the SHA-256 digest of bytes using FIPS 180-4 operations."""
    message = list(bytes(data))
    bit_length = len(message) * 8
    message.append(0x80)
    while len(message) % 64 != 56:
        message.append(0)
    for shift in range(56, -1, -8):
        message.append((bit_length >> shift) & 0xFF)

    state = list(_SHA256_INITIAL)
    for offset in range(0, len(message), 64):
        words = []
        for index in range(16):
            start = offset + 4 * index
            words.append(
                (message[start] << 24)
                | (message[start + 1] << 16)
                | (message[start + 2] << 8)
                | message[start + 3]
            )
        for index in range(16, 64):
            previous_15 = words[index - 15]
            previous_2 = words[index - 2]
            sigma0 = (
                _rotate_right_32(previous_15, 7)
                ^ _rotate_right_32(previous_15, 18)
                ^ (previous_15 >> 3)
            )
            sigma1 = (
                _rotate_right_32(previous_2, 17)
                ^ _rotate_right_32(previous_2, 19)
                ^ (previous_2 >> 10)
            )
            words.append(
                (words[index - 16] + sigma0 + words[index - 7] + sigma1) & 0xFFFFFFFF
            )

        a, b, c, d, e, f, g, h = state
        for index in range(64):
            sum1 = (
                _rotate_right_32(e, 6)
                ^ _rotate_right_32(e, 11)
                ^ _rotate_right_32(e, 25)
            )
            choice = (e & f) ^ ((~e) & g)
            temporary1 = (
                h + sum1 + choice + _SHA256_CONSTANTS[index] + words[index]
            ) & 0xFFFFFFFF
            sum0 = (
                _rotate_right_32(a, 2)
                ^ _rotate_right_32(a, 13)
                ^ _rotate_right_32(a, 22)
            )
            majority = (a & b) ^ (a & c) ^ (b & c)
            temporary2 = (sum0 + majority) & 0xFFFFFFFF
            h, g, f, e, d, c, b, a = (
                g,
                f,
                e,
                (d + temporary1) & 0xFFFFFFFF,
                c,
                b,
                a,
                (temporary1 + temporary2) & 0xFFFFFFFF,
            )
        state = [
            (left + right) & 0xFFFFFFFF
            for left, right in zip(state, (a, b, c, d, e, f, g, h))
        ]

    digest = []
    for value in state:
        digest.extend(
            [
                (value >> 24) & 0xFF,
                (value >> 16) & 0xFF,
                (value >> 8) & 0xFF,
                value & 0xFF,
            ]
        )
    return bytes(digest)


class _Hash:
    def __init__(self, name, data=b""):
        self.name = name.lower().replace("-", "_")
        if self.name not in algorithms_guaranteed:
            raise ValueError("unsupported hash type " + name)
        self.digest_size = _SIZES[self.name]
        self.block_size = _BLOCK_SIZES[self.name]
        self._parts = []
        if data:
            self.update(data)

    def update(self, data):
        self._parts.append(bytes(data))

    def copy(self):
        answer = _Hash(self.name)
        answer._parts = list(self._parts)
        return answer

    def digest(self, length=None):
        is_shake = self.name in ("shake_128", "shake_256")
        if is_shake and length is None:
            raise TypeError("digest() missing required argument: length")
        if not is_shake and length is not None:
            raise TypeError("digest() takes no arguments")
        values = [
            "hashData",
            self.name,
            list(b"".join(self._parts)),
        ]
        if length is not None:
            values.append(length)
        try:
            return bytes(os._host_call(*values))
        except OSError as error:
            if self.name != "sha256" or error.errno != 38:
                raise
            return _portable_sha256(b"".join(self._parts))

    def hexdigest(self, length=None):
        data = self.digest(length) if length is not None else self.digest()
        digits = "0123456789abcdef"
        answer = ""
        for byte in data:
            answer += digits[byte >> 4] + digits[byte & 15]
        return answer


def _new(name, data=b"", **_keywords):
    return _Hash(name, data)


def md5(data=b"", **_keywords):
    return _Hash("md5", data)


def sha1(data=b"", **_keywords):
    return _Hash("sha1", data)


def sha224(data=b"", **_keywords):
    return _Hash("sha224", data)


def sha256(data=b"", **_keywords):
    return _Hash("sha256", data)


def sha384(data=b"", **_keywords):
    return _Hash("sha384", data)


def sha512(data=b"", **_keywords):
    return _Hash("sha512", data)


def blake2b(data=b"", **_keywords):
    if _keywords:
        raise NotImplementedError("keyed and parameterized BLAKE2 is not supported")
    return _Hash("blake2b", data)


def blake2s(data=b"", **_keywords):
    if _keywords:
        raise NotImplementedError("keyed and parameterized BLAKE2 is not supported")
    return _Hash("blake2s", data)


def sha3_224(data=b"", **_keywords):
    return _Hash("sha3_224", data)


def sha3_256(data=b"", **_keywords):
    return _Hash("sha3_256", data)


def sha3_384(data=b"", **_keywords):
    return _Hash("sha3_384", data)


def sha3_512(data=b"", **_keywords):
    return _Hash("sha3_512", data)


def shake_128(data=b"", **_keywords):
    return _Hash("shake_128", data)


def shake_256(data=b"", **_keywords):
    return _Hash("shake_256", data)


def file_digest(fileobj, digest):
    result = _new(digest) if isinstance(digest, str) else digest()
    while True:
        block = fileobj.read(262144)
        if block == b"":
            break
        result.update(block)
    return result


# ``new`` is a Python identifier but a legacy Sage.js tokenizer keyword.
# Publish it dynamically until that compiler extension can be retired.
runtime.reflect.set(runtime.reflect.get(runtime.modules, "hashlib"), "new", _new)

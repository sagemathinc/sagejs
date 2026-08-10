"""Common cryptographic hashes backed by the host crypto capability."""

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
        return bytes(os._host_call(*values))

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

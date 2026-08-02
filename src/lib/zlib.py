"""Portable Python interface to the host's DEFLATE implementation."""

import os


DEFLATED = 8
DEF_MEM_LEVEL = 8
MAX_WBITS = 15
Z_BEST_SPEED = 1
Z_BEST_COMPRESSION = 9
Z_DEFAULT_COMPRESSION = -1
Z_DEFAULT_STRATEGY = 0
Z_FILTERED = 1
Z_HUFFMAN_ONLY = 2
Z_RLE = 3
Z_FIXED = 4
Z_NO_FLUSH = 0
Z_SYNC_FLUSH = 2
Z_FULL_FLUSH = 3
Z_FINISH = 4
Z_BLOCK = 5
Z_TREES = 6
ZLIB_VERSION = '1.3'
ZLIB_RUNTIME_VERSION = ZLIB_VERSION


class error(Exception):
    pass


def _format(wbits):
    if wbits < 0:
        return 'deflateRaw'
    if wbits > MAX_WBITS:
        return 'gzip'
    return 'deflate'


def compress(data, level=-1, wbits=MAX_WBITS):
    try:
        return bytes(os._host_call(
            'compressData', _format(wbits), list(bytes(data)), level))
    except OSError as exception:
        raise error(str(exception))


def decompress(data, wbits=MAX_WBITS, bufsize=16384):
    del bufsize
    try:
        return bytes(os._host_call(
            'decompressData', _format(wbits), list(bytes(data))))
    except OSError as exception:
        raise error(str(exception))


def adler32(data, value=1):
    first = value & 65535
    second = (value >> 16) & 65535
    for byte in bytes(data):
        first = (first + byte) % 65521
        second = (second + first) % 65521
    return ((second << 16) | first) & 4294967295


_CRC_TABLE = None


def _crc_table():
    global _CRC_TABLE
    if _CRC_TABLE is None:
        _CRC_TABLE = []
        for number in range(256):
            value = number
            for _bit in range(8):
                if value & 1:
                    value = 3988292384 ^ (value >> 1)
                else:
                    value >>= 1
            _CRC_TABLE.append(value)
    return _CRC_TABLE


def crc32(data, value=0):
    value ^= 4294967295
    table = _crc_table()
    for byte in bytes(data):
        value = table[(value ^ byte) & 255] ^ (value >> 8)
    return (value ^ 4294967295) & 4294967295


class _Compress:
    def __init__(self, level, wbits):
        self.level = level
        self.wbits = wbits
        self._parts = []
        self._finished = False

    def compress(self, data):
        if self._finished:
            raise error('inconsistent stream state')
        self._parts.append(bytes(data))
        return b''

    def flush(self, mode=Z_FINISH):
        if self._finished:
            return b''
        if mode != Z_FINISH:
            return b''
        self._finished = True
        return compress(b''.join(self._parts), self.level, self.wbits)

    def copy(self):
        answer = _Compress(self.level, self.wbits)
        answer._parts = list(self._parts)
        return answer


class _Decompress:
    def __init__(self, wbits):
        self.wbits = wbits
        self._parts = []
        self.unused_data = b''
        self.unconsumed_tail = b''
        self.eof = False

    def decompress(self, data, max_length=0):
        self._parts.append(bytes(data))
        if max_length:
            return b''
        return b''

    def flush(self, length=16384):
        del length
        if self.eof:
            return b''
        self.eof = True
        return decompress(b''.join(self._parts), self.wbits)

    def copy(self):
        answer = _Decompress(self.wbits)
        answer._parts = list(self._parts)
        return answer


def compressobj(
    level=-1,
    method=DEFLATED,
    wbits=MAX_WBITS,
    memLevel=DEF_MEM_LEVEL,
    strategy=Z_DEFAULT_STRATEGY,
    zdict=None,
):
    del method, memLevel, strategy
    if zdict is not None:
        raise NotImplementedError('zdict is not supported')
    return _Compress(level, wbits)


def decompressobj(wbits=MAX_WBITS, zdict=b''):
    if zdict:
        raise NotImplementedError('zdict is not supported')
    return _Decompress(wbits)


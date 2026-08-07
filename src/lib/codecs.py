"""Essential text-codec helpers backed by Sage.js string primitives."""

import builtins


BOM_UTF8 = b'\xef\xbb\xbf'


def _normalize(encoding):
    return encoding.replace('_', '-').lower()


def getencoder(encoding):
    encoding = _normalize(encoding)

    def encode(value, errors='strict'):
        data = value.encode(encoding, errors)
        return data, len(value)
    return encode


def getdecoder(encoding):
    encoding = _normalize(encoding)

    def decode(value, errors='strict'):
        text = bytes(value).decode(encoding, errors)
        return text, len(value)
    return decode


class StreamWriter:
    def __init__(self, stream, errors='strict'):
        self.stream = stream
        self.errors = errors
        self.encoding = 'utf-8'

    def write(self, value):
        return self.stream.write(value.encode(self.encoding, self.errors))

    def writelines(self, values):
        for value in values:
            self.write(value)

    def __getattr__(self, name):
        return getattr(self.stream, name)


class StreamReader:
    def __init__(self, stream, errors='strict'):
        self.stream = stream
        self.errors = errors
        self.encoding = 'utf-8'

    def read(self, size=-1):
        return self.stream.read(size).decode(self.encoding, self.errors)

    def readline(self, size=-1):
        return self.stream.readline(size).decode(self.encoding, self.errors)

    def __getattr__(self, name):
        return getattr(self.stream, name)


def lookup(encoding):
    normalized = _normalize(encoding)
    encoder = getencoder(normalized)
    decoder = getdecoder(normalized)

    class Writer(StreamWriter):
        def __init__(self, stream, errors='strict'):
            StreamWriter.__init__(self, stream, errors)
            self.encoding = normalized

    class Reader(StreamReader):
        def __init__(self, stream, errors='strict'):
            StreamReader.__init__(self, stream, errors)
            self.encoding = normalized

    return encoder, decoder, Reader, Writer


def getwriter(encoding):
    return lookup(encoding)[3]


def getreader(encoding):
    return lookup(encoding)[2]


def open(filename, mode='r', encoding=None, errors='strict', buffering=-1):
    del buffering
    return builtins.open(
        filename, mode, encoding=encoding, errors=errors)

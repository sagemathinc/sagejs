"""Gzip compression and whole-file streams backed by the host runtime."""

import os
import builtins


READ = 1
WRITE = 2


def compress(data, compresslevel=9, *, mtime=0):
    del mtime
    return bytes(
        os._host_call("compressData", "gzip", list(bytes(data)), compresslevel)
    )


def decompress(data):
    return bytes(os._host_call("decompressData", "gzip", list(bytes(data))))


class BadGzipFile(OSError):
    pass


class GzipFile:
    def __init__(
        self,
        filename=None,
        mode=None,
        compresslevel=9,
        fileobj=None,
        mtime=None,
    ):
        del mtime
        if mode is None:
            mode = getattr(fileobj, "mode", "rb") if fileobj is not None else "rb"
        mode = mode.replace("t", "")
        if "b" not in mode:
            mode += "b"
        self.mode = mode
        self.name = filename if filename is not None else getattr(fileobj, "name", "")
        self.closed = False
        self._level = compresslevel
        self._position = 0
        self._fileobj = fileobj
        self._owns_file = fileobj is None
        self._readable = mode[0] == "r" or "+" in mode
        self._writable = mode[0] in "wax" or "+" in mode
        if fileobj is None:
            if filename is None:
                raise TypeError("filename or fileobj must be provided")
            if mode[0] == "r":
                fileobj = builtins.open(filename, "rb")
            elif mode[0] == "x":
                fileobj = builtins.open(filename, "xb")
            elif mode[0] == "w":
                fileobj = builtins.open(filename, "wb")
            else:
                try:
                    fileobj = builtins.open(filename, "rb")
                except FileNotFoundError:
                    fileobj = builtins.open(filename, "wb")
            self._fileobj = fileobj
        if mode[0] in "ra" and self._fileobj is not None:
            packed = self._fileobj.read()
            if packed:
                try:
                    self._data = decompress(packed)
                except OSError as exception:
                    raise BadGzipFile(str(exception))
            else:
                self._data = b""
        else:
            self._data = b""
        if mode[0] == "a":
            self._position = len(self._data)

    def _check(self):
        if self.closed:
            raise ValueError("I/O operation on closed file")

    def __enter__(self):
        self._check()
        return self

    def __exit__(self, *_arguments):
        self.close()
        return False

    def __iter__(self):
        return self

    def __next__(self):
        line = self.readline()
        if line == b"":
            raise StopIteration
        return line

    def readable(self):
        return self._readable

    def writable(self):
        return self._writable

    def seekable(self):
        return True

    def tell(self):
        self._check()
        return self._position

    def seek(self, offset, whence=0):
        self._check()
        if whence == 0:
            position = offset
        elif whence == 1:
            position = self._position + offset
        elif whence == 2:
            position = len(self._data) + offset
        else:
            raise ValueError("invalid whence")
        if position < 0:
            raise ValueError("negative seek position")
        self._position = position
        return position

    def read(self, size=-1):
        self._check()
        if not self._readable:
            raise OSError("read() on write-only GzipFile object")
        end = (
            len(self._data)
            if size is None or size < 0
            else min(len(self._data), self._position + size)
        )
        answer = self._data[self._position : end]
        self._position = end
        return answer

    def readline(self, size=-1):
        self._check()
        end = self._data.find(b"\n", self._position)
        end = len(self._data) if end < 0 else end + 1
        if size is not None and size >= 0:
            end = min(end, self._position + size)
        answer = self._data[self._position : end]
        self._position = end
        return answer

    def write(self, data):
        self._check()
        if not self._writable:
            raise OSError("write() on read-only GzipFile object")
        data = bytes(data)
        if self.mode[0] == "a":
            self._position = len(self._data)
        end = self._position + len(data)
        suffix = self._data[end:] if end < len(self._data) else b""
        self._data = self._data[: self._position] + data + suffix
        self._position = end
        return len(data)

    def flush(self, zlib_mode=None):
        del zlib_mode
        self._check()

    def close(self):
        if self.closed:
            return
        if self._writable and self._fileobj is not None:
            self._fileobj.seek(0)
            self._fileobj.write(compress(self._data, self._level))
            self._fileobj.truncate()
            self._fileobj.flush()
        if self._owns_file and self._fileobj is not None:
            self._fileobj.close()
        self.closed = True


class _TextGzipFile:
    def __init__(self, binary, encoding, errors, newline):
        self.buffer = binary
        self.name = binary.name
        self.mode = binary.mode.replace("b", "t")
        self.encoding = encoding
        self.errors = errors
        self.newlines = None
        self._newline = newline
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *_arguments):
        self.close()
        return False

    def __iter__(self):
        return self

    def __next__(self):
        line = self.readline()
        if line == "":
            raise StopIteration
        return line

    def read(self, size=-1):
        return self.buffer.read(size).decode(self.encoding, self.errors)

    def readline(self, size=-1):
        return self.buffer.readline(size).decode(self.encoding, self.errors)

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError("write() argument must be str")
        return self.buffer.write(text.encode(self.encoding, self.errors))

    def tell(self):
        return self.buffer.tell()

    def seek(self, offset, whence=0):
        return self.buffer.seek(offset, whence)

    def flush(self):
        return self.buffer.flush()

    def close(self):
        self.buffer.close()
        self.closed = True


def open(
    filename,
    mode="rb",
    compresslevel=9,
    encoding=None,
    errors=None,
    newline=None,
):
    text = "t" in mode
    if text and "b" in mode:
        raise ValueError("Invalid mode: '" + mode + "'")
    if not text and any(value is not None for value in (encoding, errors, newline)):
        raise ValueError("Argument only valid in text mode")
    binary_mode = mode.replace("t", "")
    if "b" not in binary_mode:
        binary_mode += "b"
    binary = GzipFile(filename, binary_mode, compresslevel)
    if not text:
        return binary
    return _TextGzipFile(
        binary,
        "utf8" if encoding is None else encoding,
        "strict" if errors is None else errors,
        newline,
    )

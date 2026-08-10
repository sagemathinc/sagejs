"""In-memory text and binary streams, plus the host-backed `open`.

This is the portable core of Python's :mod:`io` interface.  The built-in
`open` uses an embedding-provided filesystem capability and is re-exported
here just as it is by CPython's :mod:`io` module.
"""

import builtins


open = builtins.open


class UnsupportedOperation(OSError):
    pass


class _WindowsConsoleIO:
    pass


class IOBase:
    def __init__(self):
        self.closed = False

    def _check_open(self):
        if self.closed:
            raise ValueError("I/O operation on closed file")

    def close(self):
        self.closed = True

    def flush(self):
        self._check_open()

    def readable(self):
        self._check_open()
        return False

    def writable(self):
        self._check_open()
        return False

    def seekable(self):
        self._check_open()
        return False

    def isatty(self):
        self._check_open()
        return False

    def __enter__(self):
        self._check_open()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()

    def __iter__(self):
        return self

    def __next__(self):
        line = self.readline()
        if line == "" or line == b"":
            raise StopIteration
        return line

    def readlines(self, hint=-1):
        self._check_open()
        answer = []
        total = 0
        for line in self:
            answer.append(line)
            total += len(line)
            if hint > 0 and total >= hint:
                break
        return answer

    def writelines(self, lines):
        self._check_open()
        for line in lines:
            self.write(line)


class StringIO(IOBase):
    def __init__(self, initial_value="", newline="\n"):
        IOBase.__init__(self)
        if not isinstance(initial_value, str):
            raise TypeError("initial_value must be str or None")
        if newline not in (None, "", "\n", "\r", "\r\n"):
            raise ValueError("illegal newline value: " + repr(newline))
        self._newline = newline
        self.newlines = None
        self._value = self._translated(initial_value)
        self._position = 0

    def _translated(self, text):
        if self._newline is None:
            had_cr = "\r" in text.replace("\r\n", "")
            had_lf = "\n" in text.replace("\r\n", "")
            had_crlf = "\r\n" in text
            values = []
            if had_cr:
                values.append("\r")
            if had_lf:
                values.append("\n")
            if had_crlf:
                values.append("\r\n")
            if len(values) == 1:
                self.newlines = values[0]
            elif len(values) > 1:
                self.newlines = tuple(values)
            return text.replace("\r\n", "\n").replace("\r", "\n")
        if self._newline not in ("", "\n"):
            return text.replace("\n", self._newline)
        return text

    def readable(self):
        self._check_open()
        return True

    def writable(self):
        self._check_open()
        return True

    def seekable(self):
        self._check_open()
        return True

    def getvalue(self):
        self._check_open()
        return self._value

    def tell(self):
        self._check_open()
        return self._position

    def seek(self, offset, whence=0):
        self._check_open()
        if whence == 0:
            position = offset
        elif whence == 1:
            position = self._position + offset
        elif whence == 2:
            position = len(self._value) + offset
        else:
            raise ValueError("invalid whence")
        if position < 0:
            raise ValueError("negative seek position")
        self._position = position
        return position

    def read(self, size=-1):
        self._check_open()
        if size is None or size < 0:
            end = len(self._value)
        else:
            end = min(len(self._value), self._position + size)
        answer = self._value[self._position : end]
        self._position = end
        return answer

    def readline(self, size=-1):
        self._check_open()
        if self._position >= len(self._value):
            return ""
        newline = self._value.find("\n", self._position)
        end = len(self._value) if newline < 0 else newline + 1
        if size is not None and size >= 0:
            end = min(end, self._position + size)
        answer = self._value[self._position : end]
        self._position = end
        return answer

    def write(self, text):
        self._check_open()
        if not isinstance(text, str):
            raise TypeError("string argument expected")
        text = self._translated(text)
        if self._position > len(self._value):
            self._value += "\x00" * (self._position - len(self._value))
        end = self._position + len(text)
        suffix = self._value[end:] if end < len(self._value) else ""
        self._value = self._value[: self._position] + text + suffix
        self._position = end
        return len(text)

    def truncate(self, size=None):
        self._check_open()
        if size is None:
            size = self._position
        if size < 0:
            raise ValueError("negative size value")
        if size < len(self._value):
            self._value = self._value[:size]
        return size


class BytesIO(IOBase):
    def __init__(self, initial_bytes=b""):
        IOBase.__init__(self)
        self._value = bytearray(initial_bytes)
        self._position = 0

    def getvalue(self):
        self._check_open()
        return bytes(self._value)

    def readable(self):
        self._check_open()
        return True

    def writable(self):
        self._check_open()
        return True

    def seekable(self):
        self._check_open()
        return True

    def read1(self, size=-1):
        return self.read(size)

    def readinto1(self, buffer):
        return self.readinto(buffer)

    def tell(self):
        self._check_open()
        return self._position

    def seek(self, offset, whence=0):
        self._check_open()
        if whence == 0:
            position = offset
        elif whence == 1:
            position = self._position + offset
        elif whence == 2:
            position = len(self._value) + offset
        else:
            raise ValueError("invalid whence")
        if position < 0:
            raise ValueError("negative seek position")
        self._position = position
        return position

    def read(self, size=-1):
        self._check_open()
        if size is None or size < 0:
            end = len(self._value)
        else:
            end = min(len(self._value), self._position + size)
        answer = bytes(self._value[self._position : end])
        self._position = end
        return answer

    def readline(self, size=-1):
        self._check_open()
        end = len(self._value)
        position = self._position
        while position < end:
            position += 1
            if self._value[position - 1] == 10:
                end = position
                break
        if size is not None and size >= 0:
            end = min(end, self._position + size)
        answer = bytes(self._value[self._position : end])
        self._position = end
        return answer

    def write(self, data):
        self._check_open()
        if not isinstance(data, (bytes, bytearray, memoryview)):
            raise TypeError("a bytes-like object is required")
        data = bytes(data)
        while len(self._value) < self._position:
            self._value.append(0)
        end = self._position + len(data)
        if end > len(self._value):
            self._value.extend(b"\x00" * (end - len(self._value)))
        for index in range(len(data)):
            self._value[self._position + index] = data[index]
        self._position = end
        return len(data)

    def readinto(self, buffer):
        self._check_open()
        count = min(len(buffer), len(self._value) - self._position)
        for index in range(count):
            buffer[index] = self._value[self._position + index]
        self._position += count
        return count

    def truncate(self, size=None):
        self._check_open()
        if size is None:
            size = self._position
        if size < 0:
            raise ValueError("negative size value")
        if size < len(self._value):
            del self._value[size:]
        return size


class TextIOWrapper(IOBase):
    """Encode and decode text over a binary stream."""

    def __init__(
        self,
        buffer,
        encoding="utf-8",
        errors="strict",
        newline=None,
        line_buffering=False,
        write_through=False,
    ):
        IOBase.__init__(self)
        self.buffer = buffer
        self.encoding = encoding
        self.errors = errors
        self.newlines = None
        self._newline = newline
        self.line_buffering = line_buffering
        self.write_through = write_through

    def readable(self):
        return self.buffer.readable()

    def writable(self):
        return self.buffer.writable()

    def seekable(self):
        return self.buffer.seekable()

    def flush(self):
        return self.buffer.flush()

    def tell(self):
        return self.buffer.tell()

    def seek(self, offset, whence=0):
        return self.buffer.seek(offset, whence)

    def truncate(self, size=None):
        return self.buffer.truncate(size)

    def read(self, size=-1):
        data = self.buffer.read(size)
        return data.decode(self.encoding, self.errors)

    def readline(self, size=-1):
        data = self.buffer.readline(size)
        return data.decode(self.encoding, self.errors)

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError("write() argument must be str, not " + type(text).__name__)
        data = text.encode(self.encoding, self.errors)
        self.buffer.write(data)
        if self.write_through or (self.line_buffering and "\n" in text):
            self.flush()
        return len(text)

    def detach(self):
        buffer = self.buffer
        self.buffer = None
        return buffer

    def fileno(self):
        method = getattr(self.buffer, "fileno", None)
        if method is None:
            raise UnsupportedOperation("fileno")
        return method()

    def isatty(self):
        method = getattr(self.buffer, "isatty", None)
        return False if method is None else method()

    def close(self):
        if not self.closed:
            self.flush()
            self.buffer.close()
            self.closed = True

"""In-memory text and binary streams, plus the host-backed ``open``.

This is the portable core of Python's :mod:`io` interface.  The built-in
``open`` uses an embedding-provided filesystem capability and is re-exported
here just as it is by CPython's :mod:`io` module.
"""

import builtins


open = builtins.open


class IOBase:
    def __init__(self):
        self.closed = False

    def _check_open(self):
        if self.closed:
            raise ValueError('I/O operation on closed file')

    def close(self):
        self.closed = True

    def flush(self):
        self._check_open()

    def __enter__(self):
        self._check_open()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()

    def __iter__(self):
        return self

    def __next__(self):
        line = self.readline()
        if line == '' or line == b'':
            raise StopIteration
        return line


class StringIO(IOBase):
    def __init__(self, initial_value=''):
        IOBase.__init__(self)
        if not isinstance(initial_value, str):
            raise TypeError('initial_value must be str or None')
        self._value = initial_value
        self._position = 0

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
            raise ValueError('invalid whence')
        if position < 0:
            raise ValueError('negative seek position')
        self._position = position
        return position

    def read(self, size=-1):
        self._check_open()
        if size is None or size < 0:
            end = len(self._value)
        else:
            end = min(len(self._value), self._position + size)
        answer = self._value[self._position:end]
        self._position = end
        return answer

    def readline(self, size=-1):
        self._check_open()
        if self._position >= len(self._value):
            return ''
        newline = self._value.find('\n', self._position)
        end = len(self._value) if newline < 0 else newline + 1
        if size is not None and size >= 0:
            end = min(end, self._position + size)
        answer = self._value[self._position:end]
        self._position = end
        return answer

    def write(self, text):
        self._check_open()
        if not isinstance(text, str):
            raise TypeError('string argument expected')
        if self._position > len(self._value):
            self._value += '\x00' * (self._position - len(self._value))
        end = self._position + len(text)
        suffix = self._value[end:] if end < len(self._value) else ''
        self._value = self._value[:self._position] + text + suffix
        self._position = end
        return len(text)

    def truncate(self, size=None):
        self._check_open()
        if size is None:
            size = self._position
        if size < 0:
            raise ValueError('negative size value')
        if size < len(self._value):
            self._value = self._value[:size]
        return size


class BytesIO(IOBase):
    def __init__(self, initial_bytes=b''):
        IOBase.__init__(self)
        self._value = bytearray(initial_bytes)
        self._position = 0

    def getvalue(self):
        self._check_open()
        return bytes(self._value)

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
            raise ValueError('invalid whence')
        if position < 0:
            raise ValueError('negative seek position')
        self._position = position
        return position

    def read(self, size=-1):
        self._check_open()
        if size is None or size < 0:
            end = len(self._value)
        else:
            end = min(len(self._value), self._position + size)
        answer = bytes(self._value[self._position:end])
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
        answer = bytes(self._value[self._position:end])
        self._position = end
        return answer

    def write(self, data):
        self._check_open()
        if not isinstance(data, (bytes, bytearray, memoryview)):
            raise TypeError('a bytes-like object is required')
        data = bytes(data)
        while len(self._value) < self._position:
            self._value.append(0)
        end = self._position + len(data)
        if end > len(self._value):
            self._value.extend(b'\x00' * (end - len(self._value)))
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
            raise ValueError('negative size value')
        if size < len(self._value):
            del self._value[size:]
        return size

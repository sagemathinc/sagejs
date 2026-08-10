"""Secure temporary files and directories for Sage.js hosts."""

import os


TMP_MAX = 10000
template = "tmp"
tempdir = None


def gettempdir():
    if tempdir is not None:
        return tempdir
    for variable in ("TMPDIR", "TEMP", "TMP"):
        value = os.getenv(variable)
        if value:
            return value
    return os.tempdir


def gettempdirb():
    return gettempdir().encode()


def _random_name():
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789_"
    data = os.urandom(8)
    return "".join(alphabet[byte % len(alphabet)] for byte in data)


class _RandomNameSequence:
    characters = "abcdefghijklmnopqrstuvwxyz0123456789_"

    def __iter__(self):
        return self

    def __next__(self):
        return _random_name()


def _get_candidate_names():
    return _RandomNameSequence()


def _candidate(suffix, prefix, directory):
    directory = gettempdir() if directory is None else os.fspath(directory)
    prefix = template if prefix is None else prefix
    suffix = "" if suffix is None else suffix
    return os.path.join(directory, prefix + _random_name() + suffix)


def mkstemp(suffix=None, prefix=None, dir=None, text=False):
    del text
    for _attempt in range(TMP_MAX):
        filename = _candidate(suffix, prefix, dir)
        try:
            fd = os._host_call("openFd", filename, "wx+", 0o600)
            return fd, filename
        except FileExistsError:
            pass
    raise FileExistsError("No usable temporary file name found")


def mkdtemp(suffix=None, prefix=None, dir=None):
    for _attempt in range(TMP_MAX):
        filename = _candidate(suffix, prefix, dir)
        try:
            os.mkdir(filename, 0o700)
            return filename
        except FileExistsError:
            pass
    raise FileExistsError("No usable temporary directory name found")


def mktemp(suffix=None, prefix=None, dir=None):
    """Return an unused temporary pathname without creating it.

    This deprecated CPython compatibility API is inherently subject to a
    create-after-check race.  New code should use `mkstemp` or
    `NamedTemporaryFile` instead.
    """
    for _attempt in range(TMP_MAX):
        filename = _candidate(suffix, prefix, dir)
        if not os.path.exists(filename):
            return filename
    raise FileExistsError("No usable temporary file name found")


class _TemporaryFileWrapper:
    def __init__(self, fileobj, name, delete_value, delete_on_close=True):
        self.file = fileobj
        self.name = name
        self.delete = delete_value
        self.delete_on_close = delete_on_close
        self.closed = False

    def __getattr__(self, name):
        return getattr(self.file, name)

    def __enter__(self):
        return self

    def __exit__(self, *_arguments):
        self.close()
        return False

    def __iter__(self):
        return iter(self.file)

    def close(self):
        if self.closed:
            return
        self.file.close()
        self.closed = True
        if self.delete and self.delete_on_close:
            try:
                os.unlink(self.name)
            except FileNotFoundError:
                pass


def NamedTemporaryFile(
    mode="w+b",
    buffering=-1,
    encoding=None,
    newline=None,
    suffix=None,
    prefix=None,
    dir=None,
    *,
    errors=None,
    delete_on_close=True,
    **keywords,
):
    delete_value = keywords.pop("ρσ_py_delete", keywords.pop("delete", True))
    if keywords:
        raise TypeError("unexpected keyword argument: " + next(iter(keywords)))
    fd, name = mkstemp(suffix, prefix, dir, "b" not in mode)
    os.close(fd)
    try:
        fileobj = open(
            name,
            mode,
            buffering=buffering,
            encoding=encoding,
            errors=errors,
            newline=newline,
        )
    except BaseException:
        os.unlink(name)
        raise
    return _TemporaryFileWrapper(fileobj, name, delete_value, delete_on_close)


def TemporaryFile(
    mode="w+b",
    buffering=-1,
    encoding=None,
    newline=None,
    suffix=None,
    prefix=None,
    dir=None,
    *,
    errors=None,
):
    return NamedTemporaryFile(
        mode,
        buffering,
        encoding,
        newline,
        suffix,
        prefix,
        dir,
        True,
        errors=errors,
        delete_on_close=True,
    )


class SpooledTemporaryFile:
    def __init__(
        self,
        max_size=0,
        mode="w+b",
        buffering=-1,
        encoding=None,
        newline=None,
        suffix=None,
        prefix=None,
        dir=None,
        *,
        errors=None,
    ):
        del max_size
        self._file = TemporaryFile(
            mode,
            buffering,
            encoding,
            newline,
            suffix,
            prefix,
            dir,
            errors=errors,
        )
        self._rolled = True

    def __getattr__(self, name):
        return getattr(self._file, name)

    def __enter__(self):
        return self

    def __exit__(self, *_arguments):
        self.close()
        return False

    def rollover(self):
        self._rolled = True

    def close(self):
        self._file.close()


class TemporaryDirectory:
    def __init__(
        self,
        suffix=None,
        prefix=None,
        dir=None,
        ignore_cleanup_errors=False,
        **keywords,
    ):
        delete_value = keywords.pop("ρσ_py_delete", keywords.pop("delete", True))
        if keywords:
            raise TypeError("unexpected keyword argument: " + next(iter(keywords)))
        self.name = mkdtemp(suffix, prefix, dir)
        self.ignore_cleanup_errors = ignore_cleanup_errors
        self.delete = delete_value
        self._closed = False

    def __enter__(self):
        return self.name

    def __exit__(self, *_arguments):
        self.cleanup()
        return False

    def cleanup(self):
        if self._closed or not self.delete:
            return
        import shutil

        try:
            shutil.rmtree(self.name)
        except OSError:
            if not self.ignore_cleanup_errors:
                raise
        self._closed = True

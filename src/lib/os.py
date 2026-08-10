"""Miscellaneous operating system interfaces.

Sage.js implements the most commonly used CPython `os` APIs through an
explicit host capability.  Node.js installs that capability per evaluator,
including a session-local current directory.  Browser and WASM builds can
import this module and use `os.path`; filesystem calls raise
`NotImplementedError` when no host capability is installed.
"""

import sagejs.runtime as runtime
import os.path as path


_STRERROR = {
    1: "Operation not permitted",
    2: "No such file or directory",
    5: "Input/output error",
    11: "Resource temporarily unavailable",
    13: "Permission denied",
    17: "File exists",
    20: "Not a directory",
    21: "Is a directory",
    22: "Invalid argument",
    28: "No space left on device",
    32: "Broken pipe",
    38: "Function not implemented",
    39: "Directory not empty",
}


def strerror(code):
    """Return a platform-neutral description for a Python errno value."""
    value = int(code)
    return _STRERROR.get(value, "Unknown error " + str(value))


def _property(value, key, fallback=None):
    result = runtime.reflect.get(value, key)
    if result is runtime.undefined:
        return fallback
    return result


def _host_object():
    return runtime.reflect.get(runtime.global_object, "__sagejs_host__")


def _raise_host_error(operation, error):
    code = _property(error, "code", "EIO")
    errno_value = _property(error, "errno", None)
    messages = {
        "ENOENT": [2, "No such file or directory", FileNotFoundError],
        "EACCES": [13, "Permission denied", PermissionError],
        "EPERM": [13, "Permission denied", PermissionError],
        "EEXIST": [17, "File exists", FileExistsError],
        "ENOTDIR": [20, "Not a directory", NotADirectoryError],
        "EISDIR": [21, "Is a directory", IsADirectoryError],
        "EINVAL": [22, "Invalid argument", OSError],
        "ENOSYS": [38, "Function not implemented", OSError],
        "ENOTEMPTY": [39, "Directory not empty", OSError],
    }
    if code in messages:
        default_errno, message, exception_class = messages[code]
        # Node's numeric errno values are platform-private (for example,
        # Windows reports -4058 for ENOENT).  Python errno values are stable.
        errno_value = default_errno
    else:
        default_errno, message, exception_class = (
            5,
            str(_property(error, "message", code)),
            OSError,
        )
        if errno_value is None:
            errno_value = default_errno
    filename = _property(error, "path", None)
    destination = _property(error, "dest", None)
    raise exception_class(errno_value, message, filename, destination)


def _host_call(operation, *args):
    host = _host_object()
    if host is runtime.undefined:
        raise NotImplementedError(
            "os." + operation + "() is unavailable without a host filesystem capability"
        )
    method = runtime.reflect.get(host, "call")
    result = runtime.reflect.apply(method, host, [operation, list(args)])
    if not _property(result, "ok", False):
        _raise_host_error(operation, _property(result, "error"))
    return _property(result, "value")


try:
    _description = _host_call("describe")
except NotImplementedError:
    _description = None

if _description is None:
    name = "posix"
    sep = "/"
    altsep = None
    pathsep = ":"
    linesep = "\n"
    devnull = "/dev/null"
    curdir = "."
    pardir = ".."
    tempdir = "/tmp"
else:
    name = _property(_description, "name")
    sep = _property(_description, "sep")
    altsep = _property(_description, "altsep")
    pathsep = _property(_description, "pathsep")
    linesep = _property(_description, "linesep")
    devnull = _property(_description, "devnull")
    curdir = _property(_description, "curdir")
    pardir = _property(_description, "pardir")
    tempdir = _property(_description, "tempdir")

extsep = "."


class PathLike:
    """Abstract protocol for objects representing filesystem paths."""

    def __fspath__(self):
        raise NotImplementedError


def fspath(path):
    """Return the filesystem representation of a path-like object."""
    if isinstance(path, (str, bytes)):
        return path
    try:
        value = path.__fspath__()
    except AttributeError:
        raise TypeError("expected str, bytes or os.PathLike object")
    if not isinstance(value, (str, bytes)):
        raise TypeError("expected __fspath__() to return str or bytes")
    return value


class stat_result:
    """Result object returned by :func:`stat` and :func:`lstat`."""

    _fields = (
        "st_mode",
        "st_ino",
        "st_dev",
        "st_nlink",
        "st_uid",
        "st_gid",
        "st_size",
        "st_atime",
        "st_mtime",
        "st_ctime",
    )

    def __init__(self, value):
        self.st_mode = _property(value, "mode")
        self.st_ino = _property(value, "ino")
        self.st_dev = _property(value, "dev")
        self.st_nlink = _property(value, "nlink")
        self.st_uid = _property(value, "uid")
        self.st_gid = _property(value, "gid")
        self.st_size = _property(value, "size")
        self.st_atime = _property(value, "atime")
        self.st_mtime = _property(value, "mtime")
        self.st_ctime = _property(value, "ctime")
        self.st_birthtime = _property(value, "birthtime")
        self.st_atime_ns = _property(value, "atimeNs")
        self.st_mtime_ns = _property(value, "mtimeNs")
        self.st_ctime_ns = _property(value, "ctimeNs")
        self.st_birthtime_ns = _property(value, "birthtimeNs")
        self._is_file = _property(value, "isFile", False)
        self._is_directory = _property(value, "isDirectory", False)
        self._is_symlink = _property(value, "isSymbolicLink", False)
        self._values = tuple(getattr(self, field) for field in self._fields)

    def __len__(self):
        return len(self._values)

    def __getitem__(self, index):
        return self._values[index]

    def __iter__(self):
        return iter(self._values)

    def __repr__(self):
        values = []
        for field in self._fields:
            values.append(field + "=" + repr(getattr(self, field)))
        return "os.stat_result(" + ", ".join(values) + ")"


class DirEntry:
    """Entry yielded by :func:`scandir`."""

    def __init__(self, directory, value):
        self.name = _property(value, "name")
        self.path = path.join(directory, self.name)
        self._is_file = _property(value, "isFile", False)
        self._is_directory = _property(value, "isDirectory", False)
        self._is_symlink = _property(value, "isSymbolicLink", False)

    def __fspath__(self):
        return self.path

    def is_file(self, follow_symlinks=True):
        if follow_symlinks and self._is_symlink:
            return stat(self.path)._is_file
        return self._is_file

    def is_dir(self, follow_symlinks=True):
        if follow_symlinks and self._is_symlink:
            return stat(self.path)._is_directory
        return self._is_directory

    def is_symlink(self):
        return self._is_symlink

    def stat(self, follow_symlinks=True):
        return stat(self.path) if follow_symlinks else lstat(self.path)

    def __repr__(self):
        return "<DirEntry " + repr(self.name) + ">"


class _ScandirIterator:
    def __init__(self, entries):
        self._entries = entries
        self._index = 0

    def __iter__(self):
        return self

    def __next__(self):
        if self._index >= len(self._entries):
            raise StopIteration
        value = self._entries[self._index]
        self._index += 1
        return value

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
        return False

    def close(self):
        self._index = len(self._entries)


def uname():
    """Return host identification using Python's five-field tuple contract."""
    values = _host_call("uname")
    fields = ["sysname", "nodename", "release", "version", "machine"]
    return runtime.named_tuple(values, "posix.uname_result", fields)


def getcwd():
    """Return the current working directory for this Sage.js session."""
    return _host_call("getcwd")


def getcwdb():
    """Return the session-local current directory encoded as bytes."""
    return fsencode(getcwd())


def chdir(pathname):
    """Change the current working directory for this Sage.js session."""
    _host_call("chdir", fspath(pathname))


def listdir(pathname="."):
    """Return a list containing the names of entries in a directory."""
    return list(_host_call("listdir", fspath(pathname)))


def scandir(pathname="."):
    """Return an iterator of DirEntry objects for a directory."""
    directory = fspath(pathname)
    values = _host_call("scandir", directory)
    return _ScandirIterator([DirEntry(directory, value) for value in values])


def stat(pathname, *, dir_fd=None, follow_symlinks=True):
    if dir_fd is not None:
        raise NotImplementedError("dir_fd is not supported")
    operation = "stat" if follow_symlinks else "lstat"
    return stat_result(_host_call(operation, fspath(pathname)))


def lstat(pathname, *, dir_fd=None):
    return stat(pathname, dir_fd=dir_fd, follow_symlinks=False)


def mkdir(pathname, mode=0o777, *, dir_fd=None):
    if dir_fd is not None:
        raise NotImplementedError("dir_fd is not supported")
    _host_call("mkdir", fspath(pathname), mode)


def makedirs(name, mode=0o777, exist_ok=False):
    try:
        _host_call("makedirs", fspath(name), mode)
    except FileExistsError:
        if not exist_ok or not path.isdir(name):
            raise


def unlink(pathname, *, dir_fd=None):
    if dir_fd is not None:
        raise NotImplementedError("dir_fd is not supported")
    _host_call("unlink", fspath(pathname))


remove = unlink


def rmdir(pathname, *, dir_fd=None):
    if dir_fd is not None:
        raise NotImplementedError("dir_fd is not supported")
    _host_call("rmdir", fspath(pathname))


def rename(src, dst, *, src_dir_fd=None, dst_dir_fd=None):
    if src_dir_fd is not None or dst_dir_fd is not None:
        raise NotImplementedError("dir_fd is not supported")
    _host_call("rename", fspath(src), fspath(dst))


def replace(src, dst, *, src_dir_fd=None, dst_dir_fd=None):
    if src_dir_fd is not None or dst_dir_fd is not None:
        raise NotImplementedError("dir_fd is not supported")
    _host_call("replace", fspath(src), fspath(dst))


def readlink(pathname, *, dir_fd=None):
    if dir_fd is not None:
        raise NotImplementedError("dir_fd is not supported")
    return _host_call("readlink", fspath(pathname))


def symlink(src, dst, target_is_directory=False, *, dir_fd=None):
    if dir_fd is not None:
        raise NotImplementedError("dir_fd is not supported")
    kind = "dir" if target_is_directory else "file"
    _host_call("symlink", fspath(src), fspath(dst), kind)


def link(src, dst, *, src_dir_fd=None, dst_dir_fd=None, follow_symlinks=True):
    if src_dir_fd is not None or dst_dir_fd is not None or not follow_symlinks:
        raise NotImplementedError("extended hard-link options are not supported")
    _host_call("link", fspath(src), fspath(dst))


def chmod(pathname, mode, *, dir_fd=None, follow_symlinks=True):
    if dir_fd is not None or not follow_symlinks:
        raise NotImplementedError("extended chmod options are not supported")
    _host_call("chmod", fspath(pathname), mode)


def utime(pathname, times=None, *, ns=None, dir_fd=None, follow_symlinks=True):
    if dir_fd is not None or not follow_symlinks:
        raise NotImplementedError("extended utime options are not supported")
    if times is not None and ns is not None:
        raise ValueError("utime: you may specify either times or ns but not both")
    if ns is not None:
        times = (ns[0] / 1000000000, ns[1] / 1000000000)
    if times is None:
        import time

        current = time.time()
        times = (current, current)
    _host_call("utime", fspath(pathname), times[0], times[1])


def _realpath(pathname):
    return _host_call("realpath", fspath(pathname))


F_OK = 0
X_OK = 1
W_OK = 2
R_OK = 4


def access(pathname, mode, *, dir_fd=None, effective_ids=False, follow_symlinks=True):
    if dir_fd is not None or effective_ids or not follow_symlinks:
        raise NotImplementedError("extended access options are not supported")
    try:
        _host_call("access", fspath(pathname), mode)
        return True
    except OSError:
        return False


def close(fd):
    _host_call("closeFd", fd)


def walk(top, topdown=True, onerror=None, followlinks=False):
    top = fspath(top)
    directories = []
    files = []
    try:
        entries = list(scandir(top))
    except OSError as error:
        if onerror is not None:
            onerror(error)
        return
    for entry in entries:
        try:
            if entry.is_dir(follow_symlinks=True):
                directories.append(entry.name)
            else:
                files.append(entry.name)
        except OSError:
            files.append(entry.name)
    if topdown:
        yield runtime.math_tuple([top, directories, files])
    for directory in directories:
        destination = path.join(top, directory)
        if not followlinks and path.islink(destination):
            continue
        for result in walk(destination, topdown, onerror, followlinks):
            yield result
    if not topdown:
        yield runtime.math_tuple([top, directories, files])


class _Environ:
    def __init__(self):
        self._data = {}
        try:
            entries = _host_call("environmentEntries")
        except NotImplementedError:
            entries = []
        for key, value in entries:
            self._data[self._key(key)] = [str(key), str(value)]

    def _key(self, key):
        if runtime.jstype(key) != "string":
            raise TypeError("str expected, not " + self._type_name(key))
        value = str(key)
        return value.upper() if name == "nt" else value

    def __getitem__(self, key):
        normalized = self._key(key)
        if normalized not in self._data:
            raise KeyError(key)
        return self._data[normalized][1]

    def __setitem__(self, key, value):
        if runtime.jstype(key) != "string":
            raise TypeError("str expected, not " + self._type_name(key))
        if runtime.jstype(value) != "string":
            raise TypeError("str expected, not " + self._type_name(value))
        key = str(key)
        value = str(value)
        _host_call("setEnv", key, value)
        self._data[self._key(key)] = [key, value]

    def _type_name(self, value):
        kind = runtime.jstype(value)
        if kind == "number":
            return "int" if int(value) == value else "float"
        if kind == "boolean":
            return "bool"
        if value is None:
            return "NoneType"
        return kind

    def __delitem__(self, key):
        normalized = self._key(key)
        if normalized not in self._data:
            raise KeyError(key)
        _host_call("deleteEnv", self._data[normalized][0])
        del self._data[normalized]

    def __contains__(self, key):
        return self._key(key) in self._data

    def __iter__(self):
        return iter(self.keys())

    def __len__(self):
        return len(self._data)

    def keys(self):
        return [value[0] for value in self._data.values()]

    def values(self):
        return [value[1] for value in self._data.values()]

    def items(self):
        return [(value[0], value[1]) for value in self._data.values()]

    def get(self, key, fallback=None):
        try:
            return self.__getitem__(key)
        except KeyError:
            return fallback

    def pop(self, key, *default):
        try:
            value = self.__getitem__(key)
        except KeyError:
            if default:
                return default[0]
            raise
        self.__delitem__(key)
        return value

    def copy(self):
        return dict(self.items())

    def update(self, other=None, **kwargs):
        if other is not None:
            values = other.items() if hasattr(other, "items") else other
            for key, value in values:
                self[key] = value
        for key, value in kwargs.items():
            self[key] = value

    def __repr__(self):
        return "environ(" + repr(self.copy()) + ")"


environ = _Environ()


def getenv(key, fallback=None):
    return environ.get(key, fallback)


def putenv(key, value):
    environ[key] = value


def unsetenv(key):
    try:
        del environ[key]
    except KeyError:
        pass


_fallback_umask = 0o022


def umask(mask):
    """Set the process file-creation mask and return the previous value."""
    global _fallback_umask
    mask = int(mask)
    process_object = runtime.reflect.get(runtime.global_object, "process")
    if process_object is not runtime.undefined:
        method = runtime.reflect.get(process_object, "umask")
        if runtime.strict_equal(runtime.jstype(method), "function"):
            return int(runtime.reflect.apply(method, process_object, [mask]))
    previous = _fallback_umask
    _fallback_umask = mask
    return previous


def getpid():
    return _host_call("getpid")


def cpu_count():
    return _host_call("cpuCount")


def urandom(size):
    if size < 0:
        raise ValueError("negative argument not allowed")
    return bytes(_host_call("urandom", size))


def fsencode(filename):
    """Encode a path using the portable UTF-8 host boundary."""
    value = fspath(filename)
    return (
        value if isinstance(value, bytes) else value.encode("utf-8", "surrogateescape")
    )


def fsdecode(filename):
    """Decode a path using the portable UTF-8 host boundary."""
    value = fspath(filename)
    return value if isinstance(value, str) else value.decode("utf-8", "surrogateescape")


def removedirs(name):
    """Remove a leaf directory and then empty parent directories."""
    name = fspath(name)
    rmdir(name)
    head, tail = path.split(name)
    while head and tail:
        try:
            rmdir(head)
        except OSError:
            break
        head, tail = path.split(head)


def renames(old, new_path):
    """Rename a path, creating destination parents and pruning old ones."""
    old = fspath(old)
    new_path = fspath(new_path)
    head, tail = path.split(new_path)
    if head and tail and not path.exists(head):
        makedirs(head)
    rename(old, new_path)
    head, tail = path.split(old)
    if head and tail:
        try:
            removedirs(head)
        except OSError:
            pass


defpath = path.defpath

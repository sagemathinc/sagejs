"""Miscellaneous operating system interfaces.

Sage.js implements the most commonly used CPython ``os`` APIs through an
explicit host capability.  Node.js installs that capability per evaluator,
including a session-local current directory.  Browser and WASM builds can
import this module and use ``os.path``; filesystem calls raise
``NotImplementedError`` when no host capability is installed.
"""

import sagejs.runtime as runtime
import ntpath
import posixpath


def _property(value, key, fallback=None):
    result = runtime.reflect.get(value, key)
    if result is runtime.undefined:
        return fallback
    return result


def _host_object():
    return runtime.reflect.get(runtime.global_object, '__sagejs_host__')


def _raise_host_error(operation, error):
    code = _property(error, 'code', 'EIO')
    errno_value = _property(error, 'errno', None)
    messages = {
        'ENOENT': [2, 'No such file or directory', FileNotFoundError],
        'EACCES': [13, 'Permission denied', PermissionError],
        'EPERM': [13, 'Permission denied', PermissionError],
        'EEXIST': [17, 'File exists', FileExistsError],
        'ENOTDIR': [20, 'Not a directory', NotADirectoryError],
        'EISDIR': [21, 'Is a directory', IsADirectoryError],
        'EINVAL': [22, 'Invalid argument', OSError],
        'ENOSYS': [38, 'Function not implemented', OSError],
        'ENOTEMPTY': [39, 'Directory not empty', OSError],
    }
    if code in messages:
        default_errno, message, exception_class = messages[code]
    else:
        default_errno, message, exception_class = (5, str(_property(error, 'message', code)), OSError)
    if errno_value is None:
        errno_value = default_errno
    filename = _property(error, 'path', None)
    destination = _property(error, 'dest', None)
    raise exception_class(errno_value, message, filename, destination)


def _host_call(operation, *args):
    host = _host_object()
    if host is runtime.undefined:
        raise NotImplementedError(
            'os.' + operation + '() is unavailable without a host filesystem capability'
        )
    method = runtime.reflect.get(host, 'call')
    result = runtime.reflect.apply(method, host, [operation, list(args)])
    if not _property(result, 'ok', False):
        _raise_host_error(operation, _property(result, 'error'))
    return _property(result, 'value')


try:
    _description = _host_call('describe')
except NotImplementedError:
    _description = None

if _description is None:
    name = 'posix'
    sep = '/'
    altsep = None
    pathsep = ':'
    linesep = '\n'
    devnull = '/dev/null'
    curdir = '.'
    pardir = '..'
else:
    name = _property(_description, 'name')
    sep = _property(_description, 'sep')
    altsep = _property(_description, 'altsep')
    pathsep = _property(_description, 'pathsep')
    linesep = _property(_description, 'linesep')
    devnull = _property(_description, 'devnull')
    curdir = _property(_description, 'curdir')
    pardir = _property(_description, 'pardir')

extsep = '.'


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
        raise TypeError('expected str, bytes or os.PathLike object')
    if not isinstance(value, (str, bytes)):
        raise TypeError('expected __fspath__() to return str or bytes')
    return value


class stat_result:
    """Result object returned by :func:`stat` and :func:`lstat`."""

    _fields = (
        'st_mode', 'st_ino', 'st_dev', 'st_nlink', 'st_uid',
        'st_gid', 'st_size', 'st_atime', 'st_mtime', 'st_ctime',
    )

    def __init__(self, value):
        self.st_mode = _property(value, 'mode')
        self.st_ino = _property(value, 'ino')
        self.st_dev = _property(value, 'dev')
        self.st_nlink = _property(value, 'nlink')
        self.st_uid = _property(value, 'uid')
        self.st_gid = _property(value, 'gid')
        self.st_size = _property(value, 'size')
        self.st_atime = _property(value, 'atime')
        self.st_mtime = _property(value, 'mtime')
        self.st_ctime = _property(value, 'ctime')
        self.st_birthtime = _property(value, 'birthtime')
        self.st_atime_ns = _property(value, 'atimeNs')
        self.st_mtime_ns = _property(value, 'mtimeNs')
        self.st_ctime_ns = _property(value, 'ctimeNs')
        self.st_birthtime_ns = _property(value, 'birthtimeNs')
        self._is_file = _property(value, 'isFile', False)
        self._is_directory = _property(value, 'isDirectory', False)
        self._is_symlink = _property(value, 'isSymbolicLink', False)
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
            values.append(field + '=' + repr(getattr(self, field)))
        return 'os.stat_result(' + ', '.join(values) + ')'


class DirEntry:
    """Entry yielded by :func:`scandir`."""

    def __init__(self, directory, value):
        self.name = _property(value, 'name')
        self.path = path.join(directory, self.name)
        self._is_file = _property(value, 'isFile', False)
        self._is_directory = _property(value, 'isDirectory', False)
        self._is_symlink = _property(value, 'isSymbolicLink', False)

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
    values = _host_call('uname')
    fields = ['sysname', 'nodename', 'release', 'version', 'machine']
    return runtime.named_tuple(values, 'posix.uname_result', fields)


def getcwd():
    """Return the current working directory for this Sage.js session."""
    return _host_call('getcwd')


def chdir(pathname):
    """Change the current working directory for this Sage.js session."""
    _host_call('chdir', fspath(pathname))


def listdir(pathname='.'):
    """Return a list containing the names of entries in a directory."""
    return list(_host_call('listdir', fspath(pathname)))


def scandir(pathname='.'):
    """Return an iterator of DirEntry objects for a directory."""
    directory = fspath(pathname)
    values = _host_call('scandir', directory)
    return _ScandirIterator([DirEntry(directory, value) for value in values])


def stat(pathname, *, dir_fd=None, follow_symlinks=True):
    if dir_fd is not None:
        raise NotImplementedError('dir_fd is not supported')
    operation = 'stat' if follow_symlinks else 'lstat'
    return stat_result(_host_call(operation, fspath(pathname)))


def lstat(pathname, *, dir_fd=None):
    return stat(pathname, dir_fd=dir_fd, follow_symlinks=False)


def mkdir(pathname, mode=0o777, *, dir_fd=None):
    if dir_fd is not None:
        raise NotImplementedError('dir_fd is not supported')
    _host_call('mkdir', fspath(pathname), mode)


def makedirs(name, mode=0o777, exist_ok=False):
    try:
        _host_call('makedirs', fspath(name), mode)
    except FileExistsError:
        if not exist_ok or not path.isdir(name):
            raise


def unlink(pathname, *, dir_fd=None):
    if dir_fd is not None:
        raise NotImplementedError('dir_fd is not supported')
    _host_call('unlink', fspath(pathname))


remove = unlink


def rmdir(pathname, *, dir_fd=None):
    if dir_fd is not None:
        raise NotImplementedError('dir_fd is not supported')
    _host_call('rmdir', fspath(pathname))


def rename(src, dst, *, src_dir_fd=None, dst_dir_fd=None):
    if src_dir_fd is not None or dst_dir_fd is not None:
        raise NotImplementedError('dir_fd is not supported')
    _host_call('rename', fspath(src), fspath(dst))


def replace(src, dst, *, src_dir_fd=None, dst_dir_fd=None):
    if src_dir_fd is not None or dst_dir_fd is not None:
        raise NotImplementedError('dir_fd is not supported')
    _host_call('replace', fspath(src), fspath(dst))


def readlink(pathname, *, dir_fd=None):
    if dir_fd is not None:
        raise NotImplementedError('dir_fd is not supported')
    return _host_call('readlink', fspath(pathname))


def _realpath(pathname):
    return _host_call('realpath', fspath(pathname))


F_OK = 0
X_OK = 1
W_OK = 2
R_OK = 4


def access(pathname, mode, *, dir_fd=None, effective_ids=False, follow_symlinks=True):
    if dir_fd is not None or effective_ids or not follow_symlinks:
        raise NotImplementedError('extended access options are not supported')
    try:
        _host_call('access', fspath(pathname), mode)
        return True
    except OSError:
        return False


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
            if entry.is_dir(follow_symlinks=followlinks):
                directories.append(entry.name)
            else:
                files.append(entry.name)
        except OSError:
            files.append(entry.name)
    if topdown:
        yield top, directories, files
    for directory in directories:
        for result in walk(path.join(top, directory), topdown, onerror, followlinks):
            yield result
    if not topdown:
        yield top, directories, files


class _Environ:
    def __init__(self):
        self._data = {}
        try:
            entries = _host_call('environmentEntries')
        except NotImplementedError:
            entries = []
        for key, value in entries:
            self._data[self._key(key)] = [str(key), str(value)]

    def _key(self, key):
        value = str(key)
        return value.upper() if name == 'nt' else value

    def __getitem__(self, key):
        normalized = self._key(key)
        if normalized not in self._data:
            raise KeyError(key)
        return self._data[normalized][1]

    def __setitem__(self, key, value):
        key = str(key)
        value = str(value)
        _host_call('setEnv', key, value)
        self._data[self._key(key)] = [key, value]

    def __delitem__(self, key):
        normalized = self._key(key)
        if normalized not in self._data:
            raise KeyError(key)
        _host_call('deleteEnv', self._data[normalized][0])
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

    def copy(self):
        return dict(self.items())

    def update(self, other=None, **kwargs):
        if other is not None:
            values = other.items() if hasattr(other, 'items') else other
            for key, value in values:
                self[key] = value
        for key, value in kwargs.items():
            self[key] = value

    def __repr__(self):
        return 'environ(' + repr(self.copy()) + ')'


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


def getpid():
    return _host_call('getpid')


def cpu_count():
    return _host_call('cpuCount')


def urandom(size):
    if size < 0:
        raise ValueError('negative argument not allowed')
    return bytes(_host_call('urandom', size))


if name == 'nt':
    path = ntpath
else:
    path = posixpath

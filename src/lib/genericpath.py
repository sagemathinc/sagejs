# Adapted from CPython at revision 7b4165b3b07638d8aeab79a880c52f2b51c56f37.
# Copyright Python Software Foundation; licensed under PSF-2.0.

"""Path operations common to POSIX and Windows.

Algorithms and API shape follow CPython's :mod:`genericpath` module.
"""

import sagejs.runtime as runtime


def _host_call(operation, *args):
    host = runtime.reflect.get(runtime.global_object, '__sagejs_host__')
    if host is runtime.undefined:
        raise NotImplementedError(
            'filesystem path queries are unavailable without a host capability'
        )
    method = runtime.reflect.get(host, 'call')
    result = runtime.reflect.apply(method, host, [operation, list(args)])
    if not runtime.reflect.get(result, 'ok'):
        error = runtime.reflect.get(result, 'error')
        code = runtime.reflect.get(error, 'code')
        filename = runtime.reflect.get(error, 'path')
        if code == 'ENOENT':
            raise FileNotFoundError(2, 'No such file or directory', filename)
        if code == 'ENOTDIR':
            raise NotADirectoryError(20, 'Not a directory', filename)
        raise OSError(5, str(runtime.reflect.get(error, 'message')), filename)
    return runtime.reflect.get(result, 'value')


def _property(value, name):
    return runtime.reflect.get(value, name)


def exists(path):
    try:
        _host_call('stat', path)
        return True
    except OSError:
        return False


def lexists(path):
    try:
        _host_call('lstat', path)
        return True
    except OSError:
        return False


def isfile(path):
    try:
        return _property(_host_call('stat', path), 'isFile')
    except OSError:
        return False


def isdir(path):
    try:
        return _property(_host_call('stat', path), 'isDirectory')
    except OSError:
        return False


def islink(path):
    try:
        return _property(_host_call('lstat', path), 'isSymbolicLink')
    except OSError:
        return False


def getsize(filename):
    return _property(_host_call('stat', filename), 'size')


def getmtime(filename):
    return _property(_host_call('stat', filename), 'mtime')


def getatime(filename):
    return _property(_host_call('stat', filename), 'atime')


def getctime(filename):
    return _property(_host_call('stat', filename), 'ctime')


def _getcwd():
    return _host_call('getcwd')


def _realpath(path):
    return _host_call('realpath', path)


def commonprefix(paths):
    if not paths:
        return ''
    smallest = min(paths)
    largest = max(paths)
    for index, char in enumerate(smallest):
        if char != largest[index]:
            return smallest[:index]
    return smallest


def _splitext(path, sep, altsep, extsep):
    sep_index = path.rfind(sep)
    if altsep:
        sep_index = max(sep_index, path.rfind(altsep))
    dot_index = path.rfind(extsep)
    if dot_index > sep_index:
        filename_index = sep_index + 1
        while filename_index < dot_index:
            if path[filename_index] != extsep:
                return tuple([path[:dot_index], path[dot_index:]])
            filename_index += 1
    return tuple([path, path[:0]])

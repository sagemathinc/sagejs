# Adapted from CPython at revision 7b4165b3b07638d8aeab79a880c52f2b51c56f37.
# Copyright Python Software Foundation; licensed under PSF-2.0.

"""Windows NT pathname operations.

This compact port follows CPython's :mod:`ntpath`; it is intentionally pure
Python so the same Windows semantics are available on every Sage.js host.
"""

import genericpath

curdir = '.'
pardir = '..'
extsep = '.'
sep = '\\'
pathsep = ';'
defpath = '.;C:\\bin'
altsep = '/'
devnull = 'nul'

exists = genericpath.exists
lexists = genericpath.lexists
isfile = genericpath.isfile
isdir = genericpath.isdir
islink = genericpath.islink
getsize = genericpath.getsize
getmtime = genericpath.getmtime
getatime = genericpath.getatime
getctime = genericpath.getctime
commonprefix = genericpath.commonprefix
samefile = genericpath.samefile


def _path(path):
    if isinstance(path, (str, bytes)):
        return path
    try:
        value = path.__fspath__()
    except AttributeError:
        raise TypeError('expected str, bytes or os.PathLike object')
    if not isinstance(value, (str, bytes)):
        raise TypeError('expected __fspath__() to return str or bytes')
    return value


def normcase(path):
    path = _path(path)
    return path.replace(altsep, sep).lower()


def splitdrive(path):
    path = _path(path)
    normalized = path.replace(altsep, sep)
    if len(normalized) >= 2 and normalized[1] == ':':
        return tuple([path[:2], path[2:]])
    if normalized.startswith('\\\\'):
        index = normalized.find(sep, 2)
        if index == -1:
            return tuple([path, path[:0]])
        index = normalized.find(sep, index + 1)
        if index == -1:
            return tuple([path, path[:0]])
        return tuple([path[:index], path[index:]])
    return tuple([path[:0], path])


def isabs(path):
    path = _path(path)
    drive, tail = splitdrive(path)
    return tail.startswith(sep) or tail.startswith(altsep)


def join(path, *paths):
    path = _path(path)
    result_drive, result_path = splitdrive(path)
    for item in paths:
        item = _path(item)
        drive, tail = splitdrive(item)
        if tail.startswith((sep, altsep)):
            if drive or not result_drive:
                result_drive = drive
            result_path = tail
            continue
        if drive and drive.lower() != result_drive.lower():
            result_drive, result_path = drive, tail
            continue
        if drive:
            result_drive = drive
        if result_path and not result_path.endswith((sep, altsep)):
            result_path += sep
        result_path += tail
    if result_path and not result_path.startswith((sep, altsep)) and result_drive.endswith(':'):
        return result_drive + result_path
    return result_drive + result_path


def split(path):
    path = _path(path)
    drive, tail = splitdrive(path)
    index = max(tail.rfind(sep), tail.rfind(altsep)) + 1
    head, name = tail[:index], tail[index:]
    head = head.rstrip(sep + altsep) or head
    return tuple([drive + head, name])


def splitext(path):
    path = _path(path)
    return genericpath._splitext(path, sep, altsep, extsep)


def basename(path):
    return split(path)[1]


def dirname(path):
    return split(path)[0]


def normpath(path):
    path = _path(path)
    if path == '':
        return curdir
    path = path.replace(altsep, sep)
    drive, tail = splitdrive(path)
    rooted = tail.startswith(sep)
    components = []
    for component in tail.split(sep):
        if component == '' or component == curdir:
            continue
        if component == pardir:
            if components and components[-1] != pardir:
                components.pop()
            elif not rooted:
                components.append(component)
        else:
            components.append(component)
    result = sep.join(components)
    if rooted:
        result = sep + result
    return drive + result or curdir


def abspath(path):
    path = _path(path)
    if not isabs(path):
        path = join(genericpath._getcwd(), path)
    return normpath(path)


def realpath(path):
    path = _path(path)
    try:
        return genericpath._realpath(path)
    except NotImplementedError:
        return abspath(path)


def relpath(path, start=None):
    path = _path(path)
    if not path:
        raise ValueError('no path specified')
    if start is None:
        start = curdir
    else:
        start = _path(start)
    start_abs = abspath(start)
    path_abs = abspath(path)
    start_drive, start_tail = splitdrive(start_abs)
    path_drive, path_tail = splitdrive(path_abs)
    if normcase(start_drive) != normcase(path_drive):
        raise ValueError('path is on a different drive')
    start_list = [item for item in start_tail.split(sep) if item]
    path_list = [item for item in path_tail.split(sep) if item]
    common = 0
    maximum = min(len(start_list), len(path_list))
    while common < maximum and normcase(start_list[common]) == normcase(path_list[common]):
        common += 1
    result = [pardir] * (len(start_list) - common) + path_list[common:]
    return join(*result) if result else curdir

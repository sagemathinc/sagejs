# Adapted from CPython at revision 7b4165b3b07638d8aeab79a880c52f2b51c56f37.
# Copyright Python Software Foundation; licensed under PSF-2.0.

"""POSIX pathname operations.

This is a compact Sage.js port of CPython's :mod:`posixpath`.  Pure pathname
operations work without a host filesystem, including in browser/WASM builds.
"""

import genericpath

curdir = '.'
pardir = '..'
extsep = '.'
sep = '/'
pathsep = ':'
defpath = '/bin:/usr/bin'
altsep = None
devnull = '/dev/null'

exists = genericpath.exists
lexists = genericpath.lexists
isfile = genericpath.isfile
isdir = genericpath.isdir
getsize = genericpath.getsize
getmtime = genericpath.getmtime
getatime = genericpath.getatime
getctime = genericpath.getctime
commonprefix = genericpath.commonprefix


def normcase(path):
    return path


def isabs(path):
    return path.startswith(sep)


def join(path, *paths):
    result = path
    for item in paths:
        if item.startswith(sep) or not result:
            result = item
        elif result.endswith(sep):
            result += item
        else:
            result += sep + item
    return result


def split(path):
    index = path.rfind(sep) + 1
    head, tail = path[:index], path[index:]
    if head and head != sep * len(head):
        head = head.rstrip(sep)
    return tuple([head, tail])


def splitext(path):
    return genericpath._splitext(path, sep, altsep, extsep)


def splitdrive(path):
    return tuple([path[:0], path])


def basename(path):
    return split(path)[1]


def dirname(path):
    return split(path)[0]


def normpath(path):
    if path == '':
        return curdir
    initial_slashes = 1 if path.startswith(sep) else 0
    if initial_slashes and path.startswith('//') and not path.startswith('///'):
        initial_slashes = 2
    components = path.split(sep)
    new_components = []
    for component in components:
        if component == '' or component == curdir:
            continue
        if component != pardir or (
            not initial_slashes and (
                not new_components or new_components[-1] == pardir
            )
        ):
            new_components.append(component)
        elif new_components:
            new_components.pop()
    result = sep.join(new_components)
    if initial_slashes:
        result = sep * initial_slashes + result
    return result or curdir


def abspath(path):
    if not isabs(path):
        path = join(genericpath._getcwd(), path)
    return normpath(path)


def realpath(path):
    try:
        return genericpath._realpath(path)
    except NotImplementedError:
        return abspath(path)


def relpath(path, start=None):
    if not path:
        raise ValueError('no path specified')
    if start is None:
        start = curdir
    start_list = [item for item in abspath(start).split(sep) if item]
    path_list = [item for item in abspath(path).split(sep) if item]
    common = 0
    maximum = min(len(start_list), len(path_list))
    while common < maximum and start_list[common] == path_list[common]:
        common += 1
    result = [pardir] * (len(start_list) - common) + path_list[common:]
    return join(*result) if result else curdir


def commonpath(paths):
    paths = list(paths)
    if not paths:
        raise ValueError('commonpath() arg is an empty sequence')
    absolute = [isabs(path) for path in paths]
    if any(absolute) and not all(absolute):
        raise ValueError("Can't mix absolute and relative paths")
    split_paths = [normpath(path).split(sep) for path in paths]
    common = split_paths[0]
    for parts in split_paths[1:]:
        limit = min(len(common), len(parts))
        index = 0
        while index < limit and common[index] == parts[index]:
            index += 1
        common = common[:index]
    result = sep.join(common)
    if absolute[0] and not result.startswith(sep):
        result = sep + result
    return result or curdir

"""Shell-style pathname expansion with recursive ``**`` support."""

import os
import fnmatch


magic_check = ("*", "?", "[")


def has_magic(pathname):
    return any(character in pathname for character in magic_check)


def _hidden(name):
    return name.startswith(".")


def _entries(directory):
    try:
        return list(os.scandir(directory if directory else "."))
    except OSError:
        return []


def _walk(base, segments, prefix, recursive, include_hidden):
    if len(segments) == 0:
        if base == "" or os.path.lexists(base):
            yield prefix if prefix else base
        return
    segment = segments[0]
    remaining = segments[1:]
    if segment == "**" and recursive:
        for result in _walk(base, remaining, prefix, recursive, include_hidden):
            yield result
        for entry in _entries(base):
            if not entry.is_dir(follow_symlinks=False):
                continue
            if _hidden(entry.name) and not include_hidden:
                continue
            child_base = os.path.join(base, entry.name) if base else entry.name
            child_prefix = os.path.join(prefix, entry.name) if prefix else entry.name
            for result in _walk(
                child_base,
                segments,
                child_prefix,
                recursive,
                include_hidden,
            ):
                yield result
        return
    if not has_magic(segment):
        child_base = os.path.join(base, segment) if base else segment
        child_prefix = os.path.join(prefix, segment) if prefix else segment
        for result in _walk(
            child_base, remaining, child_prefix, recursive, include_hidden
        ):
            yield result
        return
    for entry in _entries(base):
        if _hidden(entry.name) and not (include_hidden or segment.startswith(".")):
            continue
        if not fnmatch.fnmatchcase(entry.name, segment):
            continue
        if remaining and not entry.is_dir():
            continue
        child_base = os.path.join(base, entry.name) if base else entry.name
        child_prefix = os.path.join(prefix, entry.name) if prefix else entry.name
        for result in _walk(
            child_base, remaining, child_prefix, recursive, include_hidden
        ):
            yield result


def iglob(
    pathname,
    *,
    root_dir=None,
    dir_fd=None,
    recursive=False,
    include_hidden=False,
):
    if dir_fd is not None:
        raise NotImplementedError("dir_fd is not supported")
    pathname = os.fspath(pathname)
    drive, tail = os.path.splitdrive(pathname)
    absolute = os.path.isabs(pathname)
    separators = os.sep
    if os.altsep is not None:
        tail = tail.replace(os.altsep, os.sep)
    segments = [segment for segment in tail.split(separators) if segment != ""]
    if absolute:
        base = drive + os.sep
        prefix = drive + os.sep
    else:
        base = "" if root_dir is None else os.fspath(root_dir)
        prefix = ""
    for result in _walk(base, segments, prefix, recursive, include_hidden):
        yield result


def glob(
    pathname,
    *,
    root_dir=None,
    dir_fd=None,
    recursive=False,
    include_hidden=False,
):
    return list(
        iglob(
            pathname,
            root_dir=root_dir,
            dir_fd=dir_fd,
            recursive=recursive,
            include_hidden=include_hidden,
        )
    )


def escape(pathname):
    drive, tail = os.path.splitdrive(pathname)
    answer = ""
    for character in tail:
        answer += "[" + character + "]" if character in "*?[" else character
    return drive + answer

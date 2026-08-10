"""High-level file operations built on Sage.js's host filesystem API."""

import os
from collections import namedtuple


class Error(OSError):
    pass


class SameFileError(Error):
    pass


class SpecialFileError(OSError):
    pass


class ExecError(OSError):
    pass


COPY_BUFSIZE = 1024 * 1024
_ntuple_diskusage = namedtuple("usage", "total used free")
_ntuple_terminal_size = namedtuple("terminal_size", "columns lines")


def get_terminal_size(fallback=(80, 24)):
    """Return the terminal dimensions, using `fallback` when unavailable.

    Kernel and SEA hosts do not consistently expose a controlling TTY to the
    Python runtime.  Falling back is CPython's documented behavior and keeps
    terminal-oriented libraries deterministic in notebooks and CI.
    """
    columns, lines = fallback
    value = os.environ.get("COLUMNS")
    if value:
        try:
            columns = int(value)
        except ValueError:
            pass
    value = os.environ.get("LINES")
    if value:
        try:
            lines = int(value)
        except ValueError:
            pass
    return _ntuple_terminal_size(columns, lines)


def copyfileobj(fsrc, fdst, length=0):
    length = COPY_BUFSIZE if not length else length
    while True:
        block = fsrc.read(length)
        if block == b"" or block == "":
            break
        fdst.write(block)


def _samefile(src, dst):
    return os.path.normcase(os.path.abspath(os.fspath(src))) == os.path.normcase(
        os.path.abspath(os.fspath(dst))
    )


def copyfile(src, dst, *, follow_symlinks=True):
    src = os.fspath(src)
    dst = os.fspath(dst)
    if _samefile(src, dst):
        raise SameFileError(repr(src) + " and " + repr(dst) + " are the same file")
    if not follow_symlinks and os.path.islink(src):
        os.symlink(os.readlink(src), dst)
        return dst
    with open(src, "rb") as source:
        with open(dst, "wb") as destination:
            copyfileobj(source, destination)
    return dst


def copymode(src, dst, *, follow_symlinks=True):
    metadata = os.stat(src, follow_symlinks=follow_symlinks)
    os.chmod(dst, metadata.st_mode & 0o7777, follow_symlinks=follow_symlinks)


def copystat(src, dst, *, follow_symlinks=True):
    metadata = os.stat(src, follow_symlinks=follow_symlinks)
    os.utime(
        dst,
        (metadata.st_atime, metadata.st_mtime),
        follow_symlinks=follow_symlinks,
    )
    os.chmod(dst, metadata.st_mode & 0o7777, follow_symlinks=follow_symlinks)


def copy(src, dst, *, follow_symlinks=True):
    if os.path.isdir(dst):
        dst = os.path.join(dst, os.path.basename(src))
    copyfile(src, dst, follow_symlinks=follow_symlinks)
    copymode(src, dst, follow_symlinks=follow_symlinks)
    return dst


def copy2(src, dst, *, follow_symlinks=True):
    if os.path.isdir(dst):
        dst = os.path.join(dst, os.path.basename(src))
    copyfile(src, dst, follow_symlinks=follow_symlinks)
    copystat(src, dst, follow_symlinks=follow_symlinks)
    return dst


def ignore_patterns(*patterns):
    def _ignore(_path, names):
        import fnmatch

        ignored = set()
        for pattern in patterns:
            ignored.update(fnmatch.filter(names, pattern))
        return ignored

    return _ignore


def copytree(
    src,
    dst,
    symlinks=False,
    ignore=None,
    copy_function=copy2,
    ignore_dangling_symlinks=False,
    dirs_exist_ok=False,
):
    src = os.fspath(src)
    dst = os.fspath(dst)
    os.makedirs(dst, exist_ok=dirs_exist_ok)
    entries = list(os.scandir(src))
    ignored = (
        set() if ignore is None else set(ignore(src, [entry.name for entry in entries]))
    )
    errors = []
    for entry in entries:
        if entry.name in ignored:
            continue
        source = entry.path
        destination = os.path.join(dst, entry.name)
        try:
            if entry.is_symlink():
                link_target = os.readlink(source)
                if symlinks:
                    os.symlink(
                        link_target,
                        destination,
                        target_is_directory=entry.is_dir(),
                    )
                elif os.path.exists(source):
                    if entry.is_dir():
                        copytree(
                            source,
                            destination,
                            symlinks,
                            ignore,
                            copy_function,
                            ignore_dangling_symlinks,
                            dirs_exist_ok,
                        )
                    else:
                        copy_function(source, destination)
                elif not ignore_dangling_symlinks:
                    raise Error("dangling symbolic link: " + source)
            elif entry.is_dir():
                copytree(
                    source,
                    destination,
                    symlinks,
                    ignore,
                    copy_function,
                    ignore_dangling_symlinks,
                    dirs_exist_ok,
                )
            else:
                copy_function(source, destination)
        except OSError as exception:
            errors.append((source, destination, str(exception)))
    try:
        copystat(src, dst)
    except OSError:
        pass
    if errors:
        raise Error(errors)
    return dst


def rmtree(path, ignore_errors=False, onerror=None, *, onexc=None, dir_fd=None):
    if dir_fd is not None:
        raise NotImplementedError("dir_fd is not supported")
    path = os.fspath(path)
    try:
        if os.path.islink(path):
            raise OSError("Cannot call rmtree on a symbolic link")
        for entry in os.scandir(path):
            try:
                if entry.is_dir(follow_symlinks=False):
                    rmtree(entry.path, ignore_errors, onerror, onexc=onexc)
                else:
                    os.unlink(entry.path)
            except OSError as exception:
                callback = onexc if onexc is not None else onerror
                if callback is not None:
                    callback(os.unlink, entry.path, exception)
                elif not ignore_errors:
                    raise
        os.rmdir(path)
    except OSError as exception:
        callback = onexc if onexc is not None else onerror
        if callback is not None:
            callback(os.rmdir, path, exception)
        elif not ignore_errors:
            raise


def move(src, dst, copy_function=copy2):
    src = os.fspath(src)
    dst = os.fspath(dst)
    real_dst = os.path.join(dst, os.path.basename(src)) if os.path.isdir(dst) else dst
    try:
        os.rename(src, real_dst)
        return real_dst
    except OSError:
        if os.path.isdir(src):
            copytree(src, real_dst, copy_function=copy_function, symlinks=True)
            rmtree(src)
        else:
            copy_function(src, real_dst)
            os.unlink(src)
        return real_dst


def disk_usage(path):
    value = os._host_call("statfs", os.fspath(path))
    block_size = int(value.bsize)
    total = int(value.blocks) * block_size
    free = int(value.bavail) * block_size
    used = total - int(value.bfree) * block_size
    return _ntuple_diskusage(total, used, free)


def which(cmd, mode=os.F_OK | os.X_OK, path=None):
    cmd = os.fspath(cmd)
    if os.path.dirname(cmd):
        return cmd if os.path.isfile(cmd) and os.access(cmd, mode) else None
    if path is None:
        path = os.getenv("PATH", os.defpath if hasattr(os, "defpath") else "")
    extensions = [""]
    if os.name == "nt":
        extensions = os.getenv("PATHEXT", ".COM;.EXE;.BAT;.CMD").split(os.pathsep)
        if any(cmd.lower().endswith(extension.lower()) for extension in extensions):
            extensions.insert(0, "")
    seen = set()
    for directory in path.split(os.pathsep):
        directory = os.path.normcase(directory or os.curdir)
        if directory in seen:
            continue
        seen.add(directory)
        for extension in extensions:
            candidate = os.path.join(directory, cmd + extension)
            if os.path.isfile(candidate) and os.access(candidate, mode):
                return candidate
    return None

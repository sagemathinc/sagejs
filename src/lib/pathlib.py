"""Object-oriented filesystem paths for POSIX, Windows, and host paths."""

import os
import posixpath
import ntpath
import fnmatch
import sagejs.runtime as runtime


def _path_text(value):
    return os.fspath(value) if not isinstance(value, str) else value


class PurePath(os.PathLike):
    _path_module = None

    def __init__(self, *segments):
        path_module = self._module()
        if len(segments) == 0:
            self._path = '.'
        else:
            values = [_path_text(segment) for segment in segments]
            self._path = path_module.join(*values)

    def _module(self):
        return os.path if self._path_module is None else self._path_module

    def __fspath__(self):
        return self._path

    def __str__(self):
        return self._path

    def __repr__(self):
        return type(self).__name__ + '(' + repr(self._path) + ')'

    def __bytes__(self):
        return self._path.encode()

    def __hash__(self):
        return hash(self._module().normcase(self._path))

    def __eq__(self, other):
        if not isinstance(other, PurePath):
            return False
        return (
            self._module() is other._module()
            and self._module().normcase(self._path)
            == other._module().normcase(str(other))
        )

    def __lt__(self, other):
        if not isinstance(other, PurePath) or self._module() is not other._module():
            return NotImplemented
        return self._module().normcase(self._path) < other._module().normcase(str(other))

    def __truediv__(self, key):
        return type(self)(self._path, key)

    def __rtruediv__(self, key):
        return type(self)(key, self._path)

    @property
    def drive(self):
        return self._module().splitdrive(self._path)[0]

    @property
    def root(self):
        drive, tail = self._module().splitdrive(self._path)
        del drive
        separators = (self._module().sep,)
        if self._module().altsep is not None:
            separators += (self._module().altsep,)
        return self._module().sep if tail.startswith(separators) else ''

    @property
    def anchor(self):
        return self.drive + self.root

    @property
    def parts(self):
        module = self._module()
        drive, tail = module.splitdrive(module.normpath(self._path))
        root = module.sep if tail.startswith((module.sep, module.altsep or module.sep)) else ''
        if root:
            tail = tail.lstrip(module.sep)
            if module.altsep is not None:
                tail = tail.lstrip(module.altsep)
        values = [value for value in tail.replace(module.altsep or module.sep, module.sep).split(module.sep) if value]
        if drive or root:
            values.insert(0, drive + root)
        return tuple(values)

    @property
    def parent(self):
        parent = self._module().dirname(self._path)
        return type(self)(parent if parent else '.')

    @property
    def parents(self):
        answer = []
        current = self
        while True:
            parent = current.parent
            if parent == current:
                break
            answer.append(parent)
            current = parent
        return tuple(answer)

    @property
    def name(self):
        return self._module().basename(self._path)

    @property
    def suffix(self):
        name = self.name
        if name in ('', '.', '..'):
            return ''
        return self._module().splitext(name)[1]

    @property
    def suffixes(self):
        name = self.name
        if name.endswith('.'):
            return []
        answer = []
        while True:
            stem, suffix = self._module().splitext(name)
            if suffix == '':
                break
            answer.insert(0, suffix)
            name = stem
        return answer

    @property
    def stem(self):
        return self._module().splitext(self.name)[0]

    def as_posix(self):
        if self._module().sep == '/':
            return self._path
        answer = ''
        for character in self._path:
            answer += '/' if character == self._module().sep else character
        return answer

    def as_uri(self):
        if not self.is_absolute():
            raise ValueError('relative path cannot be expressed as a file URI')
        text = self.as_posix()
        escaped = ''
        safe = '/:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
        for byte in text.encode('utf8'):
            character = chr(byte)
            escaped += character if character in safe else '%' + hex(byte)[2:].upper().rjust(2, '0')
        if self._module() is ntpath:
            return 'file:///' + escaped.lstrip('/')
        return 'file://' + escaped

    def is_absolute(self):
        return self._module().isabs(self._path)

    def is_reserved(self):
        if self._module() is not ntpath:
            return False
        name = self.name.split('.')[0].upper()
        return name in (
            'CON', 'PRN', 'AUX', 'NUL',
            'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
            'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
        )

    def joinpath(self, *other):
        return type(self)(self._path, *other)

    def match(self, path_pattern, *, case_sensitive=None):
        pattern = _path_text(path_pattern)
        candidate = self.as_posix()
        if '/' not in pattern and '\\' not in pattern:
            candidate = self.name
        if case_sensitive is None:
            case_sensitive = self._module() is not ntpath
        if not case_sensitive:
            candidate = candidate.lower()
            pattern = pattern.lower()
        return fnmatch.fnmatchcase(candidate, pattern)

    def relative_to(self, other, *other_segments, walk_up=False):
        base = type(self)(other, *other_segments)
        relative = self._module().relpath(self._path, str(base))
        if not walk_up and (relative == '..' or relative.startswith('..' + self._module().sep)):
            raise ValueError(repr(self._path) + ' is not in the subpath of ' + repr(str(base)))
        return type(self)(relative)

    def is_relative_to(self, other, *other_segments):
        try:
            self.relative_to(other, *other_segments)
            return True
        except ValueError:
            return False

    def with_name(self, name):
        if not name or self._module().basename(name) != name:
            raise ValueError('Invalid name ' + repr(name))
        if self.name == '':
            raise ValueError('PurePath has an empty name')
        return type(self)(self._module().join(self._module().dirname(self._path), name))

    def with_stem(self, stem):
        return self.with_name(stem + self.suffix)

    def with_suffix(self, suffix):
        if suffix and (not suffix.startswith('.') or suffix == '.'):
            raise ValueError('Invalid suffix ' + repr(suffix))
        return self.with_name(self.stem + suffix)


class PurePosixPath(PurePath):
    _path_module = posixpath


class PureWindowsPath(PurePath):
    _path_module = ntpath


class Path(PurePath):
    @classmethod
    def cwd(cls):
        return cls(os.getcwd())

    @classmethod
    def home(cls):
        home = os.getenv('USERPROFILE') if os.name == 'nt' else os.getenv('HOME')
        if not home:
            raise RuntimeError('Could not determine home directory')
        return cls(home)

    def stat(self, *, follow_symlinks=True):
        return os.stat(self, follow_symlinks=follow_symlinks)

    def lstat(self):
        return os.lstat(self)

    def exists(self, *, follow_symlinks=True):
        try:
            self.stat(follow_symlinks=follow_symlinks)
            return True
        except OSError:
            return False

    def is_file(self, *, follow_symlinks=True):
        try:
            return self.stat(follow_symlinks=follow_symlinks)._is_file
        except OSError:
            return False

    def is_dir(self, *, follow_symlinks=True):
        try:
            return self.stat(follow_symlinks=follow_symlinks)._is_directory
        except OSError:
            return False

    def is_symlink(self):
        return os.path.islink(self)

    def open(
        self,
        mode='r',
        buffering=-1,
        encoding=None,
        errors=None,
        newline=None,
    ):
        return open(
            self,
            mode,
            buffering=buffering,
            encoding=encoding,
            errors=errors,
            newline=newline,
        )

    def read_bytes(self):
        with self.open('rb') as source:
            return source.read()

    def read_text(self, encoding=None, errors=None):
        with self.open('r', encoding=encoding, errors=errors) as source:
            return source.read()

    def write_bytes(self, data):
        with self.open('wb') as destination:
            return destination.write(data)

    def write_text(self, data, encoding=None, errors=None, newline=None):
        if not isinstance(data, str):
            raise TypeError('data must be str, not ' + type(data).__name__)
        with self.open(
            'w', encoding=encoding, errors=errors, newline=newline
        ) as destination:
            return destination.write(data)

    def iterdir(self):
        for name in os.listdir(self):
            yield self / name

    def glob(self, pattern, *, case_sensitive=None, recurse_symlinks=False):
        del case_sensitive, recurse_symlinks
        import glob
        for name in glob.iglob(
            os.fspath(pattern), root_dir=self, recursive=True
        ):
            yield self / name

    def rglob(self, pattern, *, case_sensitive=None, recurse_symlinks=False):
        del case_sensitive, recurse_symlinks
        return self.glob(os.path.join('**', os.fspath(pattern)))

    def walk(self, top_down=True, on_error=None, follow_symlinks=False):
        for entry in os.walk(
            self,
            topdown=top_down,
            onerror=on_error,
            followlinks=follow_symlinks,
        ):
            root = entry[0]
            directories = entry[1]
            files = entry[2]
            yield runtime.math_tuple([type(self)(root), directories, files])

    def mkdir(self, mode=0o777, parents=False, exist_ok=False):
        if parents:
            os.makedirs(self, mode=mode, exist_ok=exist_ok)
            return
        try:
            os.mkdir(self, mode)
        except FileExistsError:
            if not exist_ok or not self.is_dir():
                raise

    def touch(self, mode=0o666, exist_ok=True):
        if self.exists():
            if not exist_ok:
                raise FileExistsError(17, 'File exists', str(self))
            os.utime(self)
            return
        with open(self, 'xb'):
            pass
        os.chmod(self, mode)

    def chmod(self, mode, *, follow_symlinks=True):
        os.chmod(self, mode, follow_symlinks=follow_symlinks)

    def unlink(self, missing_ok=False):
        try:
            os.unlink(self)
        except FileNotFoundError:
            if not missing_ok:
                raise

    def rmdir(self):
        os.rmdir(self)

    def rename(self, target):
        os.rename(self, target)
        return type(self)(target)

    def replace(self, target):
        os.replace(self, target)
        return type(self)(target)

    def symlink_to(self, target, target_is_directory=False):
        os.symlink(target, self, target_is_directory)

    def hardlink_to(self, target):
        os.link(target, self)

    def readlink(self):
        return type(self)(os.readlink(self))

    def absolute(self):
        return type(self)(self._module().abspath(self._path))

    def resolve(self, strict=False):
        if strict and not self.exists():
            self.stat()
        return type(self)(self._module().realpath(self._path))

    def expanduser(self):
        if not self._path.startswith('~'):
            return self
        if self._path not in ('~',) and not self._path.startswith('~' + os.sep):
            raise RuntimeError('Could not determine home directory')
        return type(self)(str(type(self).home()) + self._path[1:])

    def samefile(self, other_path):
        return self._module().samefile(self, other_path)

    def is_mount(self):
        try:
            current = self.stat()
            parent = self.parent.stat()
        except OSError:
            return False
        return (
            current.st_dev != parent.st_dev
            or (
                current.st_ino == parent.st_ino
                and current.st_dev == parent.st_dev
            )
        )


class PosixPath(Path, PurePosixPath):
    _path_module = posixpath


class WindowsPath(Path, PureWindowsPath):
    _path_module = ntpath

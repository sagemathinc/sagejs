# Python standard library compatibility

Sage.js treats Python's standard library as a first-class compatibility
surface. Mathematical code is rarely isolated: it discovers files, reads
configuration from the environment, creates temporary working directories,
and composes paths before it begins a computation.

## Host architecture

Host access is explicit. Node.js evaluators install a capability object used
by ordinary CPython-parseable modules in `src/lib`; browser and WebAssembly
evaluators do not. Consequently, importing `os`, `posixpath`, or `ntpath` is
always safe. Pure path operations work everywhere, while an operation such as
`os.listdir()` raises `NotImplementedError` when the embedding host has not
provided filesystem access.

Each evaluator owns its current directory and environment snapshot. In
particular, `os.chdir()` never calls Node's process-wide `process.chdir()`.
This is required in worker threads and prevents concurrent Sage.js sessions
from changing one another's path resolution.

## Current `os` surface

The initial compatibility layer includes:

- native `name`, `sep`, `altsep`, `pathsep`, `linesep`, and `devnull`
  constants on POSIX and Windows;
- `os.path` with POSIX or NT semantics, plus directly importable `posixpath`,
  `ntpath`, and `genericpath` modules;
- `getcwd`, `chdir`, `listdir`, `scandir`, `walk`, `stat`, and `lstat`;
- `mkdir`, `makedirs`, `unlink`/`remove`, `rmdir`, `rename`, `replace`,
  `readlink`, and `access`;
- `environ`, `getenv`, `putenv`, and `unsetenv` with Windows-insensitive
  environment keys;
- `uname`, `getpid`, `cpu_count`, and cryptographically secure `urandom`.

Node filesystem errors are translated into `FileNotFoundError`,
`FileExistsError`, `PermissionError`, `IsADirectoryError`, and
`NotADirectoryError`, retaining `errno`, `filename`, and destination metadata.

## Conformance strategy

The semantic source is CPython. The path corpus and tests are derived from
CPython's `Lib/genericpath.py`, `Lib/posixpath.py`, `Lib/ntpath.py`, and their
tests at revision `7b4165b3b07638d8aeab79a880c52f2b51c56f37` (Python
3.15 development, PSF-2.0). Focused Sage.js tests run on Linux, macOS, and
native Windows CI:

```sh
pnpm test:stdlib
```

New modules should follow the same pattern: first define a small host-neutral
API, then add a Node implementation and an unavailable-host test, and finally
port focused CPython cases into a deterministic cross-platform corpus. Native
features must be capability-gated so extending desktop support never silently
breaks browser or WebAssembly embedding.

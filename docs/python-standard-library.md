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

## Built-in file I/O

The built-in `open()` uses the same evaluator-local filesystem capability as
`os`. Text modes `r`, `w`, `a`, and `x`, their `+` variants, and corresponding
binary modes are available. File objects support context managers, iteration,
`read`, `readline`, `readlines`, `write`, `writelines`, `seek`, `tell`,
`truncate`, `flush`, and `close`. UTF-8 is the default text encoding and
ordinary newline translation follows the host platform.

The initial implementation is synchronous and buffered in memory. It is
appropriate for source, configuration, interchange, and ordinary research
data files; streaming multi-gigabyte datasets and custom codecs remain future
work. Browser and WebAssembly embeddings without a filesystem capability can
still compile code using `open`, but calling it raises `NotImplementedError`.

## Data, encoding, hashing, and compression

The portable library includes exact-integer `json` encoding and decoding,
including hooks, custom numeric parsers, encoder defaults, indentation, and
file-object `load`/`dump`; `csv` readers, writers, dictionary adapters, and
dialects; and Base16, Base32, Base64, and URL-safe encodings.

Node hosts additionally provide `zlib`, `gzip`, and `hashlib` through explicit
compression and cryptographic capabilities. Gzip files support binary and
text context-manager I/O. Hash objects support incremental updates, copies,
binary and hexadecimal digests, SHA-2, SHA-3, SHAKE, BLAKE2, MD5, and SHA-1.
The pure checksums `zlib.crc32` and `zlib.adler32` remain portable. Embeddings
without the relevant host capability raise `NotImplementedError` only when a
host-backed operation is called.

The current zlib streaming objects buffer input until `flush(Z_FINISH)`;
incremental low-latency streaming and parameterized/keyed BLAKE2 are explicit
future extensions rather than silently approximate implementations.

## High-level filesystem modules

`pathlib` provides host `Path` objects plus portable `PurePath`,
`PurePosixPath`, and `PureWindowsPath` semantics. Concrete paths cover common
metadata queries, text and binary convenience I/O, directory iteration,
recursive globbing and walking, creation and removal, links, renaming,
resolution, and path transformations.

The `fnmatch` and `glob` modules support character classes, hidden-file rules,
`root_dir`, and recursive `**`. `tempfile` provides secure `mkstemp` and
`mkdtemp`, named and ordinary temporary files, spooled-file compatibility,
and automatically cleaned temporary directories. `shutil` includes streaming
and metadata-preserving copies, recursive copy/removal, moves, executable
lookup, ignore patterns, and disk usage. Their pure path components remain
browser-safe; concrete host operations use the same evaluator-local current
directory as `os` and `open`.

## Child processes

`subprocess` provides `run`, `Popen`, `call`, `check_call`, `check_output`,
`getoutput`, and `getstatusoutput`, together with `PIPE`, `STDOUT`, `DEVNULL`,
`CompletedProcess`, `CalledProcessError`, and `TimeoutExpired`. Arguments,
input, output/error capture and merging, text encodings, environment
replacement, working directories, exit checks, timeouts, and missing-command
errors follow Python's contracts on Linux, macOS, and Windows.

The initial Node backend executes eagerly with `spawnSync` and buffers child
output (up to 64 MiB), so `Popen.poll`, `wait`, and `communicate` expose an
already-completed process. This is deterministic and sufficient for most
agent and research pipelines. Live interactive pipes and signaling are a
future backend extension behind the same public API. Importing `subprocess`
without a process capability is safe; execution raises `NotImplementedError`.

## URLs and networking

`urllib.parse` is portable and includes structured URL parsing, joining,
defragmenting, quoting, query-string encoding, and query-string decoding.
`urllib.request` adds synchronous HTTP and HTTPS requests, redirects, request
headers and bodies, response metadata, HTTP errors with readable bodies,
openers, and file retrieval. `http.client` exposes the familiar buffered
`HTTPConnection` and `HTTPSConnection` request/response interface.

The initial `socket` module covers address lookup, IPv4 byte conversion,
byte-order helpers, `getaddrinfo`, and the common TCP
`connect`/`sendall`/`recv` client pattern. A socket exchange is currently
buffered and one-shot rather than a persistent bidirectional stream; server
sockets, UDP, TLS socket wrapping, and asynchronous readiness are explicit
future extensions.

Node hosts provide DNS, HTTP, HTTPS, and TCP through explicit worker-backed
capabilities. The evaluator may wait synchronously without blocking the host
event loop, so a local server and a Sage.js session can coexist in one Node
process. Imports and pure URL work remain safe in browser and WebAssembly
embeddings; attempting network I/O there raises `NotImplementedError` unless
the embedding installs an equivalent capability.

## Conformance strategy

The semantic source is CPython. The path corpus and tests are derived from
CPython's library sources and focused tests, initially covering path handling,
file I/O, JSON, CSV, Base64, zlib/gzip, hashlib, URL handling, HTTP clients,
and sockets, at revision
`7b4165b3b07638d8aeab79a880c52f2b51c56f37` (Python
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

export const WASI_ERRNO = Object.freeze({
  SUCCESS: 0,
  ACCES: 2,
  BADF: 8,
  EXIST: 20,
  FAULT: 21,
  FBIG: 27,
  INVAL: 28,
  IO: 29,
  ISDIR: 31,
  MFILE: 33,
  NAMETOOLONG: 37,
  NOENT: 44,
  NOSPC: 51,
  NOTDIR: 54,
  NOTEMPTY: 55,
  NOTSUP: 58,
  OVERFLOW: 61,
  PERM: 63,
  SPIPE: 70,
  NOTCAPABLE: 76,
});

export const WASI_FILETYPE = Object.freeze({
  UNKNOWN: 0,
  CHARACTER_DEVICE: 2,
  DIRECTORY: 3,
  REGULAR_FILE: 4,
});

export const WASI_OFLAGS = Object.freeze({
  CREAT: 1,
  DIRECTORY: 2,
  EXCL: 4,
  TRUNC: 8,
});

export const WASI_FDFLAGS = Object.freeze({
  APPEND: 1,
  DSYNC: 2,
  NONBLOCK: 4,
  RSYNC: 8,
  SYNC: 16,
});

export const WASI_LOOKUPFLAGS = Object.freeze({
  SYMLINK_FOLLOW: 1,
});

export const WASI_WHENCE = Object.freeze({
  SET: 0,
  CUR: 1,
  END: 2,
});

export const WASI_CLOCK = Object.freeze({
  REALTIME: 0,
  MONOTONIC: 1,
  PROCESS_CPUTIME_ID: 2,
  THREAD_CPUTIME_ID: 3,
});

export const WASI_RIGHTS = Object.freeze({
  FD_DATASYNC: 1n << 0n,
  FD_READ: 1n << 1n,
  FD_SEEK: 1n << 2n,
  FD_FDSTAT_SET_FLAGS: 1n << 3n,
  FD_SYNC: 1n << 4n,
  FD_TELL: 1n << 5n,
  FD_WRITE: 1n << 6n,
  FD_ADVISE: 1n << 7n,
  FD_ALLOCATE: 1n << 8n,
  PATH_CREATE_DIRECTORY: 1n << 9n,
  PATH_CREATE_FILE: 1n << 10n,
  PATH_LINK_SOURCE: 1n << 11n,
  PATH_LINK_TARGET: 1n << 12n,
  PATH_OPEN: 1n << 13n,
  FD_READDIR: 1n << 14n,
  PATH_READLINK: 1n << 15n,
  PATH_RENAME_SOURCE: 1n << 16n,
  PATH_RENAME_TARGET: 1n << 17n,
  PATH_FILESTAT_GET: 1n << 18n,
  PATH_FILESTAT_SET_SIZE: 1n << 19n,
  PATH_FILESTAT_SET_TIMES: 1n << 20n,
  FD_FILESTAT_GET: 1n << 21n,
  FD_FILESTAT_SET_SIZE: 1n << 22n,
  FD_FILESTAT_SET_TIMES: 1n << 23n,
  PATH_SYMLINK: 1n << 24n,
  PATH_REMOVE_DIRECTORY: 1n << 25n,
  PATH_UNLINK_FILE: 1n << 26n,
  POLL_FD_READWRITE: 1n << 27n,
  SOCK_SHUTDOWN: 1n << 28n,
  SOCK_ACCEPT: 1n << 29n,
});

export const WASI_REGULAR_FILE_RIGHTS =
  WASI_RIGHTS.FD_DATASYNC |
  WASI_RIGHTS.FD_READ |
  WASI_RIGHTS.FD_SEEK |
  WASI_RIGHTS.FD_FDSTAT_SET_FLAGS |
  WASI_RIGHTS.FD_SYNC |
  WASI_RIGHTS.FD_TELL |
  WASI_RIGHTS.FD_WRITE |
  WASI_RIGHTS.FD_ADVISE |
  WASI_RIGHTS.FD_ALLOCATE |
  WASI_RIGHTS.FD_FILESTAT_GET |
  WASI_RIGHTS.FD_FILESTAT_SET_SIZE |
  WASI_RIGHTS.FD_FILESTAT_SET_TIMES |
  WASI_RIGHTS.POLL_FD_READWRITE;

export const WASI_DIRECTORY_RIGHTS =
  WASI_RIGHTS.PATH_CREATE_FILE |
  WASI_RIGHTS.PATH_OPEN |
  WASI_RIGHTS.FD_READDIR |
  WASI_RIGHTS.PATH_FILESTAT_GET |
  WASI_RIGHTS.PATH_FILESTAT_SET_SIZE |
  WASI_RIGHTS.PATH_FILESTAT_SET_TIMES |
  WASI_RIGHTS.PATH_REMOVE_DIRECTORY |
  WASI_RIGHTS.PATH_UNLINK_FILE |
  WASI_RIGHTS.FD_FILESTAT_GET;

export const WASI_IMPLEMENTED_IMPORTS = Object.freeze([
  "clock_time_get",
  "fd_close",
  "fd_fdstat_get",
  "fd_fdstat_set_flags",
  "fd_prestat_dir_name",
  "fd_prestat_get",
  "fd_read",
  "fd_seek",
  "fd_write",
  "path_open",
  "path_remove_directory",
  "path_unlink_file",
  "proc_exit",
]);

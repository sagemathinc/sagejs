import {
  WASI_CLOCK,
  WASI_ERRNO,
  WASI_IMPLEMENTED_IMPORTS,
  WASI_LOOKUPFLAGS,
} from "./wasi-constants.mjs";
import {
  BoundedWasiFilesystem,
  WasiFilesystemError,
} from "./wasi-filesystem.mjs";

export const WASI_MEMORY_FILESYSTEM_LIMITS = Object.freeze({
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxFiles: 256,
});

export const WASI_OUTPUT_LIMITS = Object.freeze({
  maxStdoutBytes: 1024 * 1024,
  maxStderrBytes: 1024 * 1024,
});

export { WASI_IMPLEMENTED_IMPORTS };

export class WasiExitError extends Error {
  constructor(status) {
    super(`FLINT WASM requested process exit ${status}`);
    this.name = "WasiExitError";
    this.status = status >>> 0;
  }
}

class WasiAbiError extends Error {
  constructor(errno, message) {
    super(message);
    this.name = "WasiAbiError";
    this.errno = errno;
  }
}

function defaultOutput(method, text) {
  if (text) console[method](text);
}

function asSafeUnsigned(value, name) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new WasiAbiError(WASI_ERRNO.FAULT, `${name} is outside Wasm32 memory`);
  }
  return value;
}

function createOutputSink({ stdout, stderr } = {}) {
  const state = {
    stdout: { bytes: 0, truncated: false, decoder: new TextDecoder() },
    stderr: { bytes: 0, truncated: false, decoder: new TextDecoder() },
  };
  const callbacks = {
    stdout: stdout ?? ((text) => defaultOutput("log", text)),
    stderr: stderr ?? ((text) => defaultOutput("error", text)),
  };
  const limits = {
    stdout: WASI_OUTPUT_LIMITS.maxStdoutBytes,
    stderr: WASI_OUTPUT_LIMITS.maxStderrBytes,
  };
  return {
    write(kind, bytes) {
      const entry = state[kind];
      const remaining = Math.max(0, limits[kind] - entry.bytes);
      const accepted = bytes.subarray(0, remaining);
      entry.bytes += accepted.byteLength;
      if (accepted.byteLength < bytes.byteLength) entry.truncated = true;
      if (accepted.byteLength > 0) {
        const text = entry.decoder.decode(accepted, { stream: true });
        if (text) callbacks[kind](text);
      }
    },
    usage() {
      return Object.freeze({
        stdoutBytes: state.stdout.bytes,
        stderrBytes: state.stderr.bytes,
        stdoutTruncated: state.stdout.truncated,
        stderrTruncated: state.stderr.truncated,
      });
    },
    close() {
      for (const kind of ["stdout", "stderr"]) {
        const text = state[kind].decoder.decode();
        if (text) callbacks[kind](text);
      }
    },
  };
}

/**
 * Construct the bounded WASI Preview 1 host used by Sage.js's static reactors.
 *
 * This is deliberately not a Node `fs` compatibility layer. It implements the
 * exact descriptor imports observed in authenticated production modules and a
 * private evaluator-local temporary filesystem.
 */
export function createWasiHost(options = {}) {
  const filesystem = new BoundedWasiFilesystem(WASI_MEMORY_FILESYSTEM_LIMITS);
  const output = createOutputSink(options);
  let memory = null;
  let initialized = false;
  let disposed = false;

  function assertLive() {
    if (disposed) throw new Error("WASI host is disposed");
  }

  function memoryView() {
    assertLive();
    if (!(memory instanceof WebAssembly.Memory)) {
      throw new WasiAbiError(WASI_ERRNO.FAULT, "WASI memory is not attached");
    }
    return new DataView(memory.buffer);
  }

  function memoryBytes(pointer, length) {
    const start = asSafeUnsigned(pointer, "pointer");
    const count = asSafeUnsigned(length, "length");
    const end = start + count;
    if (!Number.isSafeInteger(end) || end > memoryView().byteLength) {
      throw new WasiAbiError(WASI_ERRNO.FAULT, "guest memory range is invalid");
    }
    return new Uint8Array(memory.buffer, start, count);
  }

  function writeU32(pointer, value) {
    const view = memoryView();
    memoryBytes(pointer, 4);
    view.setUint32(pointer, value >>> 0, true);
  }

  function writeU64(pointer, value) {
    const view = memoryView();
    memoryBytes(pointer, 8);
    view.setBigUint64(pointer, BigInt(value), true);
  }

  function iovecs(pointer, count, { writable }) {
    const total = asSafeUnsigned(count, "iovec count") * 8;
    const table = memoryBytes(pointer, total);
    const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
    const result = [];
    for (let index = 0; index < count; index += 1) {
      const address = view.getUint32(index * 8, true);
      const length = view.getUint32(index * 8 + 4, true);
      const bytes = memoryBytes(address, length);
      result.push(writable ? bytes : new Uint8Array(bytes));
    }
    return result;
  }

  function errno(callback) {
    try {
      assertLive();
      callback();
      return WASI_ERRNO.SUCCESS;
    } catch (error) {
      if (error instanceof WasiFilesystemError || error instanceof WasiAbiError) {
        return error.errno;
      }
      throw error;
    }
  }

  const wasi = {
    clock_time_get(clockId, _precision, resultPointer) {
      return errno(() => {
        let nanoseconds;
        if (clockId === WASI_CLOCK.REALTIME) {
          nanoseconds = BigInt(Date.now()) * 1_000_000n;
        } else if (clockId === WASI_CLOCK.MONOTONIC ||
                   clockId === WASI_CLOCK.PROCESS_CPUTIME_ID ||
                   clockId === WASI_CLOCK.THREAD_CPUTIME_ID) {
          nanoseconds = BigInt(Math.trunc(globalThis.performance.now() * 1_000_000));
        } else {
          throw new WasiAbiError(WASI_ERRNO.INVAL, "unsupported clock id");
        }
        writeU64(resultPointer, nanoseconds);
      });
    },

    fd_close(fd) {
      return errno(() => filesystem.close(fd));
    },

    fd_fdstat_get(fd, resultPointer) {
      return errno(() => {
        const stat = filesystem.stat(fd);
        const bytes = memoryBytes(resultPointer, 24);
        bytes.fill(0);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        view.setUint8(0, stat.filetype);
        view.setUint16(2, stat.flags, true);
        view.setBigUint64(8, stat.rightsBase, true);
        view.setBigUint64(16, stat.rightsInheriting, true);
      });
    },

    fd_fdstat_set_flags(fd, flags) {
      return errno(() => filesystem.setFlags(fd, flags));
    },

    fd_prestat_get(fd, resultPointer) {
      return errno(() => {
        const descriptor = filesystem.descriptor(fd);
        if (!descriptor.preopenPath) {
          throw new WasiFilesystemError(WASI_ERRNO.BADF, "descriptor is not a preopen");
        }
        const bytes = memoryBytes(resultPointer, 8);
        bytes.fill(0);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        view.setUint8(0, 0);
        view.setUint32(4, new TextEncoder().encode(descriptor.preopenPath).byteLength, true);
      });
    },

    fd_prestat_dir_name(fd, pathPointer, pathLength) {
      return errno(() => {
        const descriptor = filesystem.descriptor(fd);
        if (!descriptor.preopenPath) {
          throw new WasiFilesystemError(WASI_ERRNO.BADF, "descriptor is not a preopen");
        }
        const name = new TextEncoder().encode(descriptor.preopenPath);
        if (pathLength < name.byteLength) {
          throw new WasiAbiError(WASI_ERRNO.NAMETOOLONG, "preopen buffer is too small");
        }
        memoryBytes(pathPointer, pathLength).set(name);
      });
    },

    fd_read(fd, iovecPointer, iovecCount, readPointer) {
      return errno(() => {
        memoryBytes(readPointer, 4);
        const targets = iovecs(iovecPointer, iovecCount, { writable: true });
        writeU32(readPointer, filesystem.read(fd, targets));
      });
    },

    fd_seek(fd, offset, whence, resultPointer) {
      return errno(() => {
        memoryBytes(resultPointer, 8);
        writeU64(resultPointer, filesystem.seek(fd, offset, whence));
      });
    },

    fd_write(fd, iovecPointer, iovecCount, writtenPointer) {
      return errno(() => {
        memoryBytes(writtenPointer, 4);
        const sources = iovecs(iovecPointer, iovecCount, { writable: false });
        const written = filesystem.write(
          fd,
          sources,
          (kind, bytes) => output.write(kind, bytes),
        );
        writeU32(writtenPointer, written);
      });
    },

    path_open(
      directoryFd,
      directoryFlags,
      pathPointer,
      pathLength,
      oflags,
      rightsBase,
      rightsInheriting,
      fdflags,
      resultPointer,
    ) {
      return errno(() => {
        memoryBytes(resultPointer, 4);
        if (!Number.isSafeInteger(directoryFlags) || directoryFlags < 0 ||
            (directoryFlags & ~WASI_LOOKUPFLAGS.SYMLINK_FOLLOW) !== 0) {
          throw new WasiAbiError(WASI_ERRNO.INVAL, "unsupported path lookup flags");
        }
        const path = new Uint8Array(memoryBytes(pathPointer, pathLength));
        const opened = filesystem.openAt(
          directoryFd,
          path,
          oflags,
          BigInt(rightsBase),
          BigInt(rightsInheriting),
          fdflags,
        );
        writeU32(resultPointer, opened);
      });
    },

    path_remove_directory(fd, pathPointer, pathLength) {
      return errno(() => filesystem.removeDirectoryAt(
        fd,
        new Uint8Array(memoryBytes(pathPointer, pathLength)),
      ));
    },

    path_unlink_file(fd, pathPointer, pathLength) {
      return errno(() => filesystem.unlinkAt(
        fd,
        new Uint8Array(memoryBytes(pathPointer, pathLength)),
      ));
    },

    proc_exit(status) {
      assertLive();
      throw new WasiExitError(status);
    },
  };

  const actualImports = Object.keys(wasi).sort();
  if (JSON.stringify(actualImports) !== JSON.stringify([...WASI_IMPLEMENTED_IMPORTS].sort())) {
    throw new Error("first-party WASI implementation differs from its import inventory");
  }

  return Object.freeze({
    imports: Object.freeze(wasi),
    filesystemLimits: WASI_MEMORY_FILESYSTEM_LIMITS,
    filesystemUsage: () => filesystem.usage(),
    outputLimits: WASI_OUTPUT_LIMITS,
    outputUsage: () => output.usage(),
    testing: filesystem.testing(),
    initialize(instance) {
      assertLive();
      if (initialized) throw new Error("WASI reactor is already initialized");
      if (!(instance?.exports?.memory instanceof WebAssembly.Memory)) {
        throw new TypeError("WASI reactor must export WebAssembly.Memory");
      }
      memory = instance.exports.memory;
      initialized = true;
      instance.exports._initialize?.();
    },
    attachMemory(value) {
      assertLive();
      if (initialized || memory !== null) throw new Error("WASI memory is already attached");
      if (!(value instanceof WebAssembly.Memory)) {
        throw new TypeError("attachMemory requires WebAssembly.Memory");
      }
      memory = value;
    },
    dispose() {
      if (disposed) return;
      output.close();
      filesystem.dispose();
      memory = null;
      disposed = true;
    },
  });
}

export function wasiRuntimePolicy() {
  return WASI_MEMORY_FILESYSTEM_LIMITS;
}

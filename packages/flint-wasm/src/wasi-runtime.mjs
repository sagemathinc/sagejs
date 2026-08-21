import { Volume, createFsFromVolume } from "@cowasm/memfs";
import path from "path-browserify";
import wasiModule from "wasi-js/dist/wasi.js";

const decoder = new TextDecoder();
const WASI = wasiModule.default;

export const WASI_MEMORY_FILESYSTEM_LIMITS = Object.freeze({
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxFiles: 256,
});

function filesystemLimitError(message) {
  const error = new Error(message);
  error.code = "ENOSPC";
  error.errno = -28;
  error.syscall = "write";
  return error;
}

function createBoundedVolume(limits) {
  const volume = new Volume();
  let fileCount = 0;
  let totalBytes = 0;

  function checkSize(previousSize, nextSize) {
    if (!Number.isSafeInteger(nextSize) || nextSize < 0) {
      throw new RangeError("memory filesystem size must be a nonnegative integer");
    }
    if (nextSize > limits.maxFileBytes) {
      throw filesystemLimitError(
        `memory filesystem file exceeds ${limits.maxFileBytes} bytes`,
      );
    }
    if (totalBytes - previousSize + nextSize > limits.maxTotalBytes) {
      throw filesystemLimitError(
        `memory filesystem exceeds ${limits.maxTotalBytes} total bytes`,
      );
    }
  }

  function guardFileNode(node) {
    const originalSetBuffer = node.setBuffer.bind(node);
    const originalWrite = node.write.bind(node);
    const originalTruncate = node.truncate.bind(node);

    node.setBuffer = (buffer) => {
      const previousSize = node.getSize();
      checkSize(previousSize, buffer.byteLength);
      originalSetBuffer(buffer);
      totalBytes += node.getSize() - previousSize;
    };
    node.write = (buffer, offset = 0, length = buffer.length, position = 0) => {
      const previousSize = node.getSize();
      checkSize(previousSize, Math.max(previousSize, position + length));
      const written = originalWrite(buffer, offset, length, position);
      totalBytes += node.getSize() - previousSize;
      return written;
    };
    node.truncate = (length = 0) => {
      const previousSize = node.getSize();
      checkSize(previousSize, length);
      originalTruncate(length);
      totalBytes += node.getSize() - previousSize;
    };
  }

  const originalCreateNode = volume.createNode.bind(volume);
  volume.createNode = (isDirectory = false, permissions) => {
    if (!isDirectory && fileCount >= limits.maxFiles) {
      throw filesystemLimitError(
        `memory filesystem exceeds ${limits.maxFiles} files`,
      );
    }
    const node = originalCreateNode(isDirectory, permissions);
    if (!isDirectory) {
      fileCount += 1;
      guardFileNode(node);
    }
    return node;
  };

  const originalDeleteNode = volume.deleteNode.bind(volume);
  volume.deleteNode = (node) => {
    if (!node.isDirectory()) {
      fileCount -= 1;
      totalBytes -= node.getSize();
    }
    return originalDeleteNode(node);
  };

  volume.mkdirSync("/tmp");
  return {
    volume,
    usage: () => Object.freeze({ fileCount, totalBytes }),
  };
}

function randomFillSync(target) {
  globalThis.crypto.getRandomValues(target);
  return target;
}

function writeConsole(method, data) {
  const text = decoder.decode(data);
  if (text) {
    console[method](text);
  }
}

/**
 * Construct the browser-safe WASI host used by the FLINT reactor.
 *
 * CoWasm's WASI implementation translates the WASI descriptor API onto a
 * Node-compatible filesystem. Its @cowasm/memfs backend keeps files private
 * to this evaluator and supplies the temporary-file semantics used by FLINT's
 * quadratic sieve.
 */
export function createWasiHost() {
  const limits = WASI_MEMORY_FILESYSTEM_LIMITS;
  const { volume, usage } = createBoundedVolume(limits);
  const fs = createFsFromVolume(volume);
  const wasi = new WASI({
    args: [],
    env: {},
    preopens: { "/": "/" },
    bindings: {
      fs,
      path,
      hrtime: () =>
        BigInt(Math.trunc(globalThis.performance.now() * 1_000_000)),
      exit: (status) => {
        throw new Error(`FLINT WASM requested process exit ${status}`);
      },
      kill: (signal) => {
        throw new Error(`FLINT WASM requested signal ${signal}`);
      },
      randomFillSync,
      isTTY: () => false,
    },
    sendStdout: (data) => writeConsole("log", data),
    sendStderr: (data) => writeConsole("error", data),
  });

  return {
    imports: wasi.wasiImport,
    filesystem: fs,
    filesystemLimits: limits,
    filesystemUsage: usage,
    initialize(instance) {
      wasi.setMemory(instance.exports.memory);
      instance.exports._initialize?.();
    },
  };
}

export function wasiRuntimePolicy() {
  return WASI_MEMORY_FILESYSTEM_LIMITS;
}

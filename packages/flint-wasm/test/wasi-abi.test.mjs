import assert from "node:assert/strict";
import test from "node:test";

import {
  WASI_DIRECTORY_RIGHTS,
  WASI_ERRNO,
  WASI_FDFLAGS,
  WASI_OFLAGS,
  WASI_REGULAR_FILE_RIGHTS,
  WASI_RIGHTS,
  WASI_WHENCE,
} from "../src/wasi-constants.mjs";
import {
  WASI_IMPLEMENTED_IMPORTS,
  WasiExitError,
  createWasiHost,
} from "../src/wasi-runtime.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fixture() {
  const host = createWasiHost();
  const memory = new WebAssembly.Memory({ initial: 2, maximum: 2 });
  host.attachMemory(memory);
  const bytes = new Uint8Array(memory.buffer);
  const view = new DataView(memory.buffer);
  const write = (pointer, value) => {
    const encoded = typeof value === "string" ? encoder.encode(value) : value;
    bytes.set(encoded, pointer);
    return encoded.byteLength;
  };
  const iovec = (pointer, dataPointer, length) => {
    view.setUint32(pointer, dataPointer, true);
    view.setUint32(pointer + 4, length, true);
  };
  return { host, wasi: host.imports, memory, bytes, view, write, iovec };
}

test("the first-party host exposes exactly the authenticated import inventory", () => {
  const host = createWasiHost();
  assert.deepEqual(Object.keys(host.imports).sort(), [...WASI_IMPLEMENTED_IMPORTS].sort());
  assert.equal("random_get" in host.imports, false);
  host.dispose();
});

test("WASI file calls implement create, write, seek, read, and unlink-open semantics", () => {
  const { host, wasi, bytes, view, write, iovec } = fixture();
  const pathPointer = 128;
  const resultPointer = 64;
  const pathLength = write(pathPointer, "tmp/probe");
  assert.equal(wasi.path_open(
    3, 0, pathPointer, pathLength, WASI_OFLAGS.CREAT,
    WASI_REGULAR_FILE_RIGHTS, 0n, 0, resultPointer,
  ), WASI_ERRNO.SUCCESS);
  const fd = view.getUint32(resultPointer, true);

  const contents = encoder.encode("finite field arithmetic\n");
  bytes.set(contents, 512);
  iovec(256, 512, contents.byteLength);
  assert.equal(wasi.fd_write(fd, 256, 1, 72), WASI_ERRNO.SUCCESS);
  assert.equal(view.getUint32(72, true), contents.byteLength);
  assert.equal(wasi.fd_seek(fd, 0n, WASI_WHENCE.SET, 80), WASI_ERRNO.SUCCESS);
  assert.equal(view.getBigUint64(80, true), 0n);

  iovec(264, 768, contents.byteLength);
  assert.equal(wasi.fd_read(fd, 264, 1, 88), WASI_ERRNO.SUCCESS);
  assert.equal(view.getUint32(88, true), contents.byteLength);
  assert.equal(decoder.decode(bytes.subarray(768, 768 + contents.byteLength)), decoder.decode(contents));

  assert.equal(wasi.path_unlink_file(3, pathPointer, pathLength), WASI_ERRNO.SUCCESS);
  assert.equal(host.filesystemUsage().fileCount, 1);
  assert.equal(host.filesystemUsage().totalBytes, contents.byteLength);
  assert.equal(wasi.fd_close(fd), WASI_ERRNO.SUCCESS);
  assert.deepEqual(host.filesystemUsage(), {
    fileCount: 0,
    totalBytes: 0,
    openDescriptors: 4,
  });
  host.dispose();
});

test("wasi-libc may request the complete inheriting-rights mask for a file", () => {
  const { host, wasi, view, write } = fixture();
  const pathPointer = 128;
  const pathLength = write(pathPointer, "tmp/mkstemp-compatible");
  const requested = WASI_REGULAR_FILE_RIGHTS | WASI_DIRECTORY_RIGHTS;
  assert.equal(wasi.path_open(
    3, 0, pathPointer, pathLength, WASI_OFLAGS.CREAT | WASI_OFLAGS.EXCL,
    requested, requested, 0, 64,
  ), WASI_ERRNO.SUCCESS);
  const fd = view.getUint32(64, true);
  assert.equal(wasi.path_open(
    fd, 0, pathPointer, pathLength, 0,
    WASI_REGULAR_FILE_RIGHTS, 0n, 0, 72,
  ), WASI_ERRNO.NOTDIR);
  assert.equal(wasi.fd_close(fd), WASI_ERRNO.SUCCESS);
  host.dispose();
});

test("faults and rejected paths do not mutate descriptor or quota state", () => {
  const { host, wasi, view, write } = fixture();
  const pathPointer = 128;
  const pathLength = write(pathPointer, "tmp/transactional");
  const before = host.filesystemUsage();
  assert.equal(wasi.path_open(
    3, 0, pathPointer, pathLength, WASI_OFLAGS.CREAT,
    WASI_REGULAR_FILE_RIGHTS, 0n, 0, 0xffff_fffe,
  ), WASI_ERRNO.FAULT);
  assert.deepEqual(host.filesystemUsage(), before);

  const traversalLength = write(pathPointer, "../escape");
  assert.equal(wasi.path_open(
    3, 0, pathPointer, traversalLength, WASI_OFLAGS.CREAT,
    WASI_REGULAR_FILE_RIGHTS, 0n, 0, 64,
  ), WASI_ERRNO.ACCES);
  assert.deepEqual(host.filesystemUsage(), before);
  assert.equal(view.getUint32(64, true), 0);

  const validPathLength = write(pathPointer, "tmp/preserved");
  assert.equal(wasi.path_open(
    3, 0, pathPointer, validPathLength, WASI_OFLAGS.CREAT,
    WASI_REGULAR_FILE_RIGHTS, 0n, 0, 64,
  ), WASI_ERRNO.SUCCESS);
  const fd = view.getUint32(64, true);
  write(512, "preserved");
  const preservedLength = encoder.encode("preserved").byteLength;
  view.setUint32(256, 512, true);
  view.setUint32(260, preservedLength, true);
  assert.equal(wasi.fd_write(fd, 256, 1, 72), WASI_ERRNO.SUCCESS);
  assert.equal(wasi.fd_close(fd), WASI_ERRNO.SUCCESS);

  const invalidRights = WASI_REGULAR_FILE_RIGHTS | (1n << 63n);
  assert.equal(wasi.path_open(
    3, 0, pathPointer, validPathLength, WASI_OFLAGS.TRUNC,
    invalidRights, 0n, 0, 64,
  ), WASI_ERRNO.NOTCAPABLE);
  assert.equal(wasi.path_open(
    3, 0, pathPointer, validPathLength, 0,
    WASI_REGULAR_FILE_RIGHTS, 0n, 0, 64,
  ), WASI_ERRNO.SUCCESS);
  const reopened = view.getUint32(64, true);
  view.setUint32(264, 768, true);
  view.setUint32(268, preservedLength, true);
  assert.equal(wasi.fd_read(reopened, 264, 1, 76), WASI_ERRNO.SUCCESS);
  assert.equal(decoder.decode(new Uint8Array(
    view.buffer,
    768,
    view.getUint32(76, true),
  )), "preserved");
  assert.equal(wasi.fd_close(reopened), WASI_ERRNO.SUCCESS);
  const beforeRejectedCreate = host.filesystemUsage();
  const rejectedLength = write(pathPointer, "tmp/not-created");
  assert.equal(wasi.path_open(
    3, 0, pathPointer, rejectedLength, WASI_OFLAGS.CREAT,
    invalidRights, 0n, 0, 64,
  ), WASI_ERRNO.NOTCAPABLE);
  assert.deepEqual(host.filesystemUsage(), beforeRejectedCreate);
  assert.equal(wasi.path_open(
    3, 0, pathPointer, rejectedLength, 0,
    WASI_REGULAR_FILE_RIGHTS, 0n, 0, 64,
  ), WASI_ERRNO.NOENT);
  host.dispose();
});

test("scatter/gather I/O is transactional and implements sparse, append, and truncate semantics", () => {
  const { host, wasi, bytes, view, write, iovec } = fixture();
  const pathPointer = 128;
  const pathLength = write(pathPointer, "tmp/io-semantics");
  assert.equal(wasi.path_open(
    3, 0, pathPointer, pathLength, WASI_OFLAGS.CREAT,
    WASI_REGULAR_FILE_RIGHTS, 0n, 0, 64,
  ), WASI_ERRNO.SUCCESS);
  const fd = view.getUint32(64, true);

  assert.equal(wasi.fd_write(fd, 256, 0, 72), WASI_ERRNO.SUCCESS);
  assert.equal(view.getUint32(72, true), 0);
  assert.equal(wasi.fd_read(fd, 256, 0, 88), WASI_ERRNO.SUCCESS);
  assert.equal(view.getUint32(88, true), 0);

  write(512, "abc");
  iovec(256, 512, 2);
  iovec(264, 513, 2);
  assert.equal(wasi.fd_write(fd, 256, 2, 72), WASI_ERRNO.SUCCESS);
  assert.equal(view.getUint32(72, true), 4);

  assert.equal(wasi.fd_seek(fd, 8n, WASI_WHENCE.SET, 80), WASI_ERRNO.SUCCESS);
  write(520, "z");
  iovec(256, 520, 1);
  assert.equal(wasi.fd_write(fd, 256, 1, 72), WASI_ERRNO.SUCCESS);
  assert.equal(wasi.fd_seek(fd, 0n, WASI_WHENCE.SET, 80), WASI_ERRNO.SUCCESS);

  // Validate every iovec before moving the cursor or copying guest bytes.
  iovec(256, 768, 3);
  iovec(264, 0xffff_fff0, 32);
  assert.equal(wasi.fd_read(fd, 256, 2, 88), WASI_ERRNO.FAULT);
  assert.equal(wasi.fd_seek(fd, 0n, WASI_WHENCE.CUR, 80), WASI_ERRNO.SUCCESS);
  assert.equal(view.getBigUint64(80, true), 0n);

  iovec(256, 768, 3);
  iovec(264, 800, 8);
  assert.equal(wasi.fd_read(fd, 256, 2, 88), WASI_ERRNO.SUCCESS);
  assert.equal(view.getUint32(88, true), 9);
  assert.equal(decoder.decode(bytes.subarray(768, 771)), "abb");
  assert.deepEqual([...bytes.subarray(800, 806)], [99, 0, 0, 0, 0, 122]);
  assert.equal(wasi.fd_read(fd, 256, 2, 88), WASI_ERRNO.SUCCESS);
  assert.equal(view.getUint32(88, true), 0);

  assert.equal(wasi.fd_seek(fd, -1n, WASI_WHENCE.SET, 80), WASI_ERRNO.INVAL);
  assert.equal(wasi.fd_seek(fd, 0n, WASI_WHENCE.CUR, 80), WASI_ERRNO.SUCCESS);
  assert.equal(view.getBigUint64(80, true), 9n);
  assert.equal(wasi.fd_fdstat_set_flags(fd, WASI_FDFLAGS.APPEND), WASI_ERRNO.SUCCESS);
  assert.equal(wasi.fd_seek(fd, 0n, WASI_WHENCE.SET, 80), WASI_ERRNO.SUCCESS);
  write(520, "!");
  iovec(256, 520, 1);
  assert.equal(wasi.fd_write(fd, 256, 1, 72), WASI_ERRNO.SUCCESS);
  assert.equal(host.filesystemUsage().totalBytes, 10);
  assert.equal(wasi.fd_fdstat_set_flags(fd, 1 << 15), WASI_ERRNO.NOTSUP);

  assert.equal(wasi.fd_close(fd), WASI_ERRNO.SUCCESS);
  assert.equal(wasi.fd_read(fd, 256, 1, 88), WASI_ERRNO.BADF);
  assert.equal(wasi.path_open(
    3, 0, pathPointer, pathLength, WASI_OFLAGS.TRUNC,
    WASI_REGULAR_FILE_RIGHTS, 0n, 0, 64,
  ), WASI_ERRNO.SUCCESS);
  const truncated = view.getUint32(64, true);
  assert.notEqual(truncated, fd);
  assert.equal(host.filesystemUsage().totalBytes, 0);
  iovec(256, 768, 1);
  assert.equal(wasi.fd_read(truncated, 256, 1, 88), WASI_ERRNO.SUCCESS);
  assert.equal(view.getUint32(88, true), 0);
  assert.equal(wasi.fd_close(truncated), WASI_ERRNO.SUCCESS);
  host.dispose();
});

test("rights, lookup flags, and hostile paths fail with Preview 1 errnos", () => {
  const { host, wasi, view, write } = fixture();
  const pathPointer = 128;
  const resultPointer = 64;
  const before = host.filesystemUsage();
  const open = (value, { lookupFlags = 0, rights = WASI_RIGHTS.FD_READ } = {}) => {
    const length = write(pathPointer, value);
    return wasi.path_open(
      3, lookupFlags, pathPointer, length, WASI_OFLAGS.CREAT,
      rights, 0n, 0, resultPointer,
    );
  };

  assert.equal(open("tmp/invalid-lookup", { lookupFlags: 2 }), WASI_ERRNO.INVAL);
  assert.equal(wasi.path_open(
    3, 0, pathPointer, 0, WASI_OFLAGS.CREAT,
    WASI_RIGHTS.FD_READ, 0n, 0, resultPointer,
  ), WASI_ERRNO.INVAL);
  assert.equal(open("/tmp/absolute"), WASI_ERRNO.ACCES);
  assert.equal(open("tmp/../escape"), WASI_ERRNO.ACCES);
  assert.equal(open("tmp\\escape"), WASI_ERRNO.ACCES);
  assert.equal(open(new Uint8Array([0x74, 0x6d, 0x70, 0, 0x78])), WASI_ERRNO.INVAL);
  assert.equal(open(new Uint8Array([0xc3, 0x28])), WASI_ERRNO.INVAL);
  assert.deepEqual(host.filesystemUsage(), before);

  assert.equal(open("tmp//./read-only"), WASI_ERRNO.SUCCESS);
  const readOnly = view.getUint32(resultPointer, true);
  assert.equal(wasi.fd_write(readOnly, 256, 0, 72), WASI_ERRNO.NOTCAPABLE);
  assert.equal(wasi.fd_seek(readOnly, 0n, WASI_WHENCE.SET, 80), WASI_ERRNO.NOTCAPABLE);
  assert.equal(wasi.fd_fdstat_set_flags(readOnly, WASI_FDFLAGS.APPEND), WASI_ERRNO.NOTCAPABLE);
  assert.equal(wasi.fd_close(readOnly), WASI_ERRNO.SUCCESS);
  host.dispose();
});

test("stdout is bounded without partial UTF-8 accumulation or guest failure", () => {
  let observed = "";
  const host = createWasiHost({ stdout: (text) => { observed += text; } });
  const memory = new WebAssembly.Memory({ initial: 18, maximum: 18 });
  host.attachMemory(memory);
  const bytes = new Uint8Array(memory.buffer);
  const view = new DataView(memory.buffer);
  const length = host.outputLimits.maxStdoutBytes + 17;
  bytes.fill(0x61, 1024, 1024 + length);
  view.setUint32(64, 1024, true);
  view.setUint32(68, length, true);
  assert.equal(host.imports.fd_write(1, 64, 1, 80), WASI_ERRNO.SUCCESS);
  assert.equal(view.getUint32(80, true), length);
  assert.deepEqual(host.outputUsage(), {
    stdoutBytes: host.outputLimits.maxStdoutBytes,
    stderrBytes: 0,
    stdoutTruncated: true,
    stderrTruncated: false,
  });
  assert.equal(observed.length, host.outputLimits.maxStdoutBytes);
  host.dispose();
});

test("invalid clocks and process exit fail with typed, non-host-terminating results", () => {
  const { host, wasi } = fixture();
  assert.equal(wasi.clock_time_get(99, 0n, 64), WASI_ERRNO.INVAL);
  assert.throws(
    () => wasi.proc_exit(17),
    (error) => error instanceof WasiExitError && error.status === 17,
  );
  host.dispose();
});

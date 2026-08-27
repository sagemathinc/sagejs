import {
  WASI_DIRECTORY_RIGHTS,
  WASI_ERRNO,
  WASI_FDFLAGS,
  WASI_FILETYPE,
  WASI_OFLAGS,
  WASI_REGULAR_FILE_RIGHTS,
  WASI_RIGHTS,
} from "./wasi-constants.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export class WasiFilesystemError extends Error {
  constructor(errno, message) {
    super(message);
    this.name = "WasiFilesystemError";
    this.errno = errno;
    this.code = errno === WASI_ERRNO.NOSPC || errno === WASI_ERRNO.FBIG
      ? "ENOSPC"
      : "EWASI";
  }
}

function directory(name, parent = null) {
  return { type: "directory", name, parent, entries: new Map() };
}

function regularFile(name, parent) {
  return {
    type: "file",
    name,
    parent,
    bytes: new Uint8Array(0),
    linked: true,
    openCount: 0,
    accounted: true,
  };
}

function fileType(node) {
  return node.type === "directory"
    ? WASI_FILETYPE.DIRECTORY
    : WASI_FILETYPE.REGULAR_FILE;
}

function hasRights(actual, requested) {
  return (requested & ~actual) === 0n;
}

function checkedFlags(value, allowed) {
  return Number.isSafeInteger(value) && value >= 0 && (value & ~allowed) === 0;
}

export class BoundedWasiFilesystem {
  #limits;
  #root;
  #descriptors = new Map();
  #nextDescriptor = 4;
  #fileCount = 0;
  #totalBytes = 0;
  #disposed = false;

  constructor(limits) {
    this.#limits = limits;
    this.#root = directory("");
    const temporary = directory("tmp", this.#root);
    this.#root.entries.set("tmp", temporary);
    this.#descriptors.set(0, {
      kind: "stdin",
      flags: 0,
      rightsBase: WASI_RIGHTS.FD_READ,
      rightsInheriting: 0n,
    });
    this.#descriptors.set(1, {
      kind: "stdout",
      flags: 0,
      rightsBase: WASI_RIGHTS.FD_WRITE,
      rightsInheriting: 0n,
    });
    this.#descriptors.set(2, {
      kind: "stderr",
      flags: 0,
      rightsBase: WASI_RIGHTS.FD_WRITE,
      rightsInheriting: 0n,
    });
    this.#descriptors.set(3, {
      kind: "node",
      node: this.#root,
      offset: 0,
      flags: 0,
      rightsBase: WASI_DIRECTORY_RIGHTS,
      rightsInheriting: WASI_REGULAR_FILE_RIGHTS | WASI_DIRECTORY_RIGHTS,
      preopenPath: "/",
    });
  }

  #assertLive() {
    if (this.#disposed) {
      throw new WasiFilesystemError(WASI_ERRNO.BADF, "WASI filesystem is disposed");
    }
  }

  #descriptor(fd) {
    this.#assertLive();
    const descriptor = this.#descriptors.get(fd);
    if (!descriptor) throw new WasiFilesystemError(WASI_ERRNO.BADF, `invalid descriptor ${fd}`);
    return descriptor;
  }

  #decodePath(bytes) {
    let value;
    try {
      value = decoder.decode(bytes);
    } catch {
      throw new WasiFilesystemError(WASI_ERRNO.INVAL, "path is not valid UTF-8");
    }
    if (value.length === 0 || value.includes("\0")) {
      throw new WasiFilesystemError(WASI_ERRNO.INVAL, "path is empty or contains NUL");
    }
    if (value.startsWith("/") || value.includes("\\")) {
      throw new WasiFilesystemError(WASI_ERRNO.ACCES, "path is not relative");
    }
    const parts = [];
    for (const part of value.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        throw new WasiFilesystemError(WASI_ERRNO.ACCES, "parent traversal is prohibited");
      }
      parts.push(part);
    }
    if (parts.length === 0) return [];
    return parts;
  }

  #resolveFrom(directoryDescriptor, pathBytes, { parent = false } = {}) {
    if (directoryDescriptor.kind !== "node" || directoryDescriptor.node.type !== "directory") {
      throw new WasiFilesystemError(WASI_ERRNO.NOTDIR, "path descriptor is not a directory");
    }
    const parts = this.#decodePath(pathBytes);
    if (parent && parts.length === 0) {
      throw new WasiFilesystemError(WASI_ERRNO.INVAL, "operation requires a child path");
    }
    const stop = parent ? parts.length - 1 : parts.length;
    let node = directoryDescriptor.node;
    for (let index = 0; index < stop; index += 1) {
      if (node.type !== "directory") {
        throw new WasiFilesystemError(WASI_ERRNO.NOTDIR, "path component is not a directory");
      }
      const next = node.entries.get(parts[index]);
      if (!next) throw new WasiFilesystemError(WASI_ERRNO.NOENT, "path does not exist");
      node = next;
    }
    return parent ? { directory: node, name: parts.at(-1) } : node;
  }

  #ensureCapacity(previousSize, nextSize, creating = false) {
    if (!Number.isSafeInteger(nextSize) || nextSize < 0) {
      throw new WasiFilesystemError(WASI_ERRNO.OVERFLOW, "invalid file size");
    }
    if (nextSize > this.#limits.maxFileBytes) {
      throw new WasiFilesystemError(WASI_ERRNO.FBIG, "per-file byte limit exceeded");
    }
    if (this.#totalBytes - previousSize + nextSize > this.#limits.maxTotalBytes) {
      throw new WasiFilesystemError(WASI_ERRNO.NOSPC, "total byte limit exceeded");
    }
    if (creating && this.#fileCount >= this.#limits.maxFiles) {
      throw new WasiFilesystemError(WASI_ERRNO.NOSPC, "file-count limit exceeded");
    }
  }

  #resize(node, nextSize) {
    const previousSize = node.bytes.byteLength;
    this.#ensureCapacity(previousSize, nextSize);
    if (nextSize === previousSize) return;
    const next = new Uint8Array(nextSize);
    next.set(node.bytes.subarray(0, Math.min(previousSize, nextSize)));
    node.bytes = next;
    this.#totalBytes += nextSize - previousSize;
  }

  #reclaim(node) {
    if (node.type !== "file" || node.linked || node.openCount !== 0 || !node.accounted) return;
    node.accounted = false;
    this.#fileCount -= 1;
    this.#totalBytes -= node.bytes.byteLength;
    node.bytes = new Uint8Array(0);
  }

  descriptor(fd) {
    return this.#descriptor(fd);
  }

  openAt(fd, pathBytes, oflags, rightsBase, rightsInheriting, fdflags) {
    const base = this.#descriptor(fd);
    if (!hasRights(base.rightsBase, WASI_RIGHTS.PATH_OPEN)) {
      throw new WasiFilesystemError(WASI_ERRNO.NOTCAPABLE, "descriptor lacks path_open rights");
    }
    if (!checkedFlags(oflags, WASI_OFLAGS.CREAT | WASI_OFLAGS.DIRECTORY | WASI_OFLAGS.EXCL | WASI_OFLAGS.TRUNC) ||
        !checkedFlags(fdflags, WASI_FDFLAGS.APPEND | WASI_FDFLAGS.DSYNC | WASI_FDFLAGS.NONBLOCK | WASI_FDFLAGS.RSYNC | WASI_FDFLAGS.SYNC)) {
      throw new WasiFilesystemError(WASI_ERRNO.INVAL, "unsupported open flags");
    }
    if (!hasRights(base.rightsInheriting, rightsBase) ||
        !hasRights(base.rightsInheriting, rightsInheriting)) {
      throw new WasiFilesystemError(WASI_ERRNO.NOTCAPABLE, "requested rights exceed directory rights");
    }
    const location = this.#resolveFrom(base, pathBytes, { parent: true });
    if (location.directory.type !== "directory") {
      throw new WasiFilesystemError(WASI_ERRNO.NOTDIR, "parent is not a directory");
    }
    let node = location.directory.entries.get(location.name);
    const create = Boolean(oflags & WASI_OFLAGS.CREAT);
    let created = false;
    if (!node) {
      if (!create) throw new WasiFilesystemError(WASI_ERRNO.NOENT, "path does not exist");
      if (oflags & WASI_OFLAGS.DIRECTORY) {
        throw new WasiFilesystemError(WASI_ERRNO.NOTDIR, "directory creation is unsupported");
      }
      if (!hasRights(base.rightsBase, WASI_RIGHTS.PATH_CREATE_FILE)) {
        throw new WasiFilesystemError(WASI_ERRNO.NOTCAPABLE, "descriptor lacks create-file rights");
      }
      node = regularFile(location.name, location.directory);
      created = true;
    } else if (create && (oflags & WASI_OFLAGS.EXCL)) {
      throw new WasiFilesystemError(WASI_ERRNO.EXIST, "exclusive path already exists");
    }
    if ((oflags & WASI_OFLAGS.DIRECTORY) && node.type !== "directory") {
      throw new WasiFilesystemError(WASI_ERRNO.NOTDIR, "opened path is not a directory");
    }
    if (!(oflags & WASI_OFLAGS.DIRECTORY) && node.type === "directory") {
      throw new WasiFilesystemError(WASI_ERRNO.ISDIR, "opened path is a directory");
    }
    const truncate = Boolean((oflags & WASI_OFLAGS.TRUNC) && node.type === "file");
    if (truncate) {
      if (!hasRights(rightsBase, WASI_RIGHTS.FD_WRITE)) {
        throw new WasiFilesystemError(WASI_ERRNO.NOTCAPABLE, "truncate requires write rights");
      }
    }
    // wasi-libc deliberately requests the preopen's complete inheriting-rights
    // mask here, including path rights that are meaningless on a regular file.
    // WASI capability narrowing is against the directory descriptor, above;
    // the opened node's type still prevents it from being used as a directory.
    // Rejecting otherwise-valid but inapplicable rights breaks mkstemp(3).
    if (created) {
      this.#ensureCapacity(0, 0, true);
      location.directory.entries.set(location.name, node);
      this.#fileCount += 1;
    }
    if (truncate) this.#resize(node, 0);
    const opened = this.#nextDescriptor++;
    if (node.type === "file") node.openCount += 1;
    this.#descriptors.set(opened, {
      kind: "node",
      node,
      offset: 0,
      flags: fdflags,
      rightsBase,
      rightsInheriting,
    });
    return opened;
  }

  close(fd) {
    const descriptor = this.#descriptor(fd);
    if (descriptor.preopenPath || fd <= 2) {
      throw new WasiFilesystemError(WASI_ERRNO.BADF, "standard and preopen descriptors cannot close");
    }
    this.#descriptors.delete(fd);
    if (descriptor.kind === "node" && descriptor.node.type === "file") {
      descriptor.node.openCount -= 1;
      this.#reclaim(descriptor.node);
    }
  }

  setFlags(fd, flags) {
    const descriptor = this.#descriptor(fd);
    if (!hasRights(descriptor.rightsBase, WASI_RIGHTS.FD_FDSTAT_SET_FLAGS)) {
      throw new WasiFilesystemError(WASI_ERRNO.NOTCAPABLE, "descriptor lacks set-flags rights");
    }
    if (!checkedFlags(flags, WASI_FDFLAGS.APPEND | WASI_FDFLAGS.NONBLOCK)) {
      throw new WasiFilesystemError(WASI_ERRNO.NOTSUP, "unsupported descriptor flags");
    }
    descriptor.flags = flags;
  }

  read(fd, targets) {
    const descriptor = this.#descriptor(fd);
    if (!hasRights(descriptor.rightsBase, WASI_RIGHTS.FD_READ)) {
      throw new WasiFilesystemError(WASI_ERRNO.NOTCAPABLE, "descriptor lacks read rights");
    }
    if (descriptor.kind === "stdin") return 0;
    if (descriptor.kind !== "node" || descriptor.node.type !== "file") {
      throw new WasiFilesystemError(WASI_ERRNO.ISDIR, "descriptor is not a regular file");
    }
    let read = 0;
    for (const target of targets) {
      const available = Math.max(0, descriptor.node.bytes.byteLength - descriptor.offset);
      const length = Math.min(target.byteLength, available);
      target.set(descriptor.node.bytes.subarray(descriptor.offset, descriptor.offset + length));
      descriptor.offset += length;
      read += length;
      if (length < target.byteLength) break;
    }
    return read;
  }

  write(fd, sources, output) {
    const descriptor = this.#descriptor(fd);
    if (!hasRights(descriptor.rightsBase, WASI_RIGHTS.FD_WRITE)) {
      throw new WasiFilesystemError(WASI_ERRNO.NOTCAPABLE, "descriptor lacks write rights");
    }
    if (descriptor.kind === "stdout" || descriptor.kind === "stderr") {
      let written = 0;
      for (const source of sources) {
        output(descriptor.kind, source);
        written += source.byteLength;
      }
      return written;
    }
    if (descriptor.kind !== "node" || descriptor.node.type !== "file") {
      throw new WasiFilesystemError(WASI_ERRNO.ISDIR, "descriptor is not a regular file");
    }
    const count = sources.reduce((sum, source) => sum + source.byteLength, 0);
    const position = descriptor.flags & WASI_FDFLAGS.APPEND
      ? descriptor.node.bytes.byteLength
      : descriptor.offset;
    const nextSize = Math.max(descriptor.node.bytes.byteLength, position + count);
    this.#ensureCapacity(descriptor.node.bytes.byteLength, nextSize);
    this.#resize(descriptor.node, nextSize);
    let cursor = position;
    for (const source of sources) {
      descriptor.node.bytes.set(source, cursor);
      cursor += source.byteLength;
    }
    descriptor.offset = cursor;
    return count;
  }

  seek(fd, offset, whence) {
    const descriptor = this.#descriptor(fd);
    if (!hasRights(descriptor.rightsBase, WASI_RIGHTS.FD_SEEK)) {
      throw new WasiFilesystemError(WASI_ERRNO.NOTCAPABLE, "descriptor lacks seek rights");
    }
    if (descriptor.kind !== "node" || descriptor.node.type !== "file") {
      throw new WasiFilesystemError(WASI_ERRNO.SPIPE, "descriptor is not seekable");
    }
    let origin;
    if (whence === 0) origin = 0n;
    else if (whence === 1) origin = BigInt(descriptor.offset);
    else if (whence === 2) origin = BigInt(descriptor.node.bytes.byteLength);
    else throw new WasiFilesystemError(WASI_ERRNO.INVAL, "invalid seek origin");
    const next = origin + BigInt(offset);
    if (next < 0n || next > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new WasiFilesystemError(WASI_ERRNO.INVAL, "seek offset is out of range");
    }
    descriptor.offset = Number(next);
    return next;
  }

  unlinkAt(fd, pathBytes) {
    const base = this.#descriptor(fd);
    if (!hasRights(base.rightsBase, WASI_RIGHTS.PATH_UNLINK_FILE)) {
      throw new WasiFilesystemError(WASI_ERRNO.NOTCAPABLE, "descriptor lacks unlink rights");
    }
    const location = this.#resolveFrom(base, pathBytes, { parent: true });
    const node = location.directory.entries.get(location.name);
    if (!node) throw new WasiFilesystemError(WASI_ERRNO.NOENT, "path does not exist");
    if (node.type === "directory") throw new WasiFilesystemError(WASI_ERRNO.ISDIR, "path is a directory");
    location.directory.entries.delete(location.name);
    node.linked = false;
    node.parent = null;
    this.#reclaim(node);
  }

  removeDirectoryAt(fd, pathBytes) {
    const base = this.#descriptor(fd);
    if (!hasRights(base.rightsBase, WASI_RIGHTS.PATH_REMOVE_DIRECTORY)) {
      throw new WasiFilesystemError(WASI_ERRNO.NOTCAPABLE, "descriptor lacks remove-directory rights");
    }
    const location = this.#resolveFrom(base, pathBytes, { parent: true });
    const node = location.directory.entries.get(location.name);
    if (!node) throw new WasiFilesystemError(WASI_ERRNO.NOENT, "path does not exist");
    if (node.type !== "directory") throw new WasiFilesystemError(WASI_ERRNO.NOTDIR, "path is not a directory");
    if (node.entries.size !== 0) throw new WasiFilesystemError(WASI_ERRNO.NOTEMPTY, "directory is not empty");
    location.directory.entries.delete(location.name);
    node.parent = null;
  }

  usage() {
    this.#assertLive();
    return Object.freeze({
      fileCount: this.#fileCount,
      totalBytes: this.#totalBytes,
      openDescriptors: this.#descriptors.size,
    });
  }

  testing() {
    const root = this.#descriptor(3);
    return Object.freeze({
      writeFile: (path, contents) => {
        const bytes = typeof contents === "string" ? encoder.encode(contents) : new Uint8Array(contents);
        const relative = path.startsWith("/") ? path.slice(1) : path;
        const fd = this.openAt(
          3,
          encoder.encode(relative),
          WASI_OFLAGS.CREAT | WASI_OFLAGS.TRUNC,
          WASI_REGULAR_FILE_RIGHTS,
          0n,
          0,
        );
        try {
          this.write(fd, [bytes], () => {});
        } finally {
          this.close(fd);
        }
      },
      appendFile: (path, contents) => {
        const bytes = typeof contents === "string" ? encoder.encode(contents) : new Uint8Array(contents);
        const relative = path.startsWith("/") ? path.slice(1) : path;
        const fd = this.openAt(
          3,
          encoder.encode(relative),
          0,
          WASI_REGULAR_FILE_RIGHTS,
          0n,
          WASI_FDFLAGS.APPEND,
        );
        try {
          this.write(fd, [bytes], () => {});
        } finally {
          this.close(fd);
        }
      },
      unlink: (path) => {
        const relative = path.startsWith("/") ? path.slice(1) : path;
        this.unlinkAt(3, encoder.encode(relative));
      },
      open: (path, { create = false } = {}) => {
        const relative = path.startsWith("/") ? path.slice(1) : path;
        return this.openAt(
          3,
          encoder.encode(relative),
          create ? WASI_OFLAGS.CREAT : 0,
          WASI_REGULAR_FILE_RIGHTS,
          0n,
          0,
        );
      },
      close: (fd) => this.close(fd),
      root,
    });
  }

  dispose() {
    if (this.#disposed) return;
    this.#descriptors.clear();
    this.#root.entries.clear();
    this.#fileCount = 0;
    this.#totalBytes = 0;
    this.#disposed = true;
  }

  stat(fd) {
    const descriptor = this.#descriptor(fd);
    if (descriptor.kind === "stdin" || descriptor.kind === "stdout" || descriptor.kind === "stderr") {
      return {
        filetype: WASI_FILETYPE.CHARACTER_DEVICE,
        flags: descriptor.flags,
        rightsBase: descriptor.rightsBase,
        rightsInheriting: descriptor.rightsInheriting,
      };
    }
    return {
      filetype: fileType(descriptor.node),
      flags: descriptor.flags,
      rightsBase: descriptor.rightsBase,
      rightsInheriting: descriptor.rightsInheriting,
    };
  }
}

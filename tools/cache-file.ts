import { randomBytes } from "node:crypto";
import {
  closeSync,
  linkSync,
  lstatSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const WINDOWS_PUBLICATION_RETRY_DELAYS_MS = [1, 2, 4, 8, 16, 32, 64, 128, 256];
const WINDOWS_PUBLICATION_RETRY_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);
const synchronousWait = new Int32Array(new SharedArrayBuffer(4));

function completeRegularFileExists(filename: string): boolean {
  try {
    const destination = lstatSync(filename);
    return destination.isFile() && !destination.isSymbolicLink();
  } catch (_error) {
    return false;
  }
}

function publishCacheFileSync(temporary: string, filename: string): void {
  if (process.platform !== "win32") {
    renameSync(temporary, filename);
    return;
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      // Unlike replacement-rename on Windows, creating a new hard link never
      // removes an existing destination before reporting a sharing failure.
      // The temporary file is complete and on the same filesystem.
      linkSync(temporary, filename);
      unlinkSync(temporary);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (completeRegularFileExists(filename)) {
        // A competing publisher already left a complete cache value. This
        // content-addressed cache is disposable, so first complete writer wins.
        unlinkSync(temporary);
        return;
      }
      if (
        code === undefined ||
        !WINDOWS_PUBLICATION_RETRY_CODES.has(code) ||
        attempt >= WINDOWS_PUBLICATION_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }
      Atomics.wait(
        synchronousWait,
        0,
        0,
        WINDOWS_PUBLICATION_RETRY_DELAYS_MS[attempt],
      );
    }
  }
}

/**
 * Publish one disposable cache file without exposing a partially written value.
 *
 * The temporary file is created beside the destination, so the final rename is
 * an atomic same-filesystem operation. Concurrent publishers may replace one
 * complete value with another complete value; readers never observe an
 * intermediate truncation. Callers deliberately treat publication failure as
 * a cache miss, including when a whole obsolete cache generation is
 * concurrently quarantined by maintenance.
 *
 * Windows replacement-rename can remove the old destination before a sharing
 * failure, so it is not safe for concurrent readers. Publish there by creating
 * the destination as a hard link to the complete private file. The first
 * complete writer wins; losing disposable candidates are removed. POSIX uses
 * the usual atomic replacement rename.
 */
export function atomicWriteCacheFileSync(
  filename: string,
  data: string | NodeJS.ArrayBufferView,
): void {
  const temporary = join(
    dirname(filename),
    `.sagejs-publish-${process.pid}-${randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, data);
    closeSync(descriptor);
    descriptor = undefined;
    publishCacheFileSync(temporary, filename);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch (_closeError) {}
    }
    try {
      unlinkSync(temporary);
    } catch (_unlinkError) {}
    throw error;
  }
}

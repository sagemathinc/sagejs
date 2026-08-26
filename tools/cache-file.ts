import { randomBytes } from "node:crypto";
import {
  closeSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const WINDOWS_RENAME_RETRY_DELAYS_MS = [1, 2, 4, 8, 16, 32, 64, 128, 256];
const WINDOWS_RENAME_RETRY_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);
const synchronousWait = new Int32Array(new SharedArrayBuffer(4));

function renamePublishedCacheFileSync(temporary: string, filename: string): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(temporary, filename);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (
        process.platform !== "win32" ||
        code === undefined ||
        !WINDOWS_RENAME_RETRY_CODES.has(code) ||
        attempt >= WINDOWS_RENAME_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }
      Atomics.wait(synchronousWait, 0, 0, WINDOWS_RENAME_RETRY_DELAYS_MS[attempt]);
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
 * Windows does not always grant delete sharing to a reader, so replacing the
 * destination can transiently fail while another process has it open. Retry
 * only those sharing failures for a bounded interval; the final successful
 * rename remains the single atomic publication event.
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
    renamePublishedCacheFileSync(temporary, filename);
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

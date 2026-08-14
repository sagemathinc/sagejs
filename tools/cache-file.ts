import { randomBytes } from "node:crypto";
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const renameRetrySignal = new Int32Array(new SharedArrayBuffer(4));

function waitForWindowsFileAccess(attempt: number): void {
  Atomics.wait(
    renameRetrySignal,
    0,
    0,
    Math.min(2 ** Math.min(attempt, 5), 32),
  );
}

function transientWindowsAccessError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return process.platform === "win32" &&
    (code === "EACCES" || code === "EBUSY" || code === "EPERM");
}

function destinationIsRegularFile(filename: string): boolean {
  try {
    return lstatSync(filename).isFile();
  } catch (_error) {
    return false;
  }
}

function publishTemporaryFile(temporary: string, filename: string): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(temporary, filename);
      return;
    } catch (error) {
      const retryable = transientWindowsAccessError(error) &&
        attempt < 50 &&
        destinationIsRegularFile(filename);
      if (!retryable) throw error;
      // Windows may briefly deny replacement while another process is reading
      // the destination. Retrying the rename preserves atomic visibility;
      // unlinking the destination would expose a cache miss to readers.
      waitForWindowsFileAccess(attempt);
    }
  }
}

/**
 * Read a cache file that may be concurrently replaced by an atomic publisher.
 *
 * Windows can briefly deny a same-path open while committing the replacement.
 * Retry only those transient access errors. A missing or malformed file still
 * reaches the caller unchanged and remains an ordinary cache miss.
 */
export function readCacheFileSync(filename: string): Buffer;
export function readCacheFileSync(filename: string, encoding: BufferEncoding): string;
export function readCacheFileSync(
  filename: string,
  encoding?: BufferEncoding,
): Buffer | string {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return encoding === undefined
        ? readFileSync(filename)
        : readFileSync(filename, encoding);
    } catch (error) {
      if (!transientWindowsAccessError(error) || attempt >= 50) throw error;
      waitForWindowsFileAccess(attempt);
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
    publishTemporaryFile(temporary, filename);
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

import { randomBytes } from "node:crypto";
import {
  closeSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

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
    renameSync(temporary, filename);
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

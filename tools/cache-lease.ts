import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";

export const MODULE_CACHE_LEASE_PREFIX = ".sagejs-active-";
export const MODULE_CACHE_LEASE_SUFFIX = ".json";
export const MODULE_CACHE_LEASE_SCHEMA = "sagejs.module-cache-lease/v1";
export const MODULE_CACHE_LEASE_HEARTBEAT_MS = 30_000;
export const MODULE_CACHE_LEASE_STALE_MS = 5 * 60_000;

interface LeaseState {
  filename: string;
  release: () => void;
}

const leases = new Map<string, LeaseState>();

/**
 * Mark one compiler-version module cache as in use by this process.
 *
 * The lease is deliberately advisory: cache failures must never prevent Sage.js
 * from running. A short heartbeat lets `sagejs cache prune` preserve an older
 * runtime which remains alive after a newer Sage.js version is installed, while
 * leases left by a crash expire without manual intervention.
 */
export function markModuleCacheInUse(
  directory: string,
  heartbeatMs = MODULE_CACHE_LEASE_HEARTBEAT_MS,
): () => void {
  const cacheDirectory = resolve(directory);
  const existing = leases.get(cacheDirectory);
  if (existing) return existing.release;

  const token = randomBytes(8).toString("hex");
  const filename = join(
    cacheDirectory,
    `${MODULE_CACHE_LEASE_PREFIX}${process.pid}-${token}${MODULE_CACHE_LEASE_SUFFIX}`,
  );
  const startedAt = new Date().toISOString();
  let timer: NodeJS.Timeout | undefined;
  let released = false;

  const write = (): void => {
    if (released) return;
    try {
      mkdirSync(cacheDirectory, { recursive: true });
      writeFileSync(filename, JSON.stringify({
        schema: MODULE_CACHE_LEASE_SCHEMA,
        pid: process.pid,
        host: hostname(),
        started_at: startedAt,
        heartbeat_at: new Date().toISOString(),
      }));
    } catch (_error) {
      // A read-only or concurrently replaced cache is equivalent to no cache.
    }
  };

  const release = (): void => {
    if (released) return;
    released = true;
    if (timer) clearInterval(timer);
    leases.delete(cacheDirectory);
    process.removeListener("exit", release);
    try {
      unlinkSync(filename);
    } catch (_error) {}
  };

  write();
  timer = setInterval(write, heartbeatMs);
  timer.unref();
  process.once("exit", release);
  leases.set(cacheDirectory, { filename, release });
  return release;
}


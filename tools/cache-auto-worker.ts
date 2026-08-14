import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import {
  DEFAULT_CACHE_POLICY,
  defaultVersionedCacheRoot,
  parseByteSize,
  pruneModuleCache,
  validateModuleCacheRoot,
  type CachePolicy,
  type CachePruneReport,
} from "./cache";
import {
  AUTOMATIC_CACHE_STATE_FILENAME,
  AUTOMATIC_CACHE_STATE_SCHEMA,
  DEFAULT_AUTOMATIC_CACHE_INTERVAL_HOURS,
  DEFAULT_AUTOMATIC_CACHE_RETRY_HOURS,
} from "./cache-auto";
import {
  atomicWriteCacheFileSync,
  readCacheFileSync,
} from "./cache-file";

/*
 * Automatic policy overrides:
 *
 * - SAGEJS_MODULE_CACHE_AUTO_CLEANUP=0 disables maintenance.
 * - SAGEJS_MODULE_CACHE_{MAX_SIZE,MAX_AGE_DAYS,MIN_AGE_DAYS,KEEP_VERSIONS}
 *   configure the same retention policy as the manual command.
 * - SAGEJS_MODULE_CACHE_AUTO_CLEANUP_{INTERVAL_HOURS,MAX_BYTES,MAX_VERSIONS}
 *   bound how often and how much one detached pass may remove.
 * - SAGEJS_MODULE_CACHE_AUTO_CLEANUP_RETRY_HOURS schedules unfinished passes.
 */

export const AUTOMATIC_CACHE_LOCK_FILENAME = ".sagejs-auto-cleanup.lock";
export const AUTOMATIC_CACHE_LOCK_OWNER_FILENAME = "owner";
export const DEFAULT_AUTOMATIC_CACHE_LOCK_STALE_MS = 2 * 60 * 60 * 1_000;
export const DEFAULT_AUTOMATIC_CACHE_MAX_BYTES_PER_RUN = 1024 ** 3;
export const DEFAULT_AUTOMATIC_CACHE_MAX_VERSIONS_PER_RUN = 128;

const VERSION_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

interface AutomaticCacheState {
  schema: string;
  last_attempt_ms: number;
  next_attempt_ms?: number;
  last_error?: string;
  last_reclaimed_bytes?: number;
  last_removed_versions?: number;
  last_status?: "applied" | "deferred" | "error" | "running";
}

export interface AutomaticModuleCacheCleanupOptions {
  /** Test-only hook immediately before a planned candidate is rechecked. */
  beforeRemove?: (entry: { path: string; version: string }) => void;
  currentVersion: string;
  environment?: NodeJS.ProcessEnv;
  expectedRoot?: string;
  lockStaleMs?: number;
  now?: number;
  root: string;
}

export interface AutomaticModuleCacheCleanupResult {
  report?: CachePruneReport;
  status: "applied" | "disabled" | "locked" | "recent";
}

interface AutomaticPolicy {
  intervalMs: number;
  maxBytesPerRun: number;
  maxVersionsPerRun: number;
  policy: CachePolicy;
  retryMs: number;
}

function enabled(value: string | undefined): boolean {
  if (value === undefined || value === "") return true;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function finiteNumber(
  name: string,
  value: string | undefined,
  fallback: number,
  integer = false,
): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${name} must be a nonnegative ${integer ? "integer" : "number"}`);
  }
  return parsed;
}

function configuredPolicy(environment: NodeJS.ProcessEnv): AutomaticPolicy {
  const intervalHours = finiteNumber(
    "SAGEJS_MODULE_CACHE_AUTO_CLEANUP_INTERVAL_HOURS",
    environment.SAGEJS_MODULE_CACHE_AUTO_CLEANUP_INTERVAL_HOURS,
    DEFAULT_AUTOMATIC_CACHE_INTERVAL_HOURS,
  );
  const maxBytes = environment.SAGEJS_MODULE_CACHE_MAX_SIZE
    ? parseByteSize(environment.SAGEJS_MODULE_CACHE_MAX_SIZE)
    : DEFAULT_CACHE_POLICY.maxBytes;
  const maxBytesPerRun = environment.SAGEJS_MODULE_CACHE_AUTO_CLEANUP_MAX_BYTES
    ? parseByteSize(environment.SAGEJS_MODULE_CACHE_AUTO_CLEANUP_MAX_BYTES)
    : DEFAULT_AUTOMATIC_CACHE_MAX_BYTES_PER_RUN;
  const policy = {
    keepVersions: finiteNumber(
      "SAGEJS_MODULE_CACHE_KEEP_VERSIONS",
      environment.SAGEJS_MODULE_CACHE_KEEP_VERSIONS,
      DEFAULT_CACHE_POLICY.keepVersions,
      true,
    ),
    maxAgeDays: finiteNumber(
      "SAGEJS_MODULE_CACHE_MAX_AGE_DAYS",
      environment.SAGEJS_MODULE_CACHE_MAX_AGE_DAYS,
      DEFAULT_CACHE_POLICY.maxAgeDays,
    ),
    maxBytes,
    minAgeDays: finiteNumber(
      "SAGEJS_MODULE_CACHE_MIN_AGE_DAYS",
      environment.SAGEJS_MODULE_CACHE_MIN_AGE_DAYS,
      DEFAULT_CACHE_POLICY.minAgeDays,
    ),
  };
  if (policy.minAgeDays > policy.maxAgeDays) {
    throw new Error("SAGEJS_MODULE_CACHE_MIN_AGE_DAYS cannot exceed MAX_AGE_DAYS");
  }
  return {
    intervalMs: intervalHours * 60 * 60 * 1_000,
    maxBytesPerRun,
    maxVersionsPerRun: finiteNumber(
      "SAGEJS_MODULE_CACHE_AUTO_CLEANUP_MAX_VERSIONS",
      environment.SAGEJS_MODULE_CACHE_AUTO_CLEANUP_MAX_VERSIONS,
      DEFAULT_AUTOMATIC_CACHE_MAX_VERSIONS_PER_RUN,
      true,
    ),
    policy,
    retryMs: finiteNumber(
      "SAGEJS_MODULE_CACHE_AUTO_CLEANUP_RETRY_HOURS",
      environment.SAGEJS_MODULE_CACHE_AUTO_CLEANUP_RETRY_HOURS,
      DEFAULT_AUTOMATIC_CACHE_RETRY_HOURS,
    ) * 60 * 60 * 1_000,
  };
}

function readState(filename: string): AutomaticCacheState | undefined {
  if (!existsSync(filename)) return undefined;
  const metadata = lstatSync(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("automatic cache cleanup refused unsafe state marker");
  }
  const state = JSON.parse(
    readCacheFileSync(filename, "utf8"),
  ) as AutomaticCacheState;
  if (
    state.schema !== AUTOMATIC_CACHE_STATE_SCHEMA ||
    !Number.isFinite(state.last_attempt_ms) ||
    state.last_attempt_ms < 0 ||
    (state.next_attempt_ms !== undefined &&
      (!Number.isFinite(state.next_attempt_ms) || state.next_attempt_ms < 0))
  ) throw new Error("automatic cache cleanup refused malformed state marker");
  return state;
}

function writeState(filename: string, state: AutomaticCacheState): void {
  if (existsSync(filename)) {
    const metadata = lstatSync(filename);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("automatic cache cleanup refused unsafe state marker");
    }
  }
  // Publish beside the marker and rename into place, so a concurrent symlink
  // replacement cannot redirect this advisory write outside the cache root.
  atomicWriteCacheFileSync(filename, `${JSON.stringify(state)}\n`);
}

function acquireDirectoryMutex(
  directory: string,
  now: number,
  staleMs: number,
): (() => void) | undefined {
  const token = randomBytes(12).toString("hex");
  const owner = join(directory, AUTOMATIC_CACHE_LOCK_OWNER_FILENAME);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      mkdirSync(directory, { mode: 0o700 });
      try {
        writeFileSync(owner, `${token}\n`, { flag: "wx", mode: 0o600 });
      } catch (error) {
        try {
          rmdirSync(directory);
        } catch (_cleanupError) {}
        throw error;
      }
      return () => {
        try {
          if (readFileSync(owner, "utf8").trim() !== token) return;
          unlinkSync(owner);
          rmdirSync(directory);
        } catch (_error) {}
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const metadata = lstatSync(directory);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("automatic cache cleanup refused unsafe mutex marker");
      }
      try {
        const ownerMetadata = lstatSync(owner);
        if (!ownerMetadata.isFile() || ownerMetadata.isSymbolicLink()) {
          throw new Error("automatic cache cleanup refused unsafe mutex owner");
        }
        if (now - ownerMetadata.mtimeMs <= staleMs) return undefined;
        const observed = readFileSync(owner, "utf8").trim();
        if (!observed || readFileSync(owner, "utf8").trim() !== observed) {
          return undefined;
        }
        unlinkSync(owner);
        rmdirSync(directory);
      } catch (recoveryError) {
        if ((recoveryError as NodeJS.ErrnoException).code === "ENOENT") {
          // mkdir+owner and owner+rmdir each have an empty-directory crash
          // window. Directory identity prevents replacement until rmdir; an
          // abandoned empty mutex is therefore safely reclaimable when stale.
          if (now - metadata.mtimeMs <= staleMs) return undefined;
          try {
            rmdirSync(directory);
          } catch (removeError) {
            if (!["ENOENT", "ENOTEMPTY"].includes(
              (removeError as NodeJS.ErrnoException).code ?? "",
            )) throw removeError;
          }
        } else if (!["ENOENT", "ENOTEMPTY"].includes(
          (recoveryError as NodeJS.ErrnoException).code ?? "",
        )) throw recoveryError;
      }
    }
  }
  return undefined;
}

const releaseWaitArray = new Int32Array(new SharedArrayBuffer(4));

function acquireDirectoryMutexForRelease(
  directory: string,
  staleMs: number,
): (() => void) | undefined {
  // Release is rare and bounded. Unlike startup acquisition it must not
  // abandon a live canonical lock merely because another startup briefly owns
  // the guard; wait a short bounded interval for that ordinary contention.
  const deadline = Date.now() + 2_000;
  do {
    const release = acquireDirectoryMutex(directory, Date.now(), staleMs);
    if (release) return release;
    Atomics.wait(releaseWaitArray, 0, 0, 10);
  } while (Date.now() < deadline);
  return undefined;
}

function acquireLock(
  filename: string,
  now: number,
  staleMs: number,
): (() => void) | undefined {
  const parent = dirname(filename);
  const guard = `${filename}.guard`;
  const releaseGuard = acquireDirectoryMutex(guard, now, staleMs);
  if (!releaseGuard) return undefined;
  const token = randomBytes(12).toString("hex");
  const owner = join(filename, AUTOMATIC_CACHE_LOCK_OWNER_FILENAME);
  try {
    if (existsSync(filename)) {
      const metadata = lstatSync(filename);
      if (metadata.isSymbolicLink()) {
        throw new Error("automatic cache cleanup refused unsafe lock marker");
      }
      let stale = false;
      if (metadata.isFile()) {
        // v1 legacy locks did not heartbeat. Fresh files are preserved; stale
        // files are assumed abandoned under the documented stale-timeout rule.
        stale = now - metadata.mtimeMs > staleMs;
      } else if (metadata.isDirectory()) {
        try {
          const ownerMetadata = lstatSync(owner);
          if (!ownerMetadata.isFile() || ownerMetadata.isSymbolicLink()) {
            throw new Error("automatic cache cleanup refused unsafe lock owner");
          }
          stale = now - ownerMetadata.mtimeMs > staleMs;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          stale = now - metadata.mtimeMs > staleMs;
        }
      } else {
        throw new Error("automatic cache cleanup refused unsafe lock marker");
      }
      if (!stale) return undefined;
      const quarantine = join(
        parent,
        `.sagejs-auto-retired-${process.pid}-${randomBytes(12).toString("hex")}`,
      );
      renameSync(filename, quarantine);
      // A crash after the atomic rename leaves only this inert private path;
      // the canonical lock is free and future workers continue immediately.
      rmSync(quarantine, { recursive: true, force: false });
    }
    mkdirSync(filename, { mode: 0o700 });
    writeFileSync(owner, `${token}\n`, { flag: "wx", mode: 0o600 });
  } finally {
    releaseGuard();
  }

  return () => {
    const releaseOperation = acquireDirectoryMutexForRelease(guard, staleMs);
    if (!releaseOperation) return;
    try {
      const metadata = lstatSync(filename);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) return;
      if (readFileSync(owner, "utf8").trim() !== token) return;
      const quarantine = join(
        parent,
        `.sagejs-auto-released-${process.pid}-${randomBytes(12).toString("hex")}`,
      );
      renameSync(filename, quarantine);
      rmSync(quarantine, { recursive: true, force: false });
    } catch (_error) {
      // A later worker can recover a stale canonical marker. Private release
      // quarantines are inert if a crash or deletion error leaves one behind.
    } finally {
      releaseOperation();
    }
  };
}

/** Execute one bounded maintenance pass. Tests must supply a temporary root. */
export function runAutomaticModuleCacheCleanup(
  options: AutomaticModuleCacheCleanupOptions,
): AutomaticModuleCacheCleanupResult {
  const environment = options.environment ?? process.env;
  if (!enabled(environment.SAGEJS_MODULE_CACHE_AUTO_CLEANUP)) {
    return { status: "disabled" };
  }
  if (!VERSION_PATTERN.test(options.currentVersion)) {
    throw new Error("automatic cache cleanup refused invalid compiler version");
  }
  const root = validateModuleCacheRoot(
    options.root,
    options.expectedRoot ?? options.root,
  );
  const family = basename(root).toLowerCase() as "modules" | "dynamic";
  const now = options.now ?? Date.now();
  const configured = configuredPolicy(environment);
  const stateFilename = join(root, AUTOMATIC_CACHE_STATE_FILENAME);
  const lockFilename = join(root, AUTOMATIC_CACHE_LOCK_FILENAME);
  const release = acquireLock(
    lockFilename,
    now,
    options.lockStaleMs ?? DEFAULT_AUTOMATIC_CACHE_LOCK_STALE_MS,
  );
  if (!release) return { status: "locked" };

  try {
    const state = readState(stateFilename);
    const due = state?.next_attempt_ms ??
      (state ? state.last_attempt_ms + configured.intervalMs : 0);
    if (state && now < due) {
      return { status: "recent" };
    }
    writeState(stateFilename, {
      schema: AUTOMATIC_CACHE_STATE_SCHEMA,
      last_attempt_ms: now,
      next_attempt_ms: now + Math.min(configured.retryMs, configured.intervalMs),
      last_status: "running",
    });
    try {
      const report = pruneModuleCache({
        apply: true,
        applyLimits: {
          maxBytes: configured.maxBytesPerRun,
          maxVersions: configured.maxVersionsPerRun,
          allowOversizedFirst: true,
        },
        beforeRemove: options.beforeRemove,
        currentVersions: [options.currentVersion],
        expectedRoot: options.expectedRoot ?? root,
        family,
        now,
        policy: configured.policy,
        root,
      });
      const failed = report.errors.length > 0;
      const deferred = failed || (report.deferredVersions?.length ?? 0) > 0;
      const diagnostic = failed
        ? `${report.errors.length} cache generation(s) could not be removed: ` +
          report.errors.slice(0, 3).map(({ version, message }) =>
            `${version}: ${message}`
          ).join("; ")
        : undefined;
      writeState(stateFilename, {
        schema: AUTOMATIC_CACHE_STATE_SCHEMA,
        last_attempt_ms: now,
        next_attempt_ms: now + (
          deferred
            ? Math.min(configured.retryMs, configured.intervalMs)
            : configured.intervalMs
        ),
        last_reclaimed_bytes: report.reclaimedBytes,
        last_removed_versions: report.removedVersions.length,
        ...(diagnostic ? { last_error: diagnostic } : {}),
        last_status: failed ? "error" : deferred ? "deferred" : "applied",
      });
      return { report, status: "applied" };
    } catch (error) {
      writeState(stateFilename, {
        schema: AUTOMATIC_CACHE_STATE_SCHEMA,
        last_attempt_ms: now,
        next_attempt_ms: now + Math.min(configured.retryMs, configured.intervalMs),
        last_error: error instanceof Error ? error.message : String(error),
        last_status: "error",
      });
      throw error;
    }
  } finally {
    release();
  }
}

function cliArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (require.main === module) {
  try {
    const root = cliArgument("--root");
    const currentVersion = cliArgument("--version");
    const family = root ? basename(resolve(root)).toLowerCase() : "";
    if (
      !root ||
      !currentVersion ||
      (family !== "modules" && family !== "dynamic")
    ) {
      throw new Error("automatic cache cleanup requires an exact root and version");
    }
    runAutomaticModuleCacheCleanup({
      currentVersion,
      expectedRoot: defaultVersionedCacheRoot(family),
      root,
    });
  } catch (_error) {
    // Automatic maintenance is advisory. The manual command is the observable
    // diagnostic and recovery path for malformed or read-only caches.
  }
}

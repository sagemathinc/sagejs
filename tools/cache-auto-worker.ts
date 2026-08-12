import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

import {
  DEFAULT_CACHE_POLICY,
  defaultModuleCacheRoot,
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
} from "./cache-auto";

/*
 * Automatic policy overrides:
 *
 * - SAGEJS_MODULE_CACHE_AUTO_CLEANUP=0 disables maintenance.
 * - SAGEJS_MODULE_CACHE_{MAX_SIZE,MAX_AGE_DAYS,MIN_AGE_DAYS,KEEP_VERSIONS}
 *   configure the same retention policy as the manual command.
 * - SAGEJS_MODULE_CACHE_AUTO_CLEANUP_{INTERVAL_HOURS,MAX_BYTES,MAX_VERSIONS}
 *   bound how often and how much one detached pass may remove.
 */

export const AUTOMATIC_CACHE_LOCK_FILENAME = ".sagejs-auto-cleanup.lock";
export const DEFAULT_AUTOMATIC_CACHE_LOCK_STALE_MS = 2 * 60 * 60 * 1_000;
export const DEFAULT_AUTOMATIC_CACHE_MAX_BYTES_PER_RUN = 1024 ** 3;
export const DEFAULT_AUTOMATIC_CACHE_MAX_VERSIONS_PER_RUN = 128;

const VERSION_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

interface AutomaticCacheState {
  schema: string;
  last_attempt_ms: number;
  last_error?: string;
  last_reclaimed_bytes?: number;
  last_removed_versions?: number;
}

export interface AutomaticModuleCacheCleanupOptions {
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
  };
}

function readState(filename: string): AutomaticCacheState | undefined {
  if (!existsSync(filename)) return undefined;
  const metadata = lstatSync(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("automatic cache cleanup refused unsafe state marker");
  }
  const state = JSON.parse(readFileSync(filename, "utf8")) as AutomaticCacheState;
  if (
    state.schema !== AUTOMATIC_CACHE_STATE_SCHEMA ||
    !Number.isFinite(state.last_attempt_ms) ||
    state.last_attempt_ms < 0
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
  writeFileSync(filename, `${JSON.stringify(state)}\n`, { mode: 0o600 });
}

function acquireLock(
  filename: string,
  now: number,
  staleMs: number,
): (() => void) | undefined {
  const token = randomBytes(12).toString("hex");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(filename, "wx", 0o600);
      try {
        writeFileSync(descriptor, `${token}\n`);
      } finally {
        closeSync(descriptor);
      }
      return () => {
        try {
          const metadata = lstatSync(filename);
          if (!metadata.isFile() || metadata.isSymbolicLink()) return;
          if (readFileSync(filename, "utf8").trim() === token) unlinkSync(filename);
        } catch (_error) {}
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const metadata = lstatSync(filename);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error("automatic cache cleanup refused unsafe lock marker");
      }
      if (now - metadata.mtimeMs <= staleMs) return undefined;
      try {
        unlinkSync(filename);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") {
          throw unlinkError;
        }
      }
    }
  }
  return undefined;
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
    if (state && now - state.last_attempt_ms < configured.intervalMs) {
      return { status: "recent" };
    }
    writeState(stateFilename, {
      schema: AUTOMATIC_CACHE_STATE_SCHEMA,
      last_attempt_ms: now,
    });
    try {
      const report = pruneModuleCache({
        apply: true,
        applyLimits: {
          maxBytes: configured.maxBytesPerRun,
          maxVersions: configured.maxVersionsPerRun,
        },
        currentVersions: [options.currentVersion],
        expectedRoot: options.expectedRoot ?? root,
        now,
        policy: configured.policy,
        root,
      });
      writeState(stateFilename, {
        schema: AUTOMATIC_CACHE_STATE_SCHEMA,
        last_attempt_ms: now,
        last_reclaimed_bytes: report.reclaimedBytes,
        last_removed_versions: report.removedVersions.length,
      });
      return { report, status: "applied" };
    } catch (error) {
      writeState(stateFilename, {
        schema: AUTOMATIC_CACHE_STATE_SCHEMA,
        last_attempt_ms: now,
        last_error: error instanceof Error ? error.message : String(error),
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
    if (!root || !currentVersion || basename(resolve(root)) !== "modules") {
      throw new Error("automatic cache cleanup requires an exact root and version");
    }
    runAutomaticModuleCacheCleanup({
      currentVersion,
      expectedRoot: defaultModuleCacheRoot(),
      root,
    });
  } catch (_error) {
    // Automatic maintenance is advisory. The manual command is the observable
    // diagnostic and recovery path for malformed or read-only caches.
  }
}

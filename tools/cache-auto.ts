import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  join,
  resolve,
} from "node:path";

export const AUTOMATIC_CACHE_STATE_FILENAME = ".sagejs-auto-cleanup.json";
export const AUTOMATIC_CACHE_STATE_SCHEMA = "sagejs.module-cache-auto-cleanup/v1";
export const DEFAULT_AUTOMATIC_CACHE_INTERVAL_HOURS = 24;
export const DEFAULT_AUTOMATIC_CACHE_START_DELAY_MS = 2_000;

const VERSION_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const scheduledRoots = new Set<string>();

interface AutomaticCacheState {
  schema: string;
  last_attempt_ms: number;
}

export interface AutomaticCacheCleanupPlan {
  args: string[];
  root: string;
  version: string;
  workerPath: string;
}

export interface AutomaticCacheCleanupScheduleOptions {
  environment?: NodeJS.ProcessEnv;
  home?: string;
  now?: number;
  spawnProcess?: typeof spawn;
  startDelayMs?: number;
  workerPath?: string;
  setTimer?: typeof setTimeout;
}

function samePath(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === "win32"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

function enabled(value: string | undefined): boolean {
  if (value === undefined || value === "") return true;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function positiveNumber(value: string | undefined, fallback: number): number | undefined {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function defaultRoot(environment: NodeJS.ProcessEnv, home: string): string {
  return join(environment.XDG_CACHE_HOME || join(home, ".cache"), "sagejs", "modules");
}

function recentAutomaticAttempt(
  root: string,
  now: number,
  intervalMs: number,
): boolean | undefined {
  const filename = join(root, AUTOMATIC_CACHE_STATE_FILENAME);
  if (!existsSync(filename)) return false;
  try {
    const metadata = lstatSync(filename);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return undefined;
    const state = JSON.parse(readFileSync(filename, "utf8")) as AutomaticCacheState;
    if (
      state.schema !== AUTOMATIC_CACHE_STATE_SCHEMA ||
      !Number.isFinite(state.last_attempt_ms) ||
      state.last_attempt_ms < 0
    ) return undefined;
    return now - state.last_attempt_ms < intervalMs;
  } catch (_error) {
    // A malformed or concurrently replaced maintenance marker disables the
    // automatic path. Manual `sagejs cache prune` remains available.
    return undefined;
  }
}

/**
 * Return the detached worker invocation for a standard versioned cache.
 *
 * This performs only a few metadata reads. Recursive inspection and deletion
 * are deliberately left to the worker so runtime startup never waits for a
 * potentially large cache traversal.
 */
export function automaticModuleCacheCleanupPlan(
  versionDirectory: string,
  options: AutomaticCacheCleanupScheduleOptions = {},
): AutomaticCacheCleanupPlan | undefined {
  const environment = options.environment ?? process.env;
  if (!enabled(environment.SAGEJS_MODULE_CACHE_AUTO_CLEANUP)) return undefined;
  const intervalHours = positiveNumber(
    environment.SAGEJS_MODULE_CACHE_AUTO_CLEANUP_INTERVAL_HOURS,
    DEFAULT_AUTOMATIC_CACHE_INTERVAL_HOURS,
  );
  if (intervalHours === undefined) return undefined;

  const directory = resolve(versionDirectory);
  const version = basename(directory);
  const root = dirname(directory);
  if (!VERSION_PATTERN.test(version)) return undefined;
  const expectedRoot = resolve(defaultRoot(
    environment,
    options.home ?? homedir(),
  ));
  if (!samePath(root, expectedRoot)) return undefined;
  try {
    const rootMetadata = lstatSync(root);
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
      return undefined;
    }
    const versionMetadata = lstatSync(directory);
    if (!versionMetadata.isDirectory() || versionMetadata.isSymbolicLink()) {
      return undefined;
    }
  } catch (_error) {
    return undefined;
  }

  const now = options.now ?? Date.now();
  const recent = recentAutomaticAttempt(root, now, intervalHours * 60 * 60 * 1_000);
  if (recent !== false) return undefined;
  const workerPath = options.workerPath ?? join(__dirname, "cache-auto-worker.js");
  return {
    args: [workerPath, "--root", root, "--version", version],
    root,
    version,
    workerPath,
  };
}

/** Schedule advisory cache maintenance without holding the calling process. */
export function scheduleAutomaticModuleCacheCleanup(
  versionDirectory: string,
  options: AutomaticCacheCleanupScheduleOptions = {},
): boolean {
  const plan = automaticModuleCacheCleanupPlan(versionDirectory, options);
  if (!plan || scheduledRoots.has(plan.root)) return false;
  scheduledRoots.add(plan.root);
  const setTimer = options.setTimer ?? setTimeout;
  const timer = setTimer(() => {
    try {
      const spawnProcess = options.spawnProcess ?? spawn;
      const child = spawnProcess(process.execPath, plan.args, {
        detached: true,
        env: options.environment ?? process.env,
        stdio: "ignore",
        windowsHide: true,
      });
      child.once("error", () => {});
      child.unref();
    } catch (_error) {
      // Cache maintenance is always advisory and must not affect startup.
    }
  }, options.startDelayMs ?? DEFAULT_AUTOMATIC_CACHE_START_DELAY_MS);
  timer.unref?.();
  return true;
}

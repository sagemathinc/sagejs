import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  join,
  parse,
  resolve,
} from "node:path";

import createCompiler from "./compiler";
import {
  AUTOMATIC_CACHE_STATE_FILENAME,
  readAutomaticModuleCacheCleanupState,
} from "./cache-auto";
import {
  MODULE_CACHE_LEASE_PREFIX,
  MODULE_CACHE_LEASE_STALE_MS,
  MODULE_CACHE_LEASE_SUFFIX,
} from "./cache-lease";

const DAY_MS = 24 * 60 * 60 * 1_000;
const GIB = 1024 ** 3;
const VERSION_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const PIN_FILENAME = ".sagejs-keep";

export interface CachePolicy {
  maxAgeDays: number;
  maxBytes: number;
  minAgeDays: number;
  keepVersions: number;
}

export const DEFAULT_CACHE_POLICY: Readonly<CachePolicy> = Object.freeze({
  maxAgeDays: 30,
  maxBytes: 2 * GIB,
  minAgeDays: 7,
  keepVersions: 5,
});

export const CACHE_FAMILIES = ["modules", "dynamic"] as const;
export type CacheFamily = (typeof CACHE_FAMILIES)[number];

export interface CacheVersionEntry {
  ageDays: number;
  bytes: number;
  current: boolean;
  inUse: boolean;
  newest: boolean;
  path: string;
  pinned: boolean;
  reason?: "expired" | "over-size";
  version: string;
}

export interface CachePruneReport {
  applied: boolean;
  candidateBytes: number;
  currentVersions: string[];
  deferredVersions?: string[];
  entries: CacheVersionEntry[];
  errors: Array<{ version: string; message: string }>;
  family: CacheFamily;
  ignoredEntries: string[];
  policy: CachePolicy;
  reclaimedBytes: number;
  removedVersions: string[];
  root: string;
  skippedVersions: string[];
  totalBytes: number;
}

export interface PruneCacheOptions {
  apply?: boolean;
  applyLimits?: Partial<CacheApplyLimits>;
  /** Test-only hook immediately before a planned candidate is rechecked. */
  beforeRemove?: (entry: CacheVersionEntry) => void;
  /** Test-only hook after enumeration and before an entry is inspected. */
  beforeScanEntry?: (path: string) => void;
  currentVersions: string[];
  expectedRoot?: string;
  family?: CacheFamily;
  now?: number;
  policy?: Partial<CachePolicy>;
  root?: string;
}

export interface CacheApplyLimits {
  maxBytes: number;
  maxVersions: number;
  /** Permit one otherwise eligible tree to exceed the byte cap. */
  allowOversizedFirst?: boolean;
}

interface ScannedDirectory {
  bytes: number;
  newestMtimeMs: number;
}

export function defaultModuleCacheRoot(
  environment: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const base = environment.XDG_CACHE_HOME || join(home, ".cache");
  return join(base, "sagejs", "modules");
}

export function defaultDynamicCacheRoot(
  environment: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const base = environment.XDG_CACHE_HOME || join(home, ".cache");
  return join(base, "sagejs", "dynamic");
}

export function defaultVersionedCacheRoot(
  family: CacheFamily,
  environment: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  return family === "modules"
    ? defaultModuleCacheRoot(environment, home)
    : defaultDynamicCacheRoot(environment, home);
}

function samePath(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === "win32"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

function validateCacheRoot(rootValue: string, expectedRootValue: string): string {
  const root = resolve(rootValue);
  const expectedRoot = resolve(expectedRootValue);
  if (!samePath(root, expectedRoot)) {
    throw new Error(`cache prune refused unexpected root: ${root}`);
  }
  if (
    !CACHE_FAMILIES.includes(basename(root).toLowerCase() as CacheFamily) ||
    basename(dirname(root)).toLowerCase() !== "sagejs" ||
    root === parse(root).root ||
    dirname(root) === parse(root).root
  ) {
    throw new Error(`cache prune refused broad root: ${root}`);
  }
  if (!existsSync(root)) return root;
  const metadata = lstatSync(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`cache prune refused non-directory or symlinked root: ${root}`);
  }
  return root;
}

/** Validate one exact module-cache root without scanning or changing it. */
export function validateModuleCacheRoot(
  rootValue: string,
  expectedRootValue: string,
): string {
  return validateCacheRoot(rootValue, expectedRootValue);
}

function scanDirectory(
  directory: string,
  beforeScanEntry?: (path: string) => void,
): ScannedDirectory {
  const rootMetadata = lstatSync(directory);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error(`cache entry is not a real directory: ${directory}`);
  }
  let bytes = 0;
  let newestMtimeMs = rootMetadata.mtimeMs;
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const name of readdirSync(current)) {
      const filename = join(current, name);
      beforeScanEntry?.(filename);
      let metadata;
      try {
        metadata = lstatSync(filename);
      } catch (error) {
        // Directory enumeration is a snapshot. Atomic cache publishers remove
        // their private temporary file after publication, so that file may no
        // longer exist by the time cleanup inspects it. Every other failure is
        // still fatal, including permission errors and unsafe entry types.
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (metadata.isSymbolicLink()) {
        throw new Error(`cache prune refused symlinked entry: ${filename}`);
      }
      newestMtimeMs = Math.max(newestMtimeMs, metadata.mtimeMs);
      if (metadata.isDirectory()) pending.push(filename);
      else if (metadata.isFile()) bytes += metadata.size;
      else throw new Error(`cache prune refused special entry: ${filename}`);
    }
  }
  return { bytes, newestMtimeMs };
}

function hasFreshLease(directory: string, now: number): boolean {
  for (const name of readdirSync(directory)) {
    if (
      !name.startsWith(MODULE_CACHE_LEASE_PREFIX) ||
      !name.endsWith(MODULE_CACHE_LEASE_SUFFIX)
    ) continue;
    const filename = join(directory, name);
    const metadata = lstatSync(filename);
    if (metadata.isSymbolicLink()) {
      throw new Error(`cache prune refused symlinked lease: ${filename}`);
    }
    // Invalid but recent lease contents are preserved conservatively. The
    // heartbeat mtime is sufficient; stale crash remnants expire naturally.
    if (
      metadata.isFile() &&
      now - metadata.mtimeMs <= MODULE_CACHE_LEASE_STALE_MS
    ) return true;
  }
  return false;
}

function finiteNonnegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a nonnegative finite number`);
  }
  return value;
}

function normalizedPolicy(overrides: Partial<CachePolicy> = {}): CachePolicy {
  const policy = { ...DEFAULT_CACHE_POLICY, ...overrides };
  finiteNonnegative("maxAgeDays", policy.maxAgeDays);
  finiteNonnegative("minAgeDays", policy.minAgeDays);
  finiteNonnegative("maxBytes", policy.maxBytes);
  finiteNonnegative("keepVersions", policy.keepVersions);
  if (!Number.isInteger(policy.keepVersions)) {
    throw new Error("keepVersions must be an integer");
  }
  if (policy.minAgeDays > policy.maxAgeDays) {
    throw new Error("minAgeDays cannot exceed maxAgeDays");
  }
  return policy;
}

function inspectCache(options: PruneCacheOptions): CachePruneReport {
  const now = options.now ?? Date.now();
  const policy = normalizedPolicy(options.policy);
  const family = options.family ?? "modules";
  const defaultRoot = defaultVersionedCacheRoot(family);
  const root = validateCacheRoot(
    options.root ?? defaultRoot,
    options.expectedRoot ?? defaultRoot,
  );
  if (basename(root).toLowerCase() !== family) {
    throw new Error(
      `cache prune family ${family} does not match cache root: ${root}`,
    );
  }
  const currentVersions = [...new Set(options.currentVersions)];
  const current = new Set(currentVersions);
  const ignoredEntries: string[] = [];
  const entries: CacheVersionEntry[] = [];
  if (!existsSync(root)) {
    return {
      applied: false,
      candidateBytes: 0,
      currentVersions,
      entries,
      errors: [],
      family,
      ignoredEntries,
      policy,
      reclaimedBytes: 0,
      removedVersions: [],
      root,
      skippedVersions: [],
      totalBytes: 0,
    };
  }

  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) {
      throw new Error(`cache prune refused symlinked root entry: ${path}`);
    }
    if (!VERSION_PATTERN.test(name) || !metadata.isDirectory()) {
      ignoredEntries.push(name);
      continue;
    }
    const scanned = scanDirectory(path, options.beforeScanEntry);
    entries.push({
      ageDays: Math.max(0, (now - scanned.newestMtimeMs) / DAY_MS),
      bytes: scanned.bytes,
      current: current.has(name),
      inUse: hasFreshLease(path, now),
      newest: false,
      path,
      pinned: existsSync(join(path, PIN_FILENAME)),
      version: name,
    });
  }

  entries.sort((left, right) => {
    const age = left.ageDays - right.ageDays;
    return age === 0 ? left.version.localeCompare(right.version) : age;
  });
  entries.slice(0, policy.keepVersions).forEach((entry) => {
    entry.newest = true;
  });
  // These are hard retention guarantees. The age grace below is deliberately
  // separate: high-churn development can create hundreds of fresh compiler
  // hashes, and treating every one as absolutely protected makes maxBytes
  // ineffective precisely when the cache is growing fastest.
  const protectedEntry = (entry: CacheVersionEntry): boolean =>
    entry.current || entry.inUse || entry.pinned || entry.newest;

  for (const entry of entries) {
    if (!protectedEntry(entry) && entry.ageDays >= policy.maxAgeDays) {
      entry.reason = "expired";
    }
  }

  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  let retainedBytes = entries.reduce(
    (sum, entry) => sum + (entry.reason ? 0 : entry.bytes),
    0,
  );
  if (retainedBytes > policy.maxBytes) {
    const oldestFirst = [...entries].reverse();
    // Prefer entries outside the grace window, then cross it only if those are
    // insufficient. This retains the useful meaning of minAgeDays without
    // letting a high-churn burst make maxBytes entirely ineffective.
    for (const mayCrossGrace of [false, true]) {
      for (const entry of oldestFirst) {
        if (retainedBytes <= policy.maxBytes) break;
        if (
          entry.reason ||
          protectedEntry(entry) ||
          (!mayCrossGrace && entry.ageDays < policy.minAgeDays) ||
          (mayCrossGrace && entry.ageDays >= policy.minAgeDays)
        ) continue;
        entry.reason = "over-size";
        retainedBytes -= entry.bytes;
      }
      if (retainedBytes <= policy.maxBytes) break;
    }
  }

  const candidateBytes = entries.reduce(
    (sum, entry) => sum + (entry.reason ? entry.bytes : 0),
    0,
  );
  return {
    applied: false,
    candidateBytes,
    currentVersions,
    entries,
    errors: [],
    family,
    ignoredEntries: ignoredEntries.sort(),
    policy,
    reclaimedBytes: 0,
    removedVersions: [],
    root,
    skippedVersions: [],
    totalBytes,
  };
}

export function pruneModuleCache(options: PruneCacheOptions): CachePruneReport {
  const report = inspectCache(options);
  if (!options.apply) return report;
  report.applied = true;
  const now = options.now ?? Date.now();
  const applyLimits = options.applyLimits
    ? {
        allowOversizedFirst: options.applyLimits.allowOversizedFirst === true,
        maxBytes: finiteNonnegative(
          "applyLimits.maxBytes",
          options.applyLimits.maxBytes ?? Number.MAX_SAFE_INTEGER,
        ),
        maxVersions: finiteNonnegative(
          "applyLimits.maxVersions",
          options.applyLimits.maxVersions ?? Number.MAX_SAFE_INTEGER,
        ),
      }
    : undefined;
  if (applyLimits && !Number.isInteger(applyLimits.maxVersions)) {
    throw new Error("applyLimits.maxVersions must be an integer");
  }
  if (applyLimits) report.deferredVersions = [];

  const candidates = report.entries.filter((candidate) => candidate.reason);
  // Automatic maintenance supplies limits and starts with the oldest trees.
  // Manual pruning deliberately keeps its established plan/application order.
  if (applyLimits) {
    candidates.sort((left, right) => right.ageDays - left.ageDays);
  }
  let attemptedBytes = 0;
  let attemptedVersions = 0;
  let attemptedCandidates = 0;
  for (const entry of candidates) {
    const oversizedFirst =
      applyLimits?.allowOversizedFirst === true &&
      attemptedVersions === 0 &&
      entry.bytes > applyLimits.maxBytes;
    if (
      applyLimits &&
      (attemptedVersions >= applyLimits.maxVersions ||
        attemptedCandidates >= applyLimits.maxVersions * 2 ||
        (!oversizedFirst && attemptedBytes + entry.bytes > applyLimits.maxBytes))
    ) {
      report.deferredVersions!.push(entry.version);
      continue;
    }
    attemptedVersions += 1;
    attemptedCandidates += 1;
    attemptedBytes += entry.bytes;
    const quarantine = join(
      report.root,
      `.sagejs-prune-${process.pid}-${randomBytes(6).toString("hex")}-${entry.version}`,
    );
    try {
      options.beforeRemove?.(entry);
      const metadata = lstatSync(entry.path);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("candidate changed type after inspection");
      }
      // Atomic rename isolates exactly the tree we inspected. If an older
      // runtime recreates its version directory now, that new cache is not part
      // of this deletion.
      renameSync(entry.path, quarantine);
      try {
        // Refuse a symlink or special file introduced after planning and check
        // the moved tree for a lease or pin once more before destructive work.
        scanDirectory(quarantine);
      } catch (error) {
        if (!existsSync(entry.path)) renameSync(quarantine, entry.path);
        throw error;
      }
      if (
        hasFreshLease(quarantine, now) ||
        existsSync(join(quarantine, PIN_FILENAME))
      ) {
        if (existsSync(entry.path)) {
          report.skippedVersions.push(entry.version);
          report.errors.push({
            version: entry.version,
            message:
              `became active or pinned during prune; preserved at ${quarantine}`,
          });
        } else {
          renameSync(quarantine, entry.path);
          report.skippedVersions.push(entry.version);
        }
        continue;
      }
      rmSync(quarantine, { recursive: true, force: false });
      report.removedVersions.push(entry.version);
      report.reclaimedBytes += entry.bytes;
    } catch (error) {
      // A failed candidate did not consume the destructive-work budget. Let a
      // later eligible generation make progress during this same bounded pass.
      attemptedVersions -= 1;
      attemptedBytes -= entry.bytes;
      report.skippedVersions.push(entry.version);
      report.errors.push({
        version: entry.version,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return report;
}

export function parseByteSize(value: string): number {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*(b|kb|kib|mb|mib|gb|gib)?$/i.exec(
    value.trim(),
  );
  if (!match) throw new Error(`invalid byte size: ${value}`);
  const amount = Number(match[1]);
  const suffix = (match[2] ?? "b").toLowerCase();
  const factors: Record<string, number> = {
    b: 1,
    kb: 1_000,
    kib: 1024,
    mb: 1_000_000,
    mib: 1024 ** 2,
    gb: 1_000_000_000,
    gib: GIB,
  };
  const bytes = amount * factors[suffix];
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error(`byte size is outside the safe range: ${value}`);
  }
  return bytes;
}

function parseNumber(name: string, value: unknown): number | undefined {
  if (value === undefined || value === "") return undefined;
  const number = Number(value);
  finiteNonnegative(name, number);
  return number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = "B";
  for (const next of units) {
    value /= 1024;
    unit = next;
    if (value < 1024) break;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${unit}`;
}

export interface CacheCliArguments {
  apply?: boolean;
  dry_run?: boolean;
  family?: "all" | CacheFamily;
  files: string[];
  json?: boolean;
  keep?: string;
  max_age?: string;
  max_size?: string;
  min_age?: string;
}

export async function runCacheCli(argv: CacheCliArguments): Promise<void> {
  const [command, ...extra] = argv.files;
  if (!["prune", "status"].includes(command ?? "") || extra.length > 0) {
    throw new Error(
      command === undefined
        ? "cache command required; use `sagejs cache status` or `sagejs cache prune`"
        : `unknown cache command ${JSON.stringify(command)}; use ` +
          "`sagejs cache status` or `sagejs cache prune`",
    );
  }
  const families = argv.family && argv.family !== "all"
    ? [argv.family]
    : [...CACHE_FAMILIES];
  if (command === "status") {
    const output = Object.fromEntries(families.map((family) => {
      const root = defaultVersionedCacheRoot(family);
      return [family, {
        automatic: readAutomaticModuleCacheCleanupState(root),
        root,
        state_file: join(root, AUTOMATIC_CACHE_STATE_FILENAME),
      }];
    }));
    if (argv.json) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    else {
      for (const family of families) {
        const { automatic, root } = output[family];
        process.stdout.write(`${family === "modules" ? "Module" : "Dynamic code"} cache: ${root}\n`);
        if (!automatic) {
          process.stdout.write("Automatic cleanup: no completed attempt recorded.\n");
        }
        else {
          const removed = automatic.last_removed_versions ?? 0;
          const reclaimed = automatic.last_reclaimed_bytes ?? 0;
          process.stdout.write(
            `Automatic cleanup: ${automatic.last_status ?? "recorded"}; ` +
            `last attempt ${new Date(automatic.last_attempt_ms).toISOString()}; ` +
            `removed ${removed} version(s), ${formatBytes(reclaimed)}.\n` +
            `Next attempt eligible ${new Date(
              automatic.next_attempt_ms ?? automatic.last_attempt_ms,
            ).toISOString()}.\n`,
          );
          if (automatic.last_error) {
            process.stdout.write(`Last error: ${automatic.last_error}\n`);
          }
        }
      }
    }
    return;
  }
  if (argv.apply && argv.dry_run) {
    throw new Error("--apply and --dry-run cannot be used together");
  }
  const maxAgeDays = parseNumber("max-age", argv.max_age);
  const minAgeDays = parseNumber("min-age", argv.min_age);
  const keepVersions = parseNumber("keep", argv.keep);
  const policy: Partial<CachePolicy> = {
    ...(maxAgeDays === undefined ? {} : { maxAgeDays }),
    ...(minAgeDays === undefined ? {} : { minAgeDays }),
    ...(keepVersions === undefined ? {} : { keepVersions }),
    ...(argv.max_size ? { maxBytes: parseByteSize(argv.max_size) } : {}),
  };
  const currentVersion = createCompiler().get_compiler_version();
  const reports = Object.fromEntries(families.map((family) => [
    family,
    pruneModuleCache({
      apply: argv.apply === true && argv.dry_run !== true,
      currentVersions: [currentVersion],
      family,
      policy,
    }),
  ])) as Partial<Record<CacheFamily, CachePruneReport>>;
  const report = {
    applied: argv.apply === true && argv.dry_run !== true,
    candidateBytes: Object.values(reports).reduce(
      (sum, item) => sum + item!.candidateBytes,
      0,
    ),
    families: reports,
    reclaimedBytes: Object.values(reports).reduce(
      (sum, item) => sum + item!.reclaimedBytes,
      0,
    ),
    totalBytes: Object.values(reports).reduce(
      (sum, item) => sum + item!.totalBytes,
      0,
    ),
  };
  if (argv.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    for (const family of families) {
      const item = reports[family]!;
      process.stdout.write(
        `${family === "modules" ? "Module" : "Dynamic code"} cache: ${item.root}\n` +
        `Scanned ${item.entries.length} compiler version(s), ` +
        `${formatBytes(item.totalBytes)} total.\n` +
        `${item.applied ? "Removed" : "Would remove"} ` +
        `${item.applied ? item.removedVersions.length : item.entries.filter((entry) => entry.reason).length} ` +
        `version(s), ${formatBytes(item.applied ? item.reclaimedBytes : item.candidateBytes)}.\n`,
      );
      if (item.skippedVersions.length > 0) {
        process.stdout.write(
          `Preserved ${item.skippedVersions.length} version(s) that changed or became active.\n`,
        );
      }
    }
    if (!report.applied) {
      process.stdout.write("Dry run only; pass --apply to remove these versions.\n");
    }
  }
  if (Object.values(reports).some((item) => item!.errors.length > 0)) {
    process.exitCode = 1;
  }
}

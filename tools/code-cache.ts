/**
 * Make V8 code-cache rejection observable during release measurements.
 *
 * V8 safely compiles source when cached data is stale or incompatible. That is
 * the correct production fallback, but silently taking it makes a startup
 * benchmark incapable of distinguishing cached startup from source
 * compilation. Release measurements set `SAGEJS_CODE_CACHE_DIAGNOSTICS=error`
 * so every cache consumer fails at the point where V8 rejects its bytes.
 */

import type { Script } from "vm";

export const CODE_CACHE_DIAGNOSTICS_ENV =
  "SAGEJS_CODE_CACHE_DIAGNOSTICS";

export type CodeCacheDiagnostics = "off" | "warn" | "error";

export function codeCacheDiagnostics(
  environment: NodeJS.ProcessEnv = process.env,
): CodeCacheDiagnostics {
  const value = environment[CODE_CACHE_DIAGNOSTICS_ENV];
  if (value === undefined || value === "" || value === "off") return "off";
  if (value === "warn" || value === "error") return value;
  throw new Error(
    `${CODE_CACHE_DIAGNOSTICS_ENV} must be off, warn, or error; got ` +
      JSON.stringify(value),
  );
}

/**
 * Return whether V8 rejected the cached data attached to `script`.
 *
 * Call this immediately after every `new vm.Script(..., {cachedData})`. In
 * ordinary execution rejection remains a safe, silent source-compilation
 * fallback. Diagnostic mode either reports that fallback or makes it fatal.
 */
export function observeCodeCache(
  script: Pick<Script, "cachedDataRejected">,
  component: string,
  options: {
    environment?: NodeJS.ProcessEnv;
    writeDiagnostic?: (message: string) => void;
  } = {},
): boolean {
  if (!script.cachedDataRejected) return false;
  const diagnostics = codeCacheDiagnostics(options.environment);
  if (diagnostics === "off") return true;
  const message = `Sage.js V8 code cache rejected: ${component}`;
  if (diagnostics === "error") throw new Error(message);
  (options.writeDiagnostic ?? ((text) => process.stderr.write(text)))(
    `${message}\n`,
  );
  return true;
}

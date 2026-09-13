/** Standalone compiler dependencies from source or embedded host resources.
 *
 * Browser bundlers replace this boundary with compiler-resources.ts, which
 * reads the same dependency list from the production standard-library document.
 */
export function coreStandaloneModules(): readonly string[] {
  return require("./standalone-library.cjs").CORE_STANDALONE_MODULES;
}

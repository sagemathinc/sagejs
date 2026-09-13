"use strict";

/**
 * Environment for sanitizer-backed native lifecycle witnesses.
 *
 * Apple's AddressSanitizer runtime does not implement LeakSanitizer. Asking it
 * for `detect_leaks=1` terminates the witness before any resource code runs, so
 * retain ASan/UBSan there while leaving leak detection enabled on platforms
 * whose runtime supports it.
 */
function sanitizerEnvironment({ strictStringChecks = false } = {}) {
  const address = [
    `detect_leaks=${process.platform === "darwin" ? 0 : 1}`,
    "halt_on_error=1",
  ];
  if (strictStringChecks) address.push("strict_string_checks=1");
  return {
    ...process.env,
    ASAN_OPTIONS: address.join(":"),
    UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1",
  };
}

/**
 * Select the sanitizer set supported reliably by the current host runtime.
 *
 * Apple AddressSanitizer can deadlock while initializing its allocator on
 * supported macOS hosts, before the test executable reaches `main`. Retain
 * UndefinedBehaviorSanitizer there; Linux additionally supplies address and
 * leak coverage for the same native witnesses.
 */
function sanitizerCompilerFlag() {
  return process.platform === "darwin"
    ? "-fsanitize=undefined"
    : "-fsanitize=address,undefined";
}

module.exports = { sanitizerCompilerFlag, sanitizerEnvironment };

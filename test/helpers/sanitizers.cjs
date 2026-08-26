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
 * Keep deterministic sanitizer stress useful on Apple's much slower runtime.
 *
 * Linux retains the complete acceptance count.  Sixteen macOS rounds still
 * exercise distinct seeded values and every lifecycle edge repeatedly, while
 * avoiding multi-minute individual test files in the release matrix.
 */
function sanitizerRounds(fullCount) {
  if (!Number.isSafeInteger(fullCount) || fullCount < 1) {
    throw new RangeError("sanitizer round count must be a positive integer");
  }
  return process.platform === "darwin" ? Math.min(fullCount, 16) : fullCount;
}

module.exports = { sanitizerEnvironment, sanitizerRounds };

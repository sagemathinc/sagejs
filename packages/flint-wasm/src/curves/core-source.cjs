"use strict";

/*
 * Transitional source-preserving extraction of the host-neutral mathematical
 * prefix from the historical combined Node adapter. This does not fork the
 * algorithm: every Wasm build consumes the authoritative source body in
 * packages/flint/src/elliptic_lfunction.c. Once that file is physically split
 * by its owning lane, this extractor can disappear and both hosts can compile
 * the shared core directly.
 */

const CORE_END_MARKER = "static int check_napi(napi_env env, napi_status status)";
const REMOVED_INCLUDES = [
  '#include "elliptic_lfunction.h"\n',
  "#include <node_api.h>\n",
];

function ellipticLseriesCoreSource(source) {
  if (typeof source !== "string") {
    throw new TypeError("elliptic L-series source must be text");
  }
  const marker = source.indexOf(CORE_END_MARKER);
  if (marker < 0 || source.indexOf(CORE_END_MARKER, marker + 1) >= 0) {
    throw new Error("the elliptic L-series host/core boundary marker drifted");
  }
  let core = source.slice(0, marker);
  for (const include of REMOVED_INCLUDES) {
    const index = core.indexOf(include);
    if (index < 0 || core.indexOf(include, index + include.length) >= 0) {
      throw new Error(`the expected host include ${include.trim()} drifted`);
    }
    core = core.slice(0, index) + core.slice(index + include.length);
  }
  if (/\bnapi_|node_api|\bv8::/.test(core)) {
    throw new Error("the extracted elliptic L-series core still contains host ABI symbols");
  }
  return (
    "/* Generated from packages/flint/src/elliptic_lfunction.c; do not edit. */\n" +
    core.trimEnd() +
    "\n"
  );
}

module.exports = Object.freeze({
  CORE_END_MARKER,
  ellipticLseriesCoreSource,
});


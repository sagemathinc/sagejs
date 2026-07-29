#!/usr/bin/env node
"use strict";

/*
 * Generate the compact, browser-safe RH zeta-zero fixture.
 *
 * The input is SageMath's database_odlyzko_zeta zeros6 table.  We retain the
 * first 15,000 rows at the table's 1e-9 precision, delta-encode nanounits as
 * unsigned LEB128, and base64-encode the result for a lazy baselib decoder.
 */

const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const expectedSha256 =
  "2ef7b752c2f17405222e670a61098250c8e4e09047f823f41e2b41a7b378e7c6";
const count = 15_000;
const source = process.argv[2];
const output = process.argv[3] ?? "src/baselib/zeta_data.py";

if (!source) {
  throw new Error(
    "usage: node scripts/build-odlyzko-subset.cjs ZEROS6 [OUTPUT]",
  );
}

const raw = readFileSync(resolve(source));
const digest = createHash("sha256").update(raw).digest("hex");
if (digest !== expectedSha256) {
  throw new Error(`unexpected zeros6 SHA-256: ${digest}`);
}

const values = raw
  .toString("ascii")
  .trim()
  .split(/\s+/)
  .slice(0, count)
  .map((value) => Math.round(Number(value) * 1e9));
if (values.length !== count || values.some((value) => !Number.isSafeInteger(value))) {
  throw new Error("unable to decode the requested zeros6 prefix");
}

const bytes = [];
let previous = 0;
for (const value of values) {
  let delta = value - previous;
  previous = value;
  while (delta >= 128) {
    bytes.push((delta % 128) + 128);
    delta = Math.floor(delta / 128);
  }
  bytes.push(delta);
}

const encoded = Buffer.from(bytes).toString("base64");
const wrapped = [];
for (let offset = 0; offset < encoded.length; ) {
  let width = Math.min(76, encoded.length - offset);
  // Keep generated data from accidentally resembling the compiler's v'...'
  // verbatim-JavaScript extension at a Python string boundary.
  if (encoded[offset + width - 1] === "v" && width > 1) width -= 1;
  wrapped.push(encoded.slice(offset, offset + width));
  offset += width;
}
const literal = wrapped.map((line) => `    '${line}'`).join("\n");
const generated = `# Generated from SageMath database_odlyzko_zeta 20061209.
#
# Source SHA-256: ${expectedSha256}
# The first ${count} zero ordinates retain the source table's 1e-9 precision.
# Regenerate with scripts/build-odlyzko-subset.cjs; do not edit by hand.

from __future__ import annotations

import sagejs.runtime as runtime

_ODLYZKO_ZEROS_NANO_LEB128 = (
${literal}
)
_odlyzko_zero_cache = []


def odlyzko_zeta_zeros() -> list[float]:
    if len(_odlyzko_zero_cache):
        return _odlyzko_zero_cache
    decode = runtime.reflect.get(runtime.global_object, 'atob')
    packed = runtime.reflect.apply(
        decode, runtime.undefined, [_ODLYZKO_ZEROS_NANO_LEB128])
    current = 0
    delta = 0
    factor = 1
    for index in range(len(packed)):
        byte = runtime.reflect.apply(
            runtime.string_class.prototype.charCodeAt,
            packed,
            [index],
        )
        delta += (byte % 128) * factor
        if byte < 128:
            current += delta
            _odlyzko_zero_cache.append(current / 1000000000.0)
            delta = 0
            factor = 1
        else:
            factor *= 128
    if delta != 0 or len(_odlyzko_zero_cache) != ${count}:
        raise RuntimeError('corrupt embedded Odlyzko zeta-zero data')
    return _odlyzko_zero_cache
`;

writeFileSync(resolve(output), generated);
process.stdout.write(
  `wrote ${count} zeros (${bytes.length} bytes, ${encoded.length} base64 chars) to ${output}\n`,
);

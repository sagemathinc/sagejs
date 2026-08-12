#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

async function main() {
  const samples = Math.max(3, Number(process.env.SAGEJS_ASCII_SAMPLES || 7));
  const scale = Number(process.env.SAGEJS_ASCII_BUDGET_SCALE || 1);
  const session = await createSage();
  try {
    await session.evaluate(String.raw`
import sagejs.runtime as runtime
constructor = runtime.reflect.get(runtime.global_object, "Uint8Array")
ascii_values = runtime.reflect.construct(constructor, [2**20])
runtime.reflect.apply(
    runtime.reflect.get(ascii_values, "fill"), ascii_values, [65]
)
ascii_source = bytes(ascii_values)
def decode_ascii():
    return ascii_source.decode("ascii")
def elapsed(callable):
    started = runtime.wall_time()
    result = callable()
    assert len(result) > 0
    return (runtime.wall_time() - started) * 1000
`);

    await session.evaluate("decode_ascii()");
    const timings = [];
    for (let sample = 0; sample < samples; sample += 1) {
      timings.push(Number((await session.evaluate("elapsed(decode_ascii)")).repr));
    }
    const measured = median(timings);
    const limit = 5 * scale;
    console.log(
      `${"ASCII decode 1 MiB".padEnd(24)} ${measured.toFixed(3)} ms / ${limit.toFixed(3)} ms`,
    );
    if (!(measured > 0 && measured <= limit)) {
      throw new Error("ASCII decode budget exceeded");
    }

    let nativeFormatting = false;
    try {
      const setup = await session.evaluate(String.raw`
zz_matrix = matrix(ZZ, 200, [index for index in range(200 * 200)])
qq_matrix = matrix(QQ, 200, [QQ(index, index % 17 + 1) for index in range(200 * 200)])
ring = PolynomialRing(ZZ, "x")
exact_polynomial = ring([index + 1 for index in range(10000)])
def format_zz(): return zz_matrix.str()
def format_qq(): return qq_matrix.str()
def format_polynomial(): return str(exact_polynomial)
print("native-formatting-ready")
`);
      nativeFormatting = setup.stdout.includes("native-formatting-ready");
    } catch (error) {
      console.log(`native formatting skipped: ${error.message}`);
    }
    if (nativeFormatting) {
      for (const [name, callable] of [
        ["ZZ matrix str 200x200", "format_zz"],
        ["QQ matrix str 200x200", "format_qq"],
        ["ZZ polynomial str 10000", "format_polynomial"],
      ]) {
        await session.evaluate(`${callable}()`);
        const values = [];
        for (let sample = 0; sample < samples; sample += 1) {
          values.push(Number((await session.evaluate(`elapsed(${callable})`)).repr));
        }
        console.log(`${name.padEnd(24)} ${median(values).toFixed(3)} ms`);
      }
    }
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});


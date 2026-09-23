// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { compileKernel } = require("../compiler.cjs");

const producerSource = String.raw`
from sagejs.native import native


@native
def buffer_producer(value: int) -> int:
    return value
`;

const consumerSource = String.raw`
from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native


@native
def consume_integer(values: IntegerBuffer) -> int:
    values[0] = values[0] + 1208925819614629174706176
    return values[0]


@native
def consume_int64(values: Int64Buffer) -> int:
    values[0] = values[0] - 9
    return values[0]


@native
def consume_float64(values: Float64Buffer) -> float:
    values[0] = values[0] + 0.25
    return values[0]
`;

test("host-owned native buffers cross separately compiled addons without copies", {
  timeout: 180_000,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-cross-addon-buffers-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const producerPath = join(temporary, "producer.py");
  const consumerPath = join(temporary, "consumer.py");
  const cacheRoot = join(temporary, "cache");
  writeFileSync(producerPath, producerSource);
  writeFileSync(consumerPath, consumerSource);

  // Compile sequentially: the frontend owns one WebAssembly parser instance.
  const producerBuild = await compileKernel({
    sourcePath: producerPath,
    cacheRoot,
  });
  const consumerBuild = await compileKernel({
    sourcePath: consumerPath,
    cacheRoot,
  });
  assert.notEqual(producerBuild.addonPath, consumerBuild.addonPath);

  const producer = require(producerBuild.modulePath).buffer_producer;
  const consumer = require(consumerBuild.modulePath);
  assert.equal(producer.nativeAvailable, true);
  assert.equal(consumer.consume_integer.nativeAvailable, true);
  assert.equal(consumer.consume_int64.nativeAvailable, true);
  assert.equal(consumer.consume_float64.nativeAvailable, true);
  const integers = producer.createIntegerBuffer(1, 4, [3n]);
  const int64s = producer.createInt64Buffer([-4n]);
  const floats = producer.createFloat64Buffer([1.5]);
  const integerSizes = integers.sizes.buffer;
  const integerLimbs = integers.limbs.buffer;
  const int64Storage = int64s.buffer;
  const float64Storage = floats.buffer;

  assert.equal(consumer.consume_integer.gmp(integers), (1n << 80n) + 3n);
  assert.equal(consumer.consume_int64.gmp(int64s), -13n);
  assert.equal(consumer.consume_float64(floats), 1.75);

  // The receiving addon mutates the producer's exact host storage in place.
  assert.equal(integers.sizes.buffer, integerSizes);
  assert.equal(integers.limbs.buffer, integerLimbs);
  assert.equal(int64s.buffer, int64Storage);
  assert.equal(floats.buffer, float64Storage);
  assert.deepEqual(integers.toArray(), [(1n << 80n) + 3n]);
  assert.deepEqual(Array.from(int64s), [-13n]);
  assert.deepEqual(Array.from(floats), [1.75]);

  // A packed arbitrary-precision owner is not an Int64Buffer even when its
  // current entries happen to fit. Reject the ABI mismatch before indexing.
  assert.throws(
    () => consumer.consume_int64.gmp(integers),
    /values must be an Int64Buffer, not an IntegerBuffer/,
  );
  assert.throws(
    () => consumer.consume_float64(integers),
    /values must be a Float64Buffer, not an IntegerBuffer/,
  );
});

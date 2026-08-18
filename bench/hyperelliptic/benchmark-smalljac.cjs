"use strict";

const { createHash } = require("node:crypto");
const { hostname, platform, arch, release } = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

const { createSage } = require("../../dist/tools/kernel.js");

const addon = require(join(
  __dirname,
  "..",
  "..",
  "packages",
  "flint",
  "build",
  "Release",
  "sagejs_flint.node",
));

function parseArguments(argv) {
  const answer = { limits: [10_000, 100_000], repeat: 3 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--limits") {
      answer.limits = argv[++index].split(",").map(Number);
    } else if (argv[index] === "--repeat") {
      answer.repeat = Number(argv[++index]);
    } else {
      throw new Error(`unknown argument ${argv[index]}`);
    }
  }
  if (
    answer.repeat < 1 ||
    !Number.isInteger(answer.repeat) ||
    answer.limits.some(
      (value) => !Number.isInteger(value) || value < 3 || value >= 2 ** 32,
    )
  ) {
    throw new Error("limits and repeat must be positive bounded integers");
  }
  return answer;
}

function hashPacked(batch) {
  const hash = createHash("sha256");
  for (const array of [
    batch.primes,
    batch.good,
    batch.coefficientCounts,
    batch.coefficients,
    batch.rowStatus,
  ]) {
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  }
  return hash.digest("hex");
}

function timed(callback) {
  const cpu = process.cpuUsage();
  const started = performance.now();
  const value = callback();
  const elapsed = performance.now() - started;
  const used = process.cpuUsage(cpu);
  return {
    value,
    sample: {
      wall_ms: elapsed,
      cpu_user_ms: used.user / 1000,
      cpu_system_ms: used.system / 1000,
      rss_bytes: process.memoryUsage().rss,
    },
  };
}

async function timedAsync(callback) {
  const cpu = process.cpuUsage();
  const started = performance.now();
  const value = await callback();
  const elapsed = performance.now() - started;
  const used = process.cpuUsage(cpu);
  return {
    value,
    sample: {
      wall_ms: elapsed,
      cpu_user_ms: used.user / 1000,
      cpu_system_ms: used.system / 1000,
      rss_bytes: process.memoryUsage().rss,
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const session = await createSage();
  const output = {
    schema: "sagejs.hyperelliptic-smalljac-benchmark.v1",
    generated_at_utc: new Date().toISOString(),
    host: {
      hostname: hostname(),
      platform: platform(),
      architecture: arch(),
      release: release(),
      node: process.version,
    },
    backend: addon.smalljacCapabilities(),
    curve: "y^2=x^5+x+1",
    samples: [],
  };
  try {
    await session.evaluate(
      "R=PolynomialRing(QQ,'x'); x=R.gen(); " +
        "C=HyperellipticCurve(x^5+x+1)",
    );
    addon.smalljacLpolyBatch("x^5+x+1", 3n, 101n);
    await session.evaluate("C.local_lpolynomials(3,101,'smalljac')");
    for (const limit of options.limits) {
      for (let repetition = 0; repetition < options.repeat; repetition += 1) {
        const packed = timed(() =>
          addon.smalljacLpolyBatch("x^5+x+1", 3n, BigInt(limit)),
        );
        const publicResult = await timedAsync(() =>
          session.evaluate(
            `v=C.local_lpolynomials(3,${limit},'smalljac',65536)\n` +
              "[len(v),sum(p for p,L in v)," +
              "sum(L[1] for p,L in v),sum(L[2] for p,L in v)]",
            { timeout: 3_600_000 },
          ),
        );
        output.samples.push({
          limit,
          repetition,
          rows: packed.value.rowCount,
          good_rows: Array.from(packed.value.good).reduce(
            (sum, value) => sum + value,
            0,
          ),
          exact_stream_sha256: hashPacked(packed.value),
          packed: packed.sample,
          public_materialized: publicResult.sample,
          public_checksum: publicResult.value.repr,
        });
      }
    }
  } finally {
    await session.close();
  }
  process.stdout.write(
    `${JSON.stringify(
      output,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

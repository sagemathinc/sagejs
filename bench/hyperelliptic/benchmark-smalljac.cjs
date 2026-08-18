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
  const answer = {
    limits: [10_000, 100_000],
    repeat: 3,
    curves: ["quintic"],
    publicMode: "materialized",
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--limits") {
      answer.limits = argv[++index].split(",").map(Number);
    } else if (argv[index] === "--repeat") {
      answer.repeat = Number(argv[++index]);
    } else if (argv[index] === "--curves") {
      answer.curves = argv[++index].split(",");
    } else if (argv[index] === "--public-mode") {
      answer.publicMode = argv[++index];
    } else if (argv[index] === "--packed-only") {
      answer.publicMode = "none";
    } else {
      throw new Error(`unknown argument ${argv[index]}`);
    }
  }
  if (
    answer.repeat < 1 ||
    !Number.isInteger(answer.repeat) ||
    answer.limits.some(
      (value) => !Number.isInteger(value) || value < 3 || value >= 2 ** 32,
    ) ||
    answer.curves.length === 0 ||
    answer.curves.some((value) => !Object.hasOwn(curveModels, value)) ||
    !["none", "materialized", "streamed", "both"].includes(answer.publicMode)
  ) {
    throw new Error(
      "limits/repeat, curves, or public mode are outside the benchmark contract",
    );
  }
  return answer;
}

const curveModels = {
  quintic: {
    native: "x^5+x+1",
    sage: "x^5+x+1",
  },
  sextic: {
    native: "x^6+x+1",
    sage: "x^6+x+1",
  },
};

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

function fnvWord(hash, value) {
  const word = BigInt.asUintN(64, BigInt(value));
  for (let index = 0n; index < 8n; index += 1n) {
    hash ^= (word >> (8n * index)) & 255n;
    hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
  }
  return hash;
}

function fnvPacked(batch) {
  let hash = 14_695_981_039_346_656_037n;
  for (let row = 0; row < batch.rowCount; row += 1) {
    hash = fnvWord(hash, batch.primes[row]);
    hash = fnvWord(hash, batch.good[row]);
    hash = fnvWord(hash, batch.coefficientCounts[row]);
    hash = fnvWord(hash, batch.rowStatus[row]);
    hash = fnvWord(hash, batch.coefficients[2 * row]);
    hash = fnvWord(hash, batch.coefficients[2 * row + 1]);
  }
  return hash.toString(16).padStart(16, "0");
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
  const session =
    options.publicMode === "none" ? undefined : await createSage();
  const output = {
    schema: "sagejs.hyperelliptic-smalljac-benchmark.v2",
    generated_at_utc: new Date().toISOString(),
    host: {
      hostname: hostname(),
      platform: platform(),
      architecture: arch(),
      release: release(),
      node: process.version,
    },
    backend: addon.smalljacCapabilities(),
    curves: options.curves.map((name) => ({
      name,
      equation: `y^2=${curveModels[name].sage}`,
    })),
    public_mode: options.publicMode,
    samples: [],
  };
  try {
    if (session !== undefined) {
      await session.evaluate("R=PolynomialRing(QQ,'x'); x=R.gen()");
    }
    for (const curveName of options.curves) {
      const model = curveModels[curveName];
      const variable = `C_${curveName}`;
      addon.smalljacLpolyBatch(model.native, 3n, 101n);
      if (session !== undefined) {
        await session.evaluate(
          `${variable}=HyperellipticCurve(${model.sage})\n` +
            `${variable}.local_lpolynomials(3,101,'smalljac')`,
        );
      }
      for (const limit of options.limits) {
        for (let repetition = 0; repetition < options.repeat; repetition += 1) {
          const packed = timed(() =>
            addon.smalljacLpolyBatch(model.native, 3n, BigInt(limit)),
          );
          const sample = {
            curve: curveName,
            limit,
            repetition,
            rows: packed.value.rowCount,
            good_rows: Array.from(packed.value.good).reduce(
              (sum, value) => sum + value,
              0,
            ),
            exact_stream_sha256: hashPacked(packed.value),
            exact_stream_fnv64: fnvPacked(packed.value),
            packed: packed.sample,
          };
          if (
            session !== undefined &&
            ["materialized", "both"].includes(options.publicMode)
          ) {
            const publicResult = await timedAsync(() =>
              session.evaluate(
                `v=${variable}.local_lpolynomials(3,${limit},'smalljac',65536)\n` +
                  "[len(v),sum(p for p,L in v)," +
                  "sum(L[1] for p,L in v),sum(L[2] for p,L in v)]",
                { timeout: 3_600_000 },
              ),
            );
            sample.public_materialized = publicResult.sample;
            sample.public_materialized_checksum = publicResult.value.repr;
          }
          if (
            session !== undefined &&
            ["streamed", "both"].includes(options.publicMode)
          ) {
            const streamedResult = await timedAsync(() =>
              session.evaluate(
                "count=0; prime_sum=0; c1_sum=0; c2_sum=0\n" +
                  `for chunk in ${variable}.local_lpolynomial_chunks(3,${limit},'smalljac',4096):\n` +
                  "    for p,L in chunk:\n" +
                  "        count+=1; prime_sum+=p; c1_sum+=L[1]; c2_sum+=L[2]\n" +
                  "[count,prime_sum,c1_sum,c2_sum]",
                { timeout: 3_600_000 },
              ),
            );
            sample.public_streamed = streamedResult.sample;
            sample.public_streamed_checksum = streamedResult.value.repr;
          }
          output.samples.push(sample);
        }
      }
    }
  } finally {
    if (session !== undefined) await session.close();
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

"use strict";

const { createHash } = require("node:crypto");
const { arch, hostname, platform, release } = require("node:os");
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

function options(argv) {
  const result = { limits: [10_000, 100_000], repeat: 3, chunkSize: 4096 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--limits") {
      result.limits = argv[++index].split(",").map(Number);
    } else if (argument === "--repeat") {
      result.repeat = Number(argv[++index]);
    } else if (argument === "--chunk-size") {
      result.chunkSize = Number(argv[++index]);
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }
  if (
    !Number.isInteger(result.repeat) ||
    result.repeat < 1 ||
    !Number.isInteger(result.chunkSize) ||
    result.chunkSize < 1 ||
    result.limits.some(
      (limit) => !Number.isInteger(limit) || limit < 3 || limit >= 2 ** 32,
    )
  ) {
    throw new Error("invalid limits, repeat count, or chunk size");
  }
  return result;
}

function packedDigest(batch) {
  const hash = createHash("sha256");
  for (const values of [
    batch.primes,
    batch.good,
    batch.coefficientCounts,
    batch.coefficients,
    batch.rowStatus,
  ]) {
    hash.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
  }
  return hash.digest("hex");
}

function timing(value, started, cpu) {
  const used = process.cpuUsage(cpu);
  return {
    value,
    wall_ms: performance.now() - started,
    cpu_user_ms: used.user / 1000,
    cpu_system_ms: used.system / 1000,
    rss_bytes: process.memoryUsage().rss,
  };
}

function timed(callback) {
  const cpu = process.cpuUsage();
  const started = performance.now();
  return timing(callback(), started, cpu);
}

async function timedAsync(callback) {
  const cpu = process.cpuUsage();
  const started = performance.now();
  return timing(await callback(), started, cpu);
}

async function evaluateMode(session, mode, limit, chunkSize) {
  const prelude = [
    "count=0",
    "prime_sum=0",
    "c1_sum=0",
    "c2_sum=0",
  ];
  let body;
  if (mode === "coefficients") {
    body = [
      "from sagejs.hyperelliptic_curves.frobenius import rational_local_coefficient_chunks",
      `for chunk in rational_local_coefficient_chunks(C,3,${limit},'smalljac',${chunkSize}):`,
      "    for p,coefficients,backend in chunk:",
      "        count+=1; prime_sum+=p",
      "        c1_sum+=coefficients[1]; c2_sum+=coefficients[2]",
    ];
  } else if (mode === "public_polynomials") {
    body = [
      `for chunk in C.local_lpolynomial_chunks(3,${limit},'smalljac',${chunkSize}):`,
      "    for p,L in chunk:",
      "        coefficients=L.list()",
      "        count+=1; prime_sum+=p",
      "        c1_sum+=coefficients[1]; c2_sum+=coefficients[2]",
    ];
  } else if (mode === "records_coefficients") {
    body = [
      `for record in C.local_data(3,${limit},algorithm='smalljac',chunk_size=${chunkSize}):`,
      "    if record.available:",
      "        coefficients=record.coefficients",
      "        count+=1; prime_sum+=record.prime",
      "        c1_sum+=coefficients[1]; c2_sum+=coefficients[2]",
    ];
  } else if (mode === "records_polynomials") {
    body = [
      `for record in C.local_data(3,${limit},algorithm='smalljac',chunk_size=${chunkSize}):`,
      "    if record.available:",
      "        coefficients=record.lpolynomial.list()",
      "        count+=1; prime_sum+=record.prime",
      "        c1_sum+=coefficients[1]; c2_sum+=coefficients[2]",
    ];
  } else {
    throw new Error(`unknown benchmark mode ${mode}`);
  }
  const result = await session.evaluate(
    [...prelude, ...body, "(count,prime_sum,c1_sum,c2_sum)"].join("\n"),
    { timeout: 3_600_000 },
  );
  return result.repr;
}

async function main() {
  const config = options(process.argv.slice(2));
  const session = await createSage();
  const receipt = {
    schema: "sagejs.hyperelliptic-local-materialization-benchmark.v1",
    generated_at_utc: new Date().toISOString(),
    host: {
      hostname: hostname(),
      platform: platform(),
      architecture: arch(),
      release: release(),
      node: process.version,
    },
    curve: "y^2=x^5+x+1",
    interval_start: 3,
    chunk_size: config.chunkSize,
    repeat: config.repeat,
    samples: [],
  };
  try {
    await session.evaluate(
      "R=PolynomialRing(QQ,'x'); x=R.gen(); C=HyperellipticCurve(x^5+x+1)",
    );
    addon.smalljacLpolyBatch("x^5+x+1", 3n, 101n);
    await evaluateMode(session, "coefficients", 101, config.chunkSize);
    for (const limit of config.limits) {
      for (let repetition = 0; repetition < config.repeat; repetition += 1) {
        const packed = timed(() =>
          addon.smalljacLpolyBatch("x^5+x+1", 3n, BigInt(limit)),
        );
        const sample = {
          limit,
          repetition,
          packed: {
            wall_ms: packed.wall_ms,
            cpu_user_ms: packed.cpu_user_ms,
            cpu_system_ms: packed.cpu_system_ms,
            rss_bytes: packed.rss_bytes,
            rows: packed.value.rowCount,
            exact_stream_sha256: packedDigest(packed.value),
          },
          modes: {},
        };
        for (const mode of [
          "coefficients",
          "public_polynomials",
          "records_coefficients",
          "records_polynomials",
        ]) {
          const measured = await timedAsync(() =>
            evaluateMode(session, mode, limit, config.chunkSize),
          );
          sample.modes[mode] = {
            wall_ms: measured.wall_ms,
            cpu_user_ms: measured.cpu_user_ms,
            cpu_system_ms: measured.cpu_system_ms,
            rss_bytes: measured.rss_bytes,
            exact_checksum: measured.value,
          };
        }
        const checksums = Object.values(sample.modes).map(
          (mode) => mode.exact_checksum,
        );
        if (!checksums.every((checksum) => checksum === checksums[0])) {
          throw new Error(`exact public checksums disagree at limit ${limit}`);
        }
        receipt.samples.push(sample);
      }
    }
  } finally {
    await session.close();
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

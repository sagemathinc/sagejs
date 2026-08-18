"use strict";

const { createHash } = require("node:crypto");
const { hostname, platform, arch, release } = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

const { createSage } = require("../../dist/tools/kernel.js");
const corpus = require("../../test/data/hyperelliptic-rforest/genus3-oracle.json");
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
  const answer = { limit: 1009, repeat: 3 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--limit") answer.limit = Number(argv[++index]);
    else if (argv[index] === "--repeat") answer.repeat = Number(argv[++index]);
    else throw new Error(`unknown argument ${argv[index]}`);
  }
  if (
    !Number.isInteger(answer.limit) ||
    answer.limit < 5 ||
    answer.limit > 2 ** 31 - 1 ||
    !Number.isInteger(answer.repeat) ||
    answer.repeat < 1
  ) {
    throw new Error("limit and repeat must be positive bounded integers");
  }
  return answer;
}

function timed(callback) {
  const cpu = process.cpuUsage();
  const started = performance.now();
  const value = callback();
  const used = process.cpuUsage(cpu);
  return {
    value,
    sample: {
      wall_ms: performance.now() - started,
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
  const used = process.cpuUsage(cpu);
  return {
    value,
    sample: {
      wall_ms: performance.now() - started,
      cpu_user_ms: used.user / 1000,
      cpu_system_ms: used.system / 1000,
      rss_bytes: process.memoryUsage().rss,
    },
  };
}

function packedHash(batch) {
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

function oracleDerivedOrderValues(limit) {
  const rows = corpus.records.filter(
    (row) => row.curve === "odd_monic_sparse" && row.p <= limit,
  );
  return {
    orders: Object.fromEntries(
      rows.map((row) => [row.p, row.lpolynomial.reduce((a, b) => a + b)]),
    ),
    twists: Object.fromEntries(
      rows.map((row) => [
        row.p,
        row.lpolynomial.reduce(
          (sum, coefficient, index) =>
            sum + (index % 2 === 0 ? coefficient : -coefficient),
          0,
        ),
      ]),
    ),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const evidence = oracleDerivedOrderValues(options.limit);
  const session = await createSage();
  const output = {
    schema: "sagejs.hyperelliptic-rforest-benchmark.v1",
    generated_at_utc: new Date().toISOString(),
    host: {
      hostname: hostname(),
      platform: platform(),
      architecture: arch(),
      release: release(),
      node: process.version,
    },
    backend: addon.rforestCapabilities(),
    curve: "y^2=x^7+x+1",
    interval: [2, options.limit],
    oracle_derived_order_primes: Object.keys(evidence.orders).map(Number),
    samples: [],
  };
  try {
    await session.evaluate(
      [
        "R=PolynomialRing(QQ,'x')",
        "x=R.gen()",
        "C=HyperellipticCurve(x^7+x+1)",
        "from sagejs.hyperelliptic_curves.rforest import rforest_hasse_witt_rows",
        "from sagejs.hyperelliptic_curves.genus3_completion import complete_genus3_lpolynomial, enumerate_genus3_weil_candidates",
        `orders={int(k):v for k,v in ${JSON.stringify(evidence.orders)}.items()}`,
        `twists={int(k):v for k,v in ${JSON.stringify(evidence.twists)}.items()}`,
      ].join("\n"),
    );
    const coefficients = new BigUint64Array([
      1n,
      1n,
      0n,
      0n,
      0n,
      0n,
      0n,
      1n,
    ]);
    addon.rforestHasseWittBatch(coefficients, 3, 2n, 101n);
    await session.evaluate("batch=rforest_hasse_witt_rows(C,2,101)");

    for (let repetition = 0; repetition < options.repeat; repetition += 1) {
      const raw = timed(() =>
        addon.rforestHasseWittBatch(
          coefficients,
          3,
          2n,
          BigInt(options.limit),
        ),
      );
      const modular = await timedAsync(() =>
        session.evaluate(
          `batch=rforest_hasse_witt_rows(C,2,${options.limit})\n` +
            "[len(batch['rows']),sum(1 for r in batch['rows'] if r['available'])]",
          { timeout: 3_600_000 },
        ),
      );
      const candidates = await timedAsync(() =>
        session.evaluate(
          "candidate_sets=[enumerate_genus3_weil_candidates(" +
            "r['prime'],r['residues']) for r in batch['rows'] if r['available']]\n" +
            "[len(candidate_sets),sum(v['candidate_count'] for v in candidate_sets)," +
            "max(v['candidate_count'] for v in candidate_sets)]",
          { timeout: 3_600_000 },
        ),
      );
      const completion = await timedAsync(() =>
        session.evaluate(
          "completed=[complete_genus3_lpolynomial(" +
            "r['prime'],r['residues'],jacobian_order=orders.get(r['prime'])," +
            "twist_order=twists.get(r['prime'])) " +
            "for r in batch['rows'] if r['available']]\n" +
            "[len(completed),sum(1 for v in completed if v['status']=='unique')," +
            "sum(1 for v in completed if v['status']=='indeterminate')]",
          { timeout: 3_600_000 },
        ),
      );
      output.samples.push({
        repetition,
        raw_native: {
          ...raw.sample,
          rows: raw.value.rowCount,
          required_rows: raw.value.requiredRows,
          exact_stream_sha256: packedHash(raw.value),
        },
        modular_python_boundary: {
          ...modular.sample,
          summary: modular.value.repr,
        },
        exact_candidate_enumeration: {
          ...candidates.sample,
          summary: candidates.value.repr,
        },
        oracle_order_twist_filtering: {
          ...completion.sample,
          summary: completion.value.repr,
        },
      });
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

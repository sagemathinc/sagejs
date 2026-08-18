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

const KNOWN_STAGES = new Set([
  "raw",
  "candidates",
  "certification",
  "public",
]);

function parseIntegerList(text, name) {
  const values = text.split(",").map(Number);
  if (
    values.length === 0 ||
    values.some((value) => !Number.isInteger(value) || value < 2)
  ) {
    throw new Error(`${name} must be a comma-separated list of integers >= 2`);
  }
  return values;
}

function parseArguments(argv) {
  const answer = {
    limits: [10_000, 100_000, 1_000_000],
    repeat: 1,
    stages: new Set(KNOWN_STAGES),
    allowIncomplete: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--limits") {
      answer.limits = parseIntegerList(argv[++index], "limits");
    } else if (argument === "--repeat") {
      answer.repeat = Number(argv[++index]);
    } else if (argument === "--stages") {
      answer.stages = new Set(argv[++index].split(","));
    } else if (argument === "--quick") {
      answer.limits = [101];
      answer.repeat = 1;
    } else if (argument === "--allow-incomplete") {
      answer.allowIncomplete = true;
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }
  if (!Number.isInteger(answer.repeat) || answer.repeat < 1) {
    throw new Error("repeat must be a positive integer");
  }
  for (const stage of answer.stages) {
    if (!KNOWN_STAGES.has(stage)) throw new Error(`unknown stage ${stage}`);
  }
  answer.limits = [...new Set(answer.limits)].sort((left, right) => left - right);
  return answer;
}

function measurement(callback) {
  const cpu = process.cpuUsage();
  const started = performance.now();
  const value = callback();
  const used = process.cpuUsage(cpu);
  return {
    value,
    timing: {
      wall_ms: performance.now() - started,
      cpu_user_ms: used.user / 1000,
      cpu_system_ms: used.system / 1000,
      rss_bytes: process.memoryUsage().rss,
    },
  };
}

async function measurementAsync(callback) {
  const cpu = process.cpuUsage();
  const started = performance.now();
  const value = await callback();
  const used = process.cpuUsage(cpu);
  return {
    value,
    timing: {
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

function errorRecord(error) {
  return {
    error: String(error && error.message ? error.message : error),
    name: String(error && error.name ? error.name : "Error"),
  };
}

const SETUP = [
  "R=PolynomialRing(QQ,'x')",
  "x=R.gen()",
  "C=HyperellipticCurve(x^7+x+1)",
  "from sagejs.hyperelliptic_curves.rforest import rforest_hasse_witt_rows",
  "from sagejs.hyperelliptic_curves.genus3_completion import enumerate_genus3_weil_candidates",
  "digest_mod=2^127-1",
  "def digest_step(value,item):",
  "    return (value*1000003+int(item)+1000000007)%digest_mod",
].join("\n");

function candidateProgram(limit) {
  return [
    `batch=rforest_hasse_witt_rows(C,2,${limit})`,
    "candidate_rows=0",
    "candidate_total=0",
    "candidate_max=0",
    "candidate_digest=0",
    "for row in batch['rows']:",
    "    if row['available']:",
    "        result=enumerate_genus3_weil_candidates(row['prime'],row['residues'])",
    "        count=result['candidate_count']",
    "        candidate_rows+=1",
    "        candidate_total+=count",
    "        candidate_max=max(candidate_max,count)",
    "        candidate_digest=digest_step(candidate_digest,row['prime'])",
    "        candidate_digest=digest_step(candidate_digest,count)",
    "{'rows':candidate_rows,'candidate_total':candidate_total,'candidate_max':candidate_max,'stream_digest':candidate_digest}",
  ].join("\n");
}

function certificationProgram(limit) {
  return [
    "import time",
    "from sagejs.hyperelliptic_curves.certified_genus3 import rforest_genus3_local_factors",
    "stage_starts={}",
    "stage_ms={'residue':0,'candidate':0,'primary':0,'twist':0,'fallback':0}",
    "def observe(event,details):",
    "    stage=event.rsplit('_',1)[0]",
    "    if event.endswith('_start'):",
    "        stage_starts[stage]=time.perf_counter()",
    "    elif event.endswith('_end') and stage in stage_starts:",
    "        stage_ms[stage]+=1000*(time.perf_counter()-stage_starts.pop(stage))",
    `certified=rforest_genus3_local_factors(C,2,${limit},stage_observer=observe)`,
    "cert_digest=0",
    "cert_counts={'unique':0,'fallback':0,'omitted':0}",
    "cert_primary_samples=0",
    "cert_primary_ops=0",
    "cert_twist_samples=0",
    "cert_twist_ops=0",
    "for prime,completion in certified:",
    "    status=completion['status']",
    "    if status in cert_counts:",
    "        cert_counts[status]+=1",
    "    certificate=completion.get('certificate') or {}",
    "    primary=certificate.get('jacobian',{})",
    "    twist=certificate.get('twist',{})",
    "    cert_primary_samples+=int(primary.get('certificate_count',0))",
    "    cert_primary_ops+=int(primary.get('scalar_multiplications',0))",
    "    cert_twist_samples+=int(twist.get('certificate_count',0))",
    "    cert_twist_ops+=int(twist.get('scalar_multiplications',0))",
    "    factor=completion.get('coefficients')",
    "    if factor is not None:",
    "        cert_digest=digest_step(cert_digest,prime)",
    "        for coefficient in factor:",
    "            cert_digest=digest_step(cert_digest,coefficient)",
    "{'rows':len(certified),'status_counts':cert_counts,'primary_samples':cert_primary_samples,'primary_ops':cert_primary_ops,'twist_samples':cert_twist_samples,'twist_ops':cert_twist_ops,'stage_ms':stage_ms,'exact_stream_digest':cert_digest}",
  ].join("\n");
}

function publicProgram(limit) {
  return [
    "C_public=HyperellipticCurve(x^7+x+1)",
    "public_rows=0",
    "public_digest=0",
    `for chunk in C_public.local_lpolynomial_chunks(2,${limit},algorithm='rforest'):` ,
    "    for prime,factor in chunk:",
    "        public_rows+=1",
    "        public_digest=digest_step(public_digest,prime)",
    "        for coefficient in factor.list():",
    "            public_digest=digest_step(public_digest,coefficient)",
    "{'rows':public_rows,'exact_stream_digest':public_digest}",
  ].join("\n");
}

async function evaluateStage(session, program) {
  const result = await measurementAsync(() =>
    session.evaluate(program, { timeout: 24 * 60 * 60 * 1000 }),
  );
  return { ...result.timing, summary: result.value.repr };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const output = {
    schema: "sagejs.hyperelliptic-genus3-certified-benchmark.v1",
    generated_at_utc: new Date().toISOString(),
    host: {
      hostname: hostname(),
      platform: platform(),
      architecture: arch(),
      release: release(),
      node: process.version,
    },
    curve: "y^2=x^7+x+1",
    interval_start: 2,
    limits: options.limits,
    repeat: options.repeat,
    stages: [...options.stages],
    backend: addon.rforestCapabilities(),
    samples: [],
  };
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
  const session = await createSage();
  let incomplete = false;
  try {
    await session.evaluate(SETUP);
    addon.rforestHasseWittBatch(coefficients, 3, 2n, 101n);
    for (const limit of options.limits) {
      for (let repetition = 0; repetition < options.repeat; repetition += 1) {
        const sample = { limit, repetition };
        if (options.stages.has("raw")) {
          try {
            const result = measurement(() =>
              addon.rforestHasseWittBatch(coefficients, 3, 2n, BigInt(limit)),
            );
            sample.raw_rforest = {
              ...result.timing,
              rows: result.value.rowCount,
              required_rows: result.value.requiredRows,
              exact_stream_sha256: packedHash(result.value),
            };
          } catch (error) {
            sample.raw_rforest = errorRecord(error);
            incomplete = true;
          }
        }
        for (const [stage, program] of [
          ["candidates", candidateProgram(limit)],
          ["certification", certificationProgram(limit)],
          ["public", publicProgram(limit)],
        ]) {
          if (!options.stages.has(stage)) continue;
          try {
            sample[stage] = await evaluateStage(session, program);
          } catch (error) {
            sample[stage] = errorRecord(error);
            incomplete = true;
          }
        }
        output.samples.push(sample);
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
  if (incomplete && !options.allowIncomplete) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
